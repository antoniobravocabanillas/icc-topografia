"""Encrypted source backup and isolated local restore; never changes production.

Windows PostgreSQL 18 tools and cryptography are required. Source credentials
are inherited only by database clients. A single exported read-only snapshot
binds the archive and checksums to the same committed source state.
"""
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import ssl
import subprocess
import sys
from urllib.parse import unquote, urlsplit, parse_qs
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
BIN = Path("C:/Program Files/PostgreSQL/18/bin")
PORT = "55438"

def command(args, environment=None, timeout=180, input_text=None):
    # A daemon must not inherit capture pipes: otherwise communicate() waits
    # for the PostgreSQL server even after pg_ctl itself has exited.
    daemon_start = Path(args[0]).name == "pg_ctl.exe" and args[-1] == "start"
    result = subprocess.run(args, env=environment, input=input_text, stdout=subprocess.DEVNULL if daemon_start else subprocess.PIPE, stderr=subprocess.DEVNULL if daemon_start else subprocess.PIPE, text=True, encoding="utf-8", timeout=timeout)
    if result.returncode:
        print(json.dumps({"failed_tool":Path(args[0]).name,"exit_code":result.returncode,"categories":[name for name in ("does not exist", "permission denied", "extension", "unrecognized", "duplicate key", "connection", "collation", "syntax error") if name in (result.stderr or '').lower()]}), flush=True)
        raise RuntimeError("Database migration rehearsal command failed; private diagnostics suppressed.")
    return (result.stdout or "").strip()

def query(process, sql):
    process.stdin.write(sql + ";\n")
    process.stdin.flush()
    value = process.stdout.readline().strip()
    if not value:
        raise RuntimeError("Read-only snapshot query failed.")
    return value

def session(environment):
    return subprocess.Popen([str(BIN / "psql.exe"), "-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1"], env=environment, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding="utf-8", creationflags=subprocess.CREATE_NO_WINDOW)

def fingerprint(process, tables):
    statements = []
    for table in tables:
        identifier = table.replace('"', '""')
        literal = table.replace("'", "''")
        # Sorting row hashes makes comparison independent of physical row order.
        statements.append(f'''SELECT '{literal}' AS name, json_build_object('rows',count(*)::text,'digest',encode(sha256(convert_to(coalesce(string_agg(h,',' ORDER BY h),''),'UTF8')),'hex')) AS details FROM (SELECT encode(sha256(convert_to(row_to_json(t)::text,'UTF8')),'hex') h FROM icc."{identifier}" t) rows''')
    return json.loads(query(process, "SELECT json_object_agg(name, details) FROM (" + " UNION ALL ".join(statements) + ") metrics"))

def structure(process):
    query(process, "SET search_path=icc,pg_catalog; SELECT 'ready'")
    queries = {
        "columns": "SELECT coalesce(json_agg(json_build_array(table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default) ORDER BY table_name,ordinal_position),'[]') FROM information_schema.columns WHERE table_schema='icc'",
        "constraints": "SELECT coalesce(json_agg(json_build_array(c.conname,c.conrelid::regclass::text,c.contype,pg_get_constraintdef(c.oid),c.convalidated) ORDER BY c.conname,c.conrelid::regclass::text),'[]') FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='icc' AND c.contype<>'n'",
        "indexes": "SELECT coalesce(json_agg(json_build_array(indexname,indexdef) ORDER BY indexname),'[]') FROM pg_indexes WHERE schemaname='icc'",
        "enums": "SELECT coalesce(json_agg(json_build_array(t.typname,e.enumlabel,e.enumsortorder) ORDER BY t.typname,e.enumsortorder),'[]') FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='icc'",
        "triggers": "SELECT coalesce(json_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname),'[]') FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='icc' AND NOT t.tgisinternal",
        "sequences": "SELECT coalesce(json_agg(json_build_array(sequencename,start_value,min_value,max_value,increment_by,cycle,last_value) ORDER BY sequencename),'[]') FROM pg_sequences WHERE schemaname='icc'",
    }
    return {name:json.loads(query(process,sql)) for name,sql in queries.items()}

def main():
    inventory = json.loads((ROOT / "tmp/migration-inventory.json").read_text(encoding="utf-8-sig"))
    if inventory.get("same_catalog_and_workspace_fingerprint") is not True:
        raise RuntimeError("Source identity comparison must pass first.")
    rows = (ROOT / ".env").read_text(encoding="utf-8").splitlines()
    url = urlsplit(next(line.split("=",1)[1].strip().strip('\"').strip("'") for line in rows if line.startswith("DATABASE_URL=")))
    if url.hostname != "db.prisma.io":
        raise RuntimeError("Unexpected direct source host.")
    source_env = dict(os.environ, PGHOST=url.hostname, PGPORT=str(url.port or 5432), PGDATABASE=unquote(url.path.lstrip('/')), PGUSER=unquote(url.username or ''), PGPASSWORD=unquote(url.password or ''), PGSSLMODE="require", PGCONNECT_TIMEOUT="15", PGOPTIONS="-c statement_timeout=60000 -c timezone=UTC -c extra_float_digits=3")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    private = Path.home() / ".terraqo-private" / f"migration-{stamp}"
    private.mkdir(parents=True, exist_ok=False)
    sid = command(["powershell", "-NoProfile", "-Command", "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value"])
    command(["icacls", str(private), "/inheritance:r", "/grant:r", f"*{sid}:(OI)(CI)F", "*S-1-5-18:(OI)(CI)F"])
    # libpq on Windows does not automatically use the Windows certificate
    # store. Export trusted roots to verify both the CA chain and hostname.
    roots = "".join(ssl.DER_cert_to_PEM_cert(certificate) for certificate, encoding, trust in ssl.enum_certificates("ROOT") if encoding == "x509_asn" and (trust is True or ssl.Purpose.SERVER_AUTH.oid in trust))
    certificate_file = private / "trusted-roots.pem"
    certificate_file.write_text(roots, encoding="ascii")
    source_env.update(PGSSLMODE="verify-full", PGSSLROOTCERT=str(certificate_file))
    archive = private / "source.dump"
    cluster = private / "rehearsal-cluster"
    password_file = private / "local-password"
    source, target, started = None, None, False
    try:
        source = session(source_env)
        query(source, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT pg_export_snapshot()")
        # Export once, hold the transaction open through dump and fingerprints.
        snapshot = query(source, "SELECT pg_export_snapshot()")
        tables = json.loads(query(source, "SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='icc'"))
        print(f"Exporting consistent snapshot: {len(tables)} application tables.", flush=True)
        command([str(BIN / "pg_dump.exe"), "-w", "--format=custom", "--schema=icc", "--no-owner", "--no-acl", "--snapshot", snapshot, "--file", str(archive)], source_env)
        source_hashes = fingerprint(source, tables)
        source_structure = structure(source)
        (private / "source-checksums.json").write_text(json.dumps(source_hashes, indent=2), encoding="utf-8")
        query(source, "ROLLBACK; SELECT 'closed'")
        source.stdin.close(); source.wait(timeout=15); source = None
        data = archive.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        key, nonce = AESGCM.generate_key(bit_length=256), secrets.token_bytes(12)
        encrypted = AESGCM(key).encrypt(nonce, data, b"Terraqo database migration v1")
        (private / "source.dump.aesgcm").write_bytes(nonce + encrypted)
        protected_key = command(["powershell", "-NoProfile", "-Command", "Add-Type -AssemblyName System.Security; $inputKey=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); [Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Protect($inputKey,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser))"], input_text=base64.b64encode(key).decode('ascii'))
        (private / "key.dpapi").write_text(protected_key, encoding="ascii")
        recovered = command(["powershell", "-NoProfile", "-Command", "Add-Type -AssemblyName System.Security; $protectedKey=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); [Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Unprotect($protectedKey,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser))"], input_text=protected_key)
        restored = AESGCM(base64.b64decode(recovered)).decrypt(nonce, encrypted, b"Terraqo database migration v1")
        if hashlib.sha256(restored).hexdigest() != digest:
            raise RuntimeError("Encrypted backup verification failed.")
        archive.write_bytes(restored)
        local_password = secrets.token_urlsafe(32)
        password_file.write_text(local_password, encoding="ascii")
        command([str(BIN / "initdb.exe"), "-D", str(cluster), "-U", "terraqo_rehearsal", "--pwfile", str(password_file), "--auth-host=scram-sha-256", "--auth-local=scram-sha-256", "--encoding=UTF8", "--locale=C"])
        password_file.unlink()
        started = True
        command([str(BIN / "pg_ctl.exe"), "-D", str(cluster), "-l", str(private / "local-server.log"), "-o", f"-h 127.0.0.1 -p {PORT}", "-w", "start"])
        local_env = dict(source_env, PGHOST="127.0.0.1", PGPORT=PORT, PGDATABASE="postgres", PGUSER="terraqo_rehearsal", PGPASSWORD=local_password, PGSSLMODE="disable")
        command([str(BIN / "pg_restore.exe"), "-w", "--exit-on-error", "--single-transaction", "--no-owner", "--no-acl", "--dbname=postgres", str(archive)], local_env)
        print("Isolated archive restore completed; comparing all table checksums.", flush=True)
        target = session(local_env)
        target_hashes = fingerprint(target, tables)
        target_structure = structure(target)
        if source_hashes != target_hashes:
            print(json.dumps({"differing_tables":[name for name in source_hashes if source_hashes[name] != target_hashes.get(name)]}), flush=True)
            raise RuntimeError("Restore row counts or checksums differ.")
        if source_structure != target_structure:
            print(json.dumps({"differing_structure_categories":[name for name in source_structure if source_structure[name] != target_structure.get(name)]}),flush=True)
            raise RuntimeError("Restore schema definitions differ.")
        # PostgreSQL 18 adds NOT NULL entries to pg_constraint. Compare the
        # constraint types represented in the PG17 source catalog; nullability
        # must also be verified through information_schema.columns.
        constraints = query(target, "SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='icc' AND c.contype <> 'n'")
        indexes = query(target, "SELECT count(*) FROM pg_indexes WHERE schemaname='icc'")
        print(json.dumps({"source_objects":inventory['direct']['objects'][0], "restored_objects":{"constraints":constraints,"indexes":indexes}, "table_checksums_match":True}), flush=True)
        if constraints != inventory['direct']['objects'][0]['constraints'] or indexes != inventory['direct']['objects'][0]['indexes']:
            raise RuntimeError("Restore structural objects differ.")
        manifest = {"created_utc":stamp,"source_version":inventory['direct']['metadata'][0]['version'],"restore_version":"18.4","tables":len(tables),"rows":sum(int(x['rows']) for x in source_hashes.values()),"constraints":int(constraints),"indexes":int(indexes),"archive_sha256":digest,"encrypted_backup_verified":True,"table_checksums_match":True,"schema_definitions_match":True,"source_tls_mode":"verify-full","row_digest_algorithm":"SHA256","source_schema_fingerprint":inventory['direct']['schemaFingerprint'],"table_checksums":source_hashes,"limitations":["Application schema icc only; provider system schemas excluded", "External file blobs require separate inventory", "Local PG18 rehearsal; Supabase PG17 rehearsal still required", "DPAPI recovery key is bound to this Windows user; off-device recovery copy pending"]}
        (private / "manifest.json").write_text(json.dumps(manifest,indent=2),encoding="utf-8")
        print(json.dumps({k:v for k,v in manifest.items() if k!='table_checksums'},indent=2), flush=True)
        print(f"Protected backup location: {private}", flush=True)
    finally:
        for process in (source,target):
            if process and process.poll() is None:
                process.terminate(); process.wait(timeout=15)
        try:
            if started:
                command([str(BIN / "pg_ctl.exe"), "-D", str(cluster), "-m", "fast", "-w", "stop"])
        finally:
            archive.unlink(missing_ok=True)
            password_file.unlink(missing_ok=True)
        # Only remove this newly created, stopped rehearsal cluster.
        if cluster.exists() and cluster.resolve().parent == private.resolve():
            status = subprocess.run([str(BIN / "pg_ctl.exe"), "-D", str(cluster), "status"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
            if status.returncode != 0:
                shutil.rmtree(cluster)

if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, KeyError, OSError, subprocess.SubprocessError) as error:
        print(str(error) if isinstance(error, RuntimeError) else "Migration rehearsal failed safely; private diagnostics suppressed.", flush=True)
        raise SystemExit(1)
