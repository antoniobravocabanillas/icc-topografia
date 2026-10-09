"""Read-only source schema export into a disposable loopback PostgreSQL 17/18 cluster.

No source rows, password files, production DDL, migration ledger writes or jobs.
Passwords and the schema dump stay in memory. Local authentication is changed
from empty-cluster bootstrap trust to SCRAM before restoring any application schema.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
BIN = Path(os.environ.get("TERRAQO_LOCAL_POSTGRES_BIN", "C:/Program Files/PostgreSQL/18/bin")).resolve()
MIGRATIONS = (
    "20261008051000_native_worklog_operations",
    "20261008161000_native_worklog_decision",
    "20261008162500_native_worklog_content_key",
    "20261008232500_native_worklog_authority_snapshot",
    "20261009035000_native_worklog_first_decision",
)


def run(args, env=None, text=None, daemon=False, timeout=120):
    result = subprocess.run(args, env=env, input=text, text=True, encoding="utf-8",
                            stdout=subprocess.DEVNULL if daemon else subprocess.PIPE,
                            stderr=subprocess.DEVNULL if daemon else subprocess.PIPE,
                            timeout=timeout, creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:
        # Even SQL authentication errors can echo connection details. Never forward them.
        raise RuntimeError(f"Local schema check failed at {Path(args[0]).name}")
    return (result.stdout or "").strip()


def sql(env, statement):
    return run([str(BIN / "psql.exe"), "-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1"],
               env, statement, timeout=60)


def canonical(value):
    # Sequence last_value belongs to data, not schema, and can change during a read-only export.
    value = dict(value)
    value["sequences"] = [row[:-1] for row in value["sequences"]]
    return value


def main():
    # The trusted local tool path selects binaries, never source credentials or a database.
    local_version = run([str(BIN / "postgres.exe"), "--version"])
    local_major = int(local_version.split()[2].split(".")[0])
    if local_major not in (17, 18):
        raise RuntimeError("Unsupported isolated PostgreSQL major")
    if sys.argv[1:] not in ([], ["--concurrency"], ["--settlement"], ["--authority"], ["--executor-confirmed"], ["--executor-pending"], ["--validation-locks"], ["--reciprocal-workers"], ["--operations"], ["--schema-gate"], ["--bootstrap"]):
        raise RuntimeError("No external database or runner arguments accepted")
    spec = importlib.util.spec_from_file_location("schema_tools", ROOT / "scripts/rehearse-database-migration.py")
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    helper.BIN = BIN
    direct = next(line.split("=", 1)[1].strip().strip('"').strip("'")
                  for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines()
                  if line.startswith("DATABASE_URL="))
    url = urlsplit(direct)
    if url.scheme not in ("postgres", "postgresql") or url.hostname != "db.prisma.io":
        raise RuntimeError("Unexpected direct source")
    # Remove inherited database secrets before creating any local child process.
    base = {key: value for key, value in os.environ.items()
            if not key.startswith("PG") and key not in ("DATABASE_URL", "DIRECT_URL")}
    parent = (ROOT / "tmp").resolve()
    parent.mkdir(exist_ok=True)
    private = Path(tempfile.mkdtemp(prefix="native-schema-own-", dir=parent)).resolve()
    cluster = private / "cluster"
    if private.parent != parent or not private.name.startswith("native-schema-own-"):
        raise RuntimeError("Temporary ownership boundary rejected")
    source = target = None
    started = False
    stopped = False
    try:
        sid = run(["powershell", "-NoProfile", "-Command",
                   "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value"])
        run(["icacls", str(private), "/inheritance:r", "/grant:r",
             f"*{sid}:(OI)(CI)F", "*S-1-5-18:(OI)(CI)F"])
        roots = "".join(ssl.DER_cert_to_PEM_cert(cert) for cert, encoding, trust in ssl.enum_certificates("ROOT")
                        if encoding == "x509_asn" and (trust is True or ssl.Purpose.SERVER_AUTH.oid in trust))
        certificate = private / "trusted-roots.pem"
        certificate.write_text(roots, encoding="ascii")
        source_env = dict(base, PGHOST=url.hostname, PGPORT=str(url.port or 5432),
                          PGDATABASE=unquote(url.path.lstrip("/")), PGUSER=unquote(url.username or ""),
                          PGPASSWORD=unquote(url.password or ""), PGSSLMODE="verify-full",
                          PGSSLROOTCERT=str(certificate), PGCONNECT_TIMEOUT="15",
                          PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=60000 -c timezone=UTC")
        source = helper.session(source_env)
        version = int(helper.query(source, "SELECT current_setting('server_version_num')"))
        if version // 10000 != 17:
            raise RuntimeError("Source version changed; inspect before comparison")
        before = canonical(helper.structure(source))
        reserved = int(helper.query(source, "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='icc' AND (c.relname LIKE 'NativeWorklog%' OR c.relname LIKE 'TerraqoNativeWorklog%')"))
        if reserved:
            raise RuntimeError("Source native schema no longer absent")
        dump = run([str(BIN / "pg_dump.exe"), "-w", "--schema-only", "--schema=icc",
                    "--no-owner", "--no-acl"], source_env)
        after = canonical(helper.structure(source))
        if before != after:
            raise RuntimeError("Source schema changed during export")
        source.stdin.close()
        source.wait(timeout=15)
        source = None
        # An OS-assigned free port avoids reusing any historical rehearsal service.
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        role = "terraqo_own_schema"
        run([str(BIN / "initdb.exe"), "-D", str(cluster), "-U", role,
             "--auth-host=trust", "--auth-local=trust", "--encoding=UTF8", "--locale=C"], base)
        with (cluster / "postgresql.conf").open("a", encoding="utf-8") as config:
            config.write("\ntimezone='UTC'\nlog_statement='none'\nlog_min_error_statement='panic'\nlog_connections=off\nlog_disconnections=off\n")
        started = True
        run([str(BIN / "pg_ctl.exe"), "-D", str(cluster), "-l", str(private / "server.log"),
             "-o", f"-h 127.0.0.1 -p {port}", "-w", "start"], base, daemon=True)
        local = dict(base, PGHOST="127.0.0.1", PGPORT=str(port), PGDATABASE="postgres", PGUSER=role,
                     PGSSLMODE="disable", PGCONNECT_TIMEOUT="5", PGOPTIONS="-c timezone=UTC")
        password = secrets.token_hex(32)
        # Hex password is generated internally; statement is stdin-only and never logged.
        sql(local, f"ALTER ROLE {role} PASSWORD '{password}';")
        (cluster / "pg_hba.conf").write_text("host all all 127.0.0.1/32 scram-sha-256\n", encoding="ascii")
        run([str(BIN / "pg_ctl.exe"), "-D", str(cluster), "reload"], base)
        local["PGPASSWORD"] = password
        # A fresh unauthenticated connection must fail after the bootstrap trust window.
        rejected = subprocess.run([str(BIN / "psql.exe"), "-X", "-qAt", "-w", "-c", "SELECT 1"],
                                  env={key: value for key, value in local.items() if key != "PGPASSWORD"},
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
        if rejected.returncode == 0:
            raise RuntimeError("Local password enforcement failed")
        sql(local, "CREATE DATABASE terraqo_own_native_schema;")
        local["PGDATABASE"] = "terraqo_own_native_schema"
        sql(local, dump)
        dump = None
        target = helper.session(local)
        if int(helper.query(target, "SELECT current_setting('server_version_num')")) // 10000 != local_major:
            raise RuntimeError("Isolated server major differs from selected binaries")
        restored = canonical(helper.structure(target))
        if before != restored:
            raise RuntimeError("Schema-only local definitions differ")
        count_sql = " UNION ALL ".join('SELECT count(*) n FROM icc."' + table.replace('"', '""') + '"'
                                       for table in sorted({row[0] for row in before["columns"]}))
        if int(helper.query(target, "SELECT coalesce(sum(n),0) FROM (" + count_sql + ") empty_tables")) != 0:
            raise RuntimeError("Local imported tables contain data")
        for migration in MIGRATIONS:
            sql(local, (ROOT / "prisma/migrations" / migration / "migration.sql").read_text(encoding="utf-8"))
        native = json.loads(helper.query(target, "SELECT json_build_object('tables',count(DISTINCT c.oid),'constraints',(SELECT count(*) FROM pg_constraint k JOIN pg_class t ON t.oid=k.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='icc' AND t.relname LIKE 'TerraqoNativeWorklog%' AND k.contype<>'n'),'indexes',(SELECT count(*) FROM pg_indexes WHERE schemaname='icc' AND (tablename LIKE 'TerraqoNativeWorklog%' OR indexname='NativeWorklogFirst_contribution_actor_key'))) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='icc' AND c.relkind='r' AND c.relname LIKE 'TerraqoNativeWorklog%'"))
        if native != {"tables": 5, "constraints": 36, "indexes": 16}:
            raise RuntimeError("Local native object counts differ")
        pid = int(helper.query(target, "SELECT pg_backend_pid()"))
        other_pid = int(sql(local, "SELECT pg_backend_pid();"))
        if pid == other_pid:
            raise RuntimeError("Independent connections not established")
        if sys.argv[1:]:
            marker = secrets.token_hex(16)
            sql(local, f"CREATE TABLE public.terraqo_owned_schema_test(marker text NOT NULL); INSERT INTO public.terraqo_owned_schema_test VALUES ('{marker}');")
            node_env = dict(base, NODE_ENV="production", TERRAQO_LOCAL_SCHEMA_MARKER=marker,
                            DATABASE_URL=f"postgresql://{role}:{password}@127.0.0.1:{port}/terraqo_own_native_schema?schema=icc&connection_limit=3")
            runner = {"--settlement": "scripts/test-native-worklog-local-settlement.ts",
                      "--authority": "scripts/test-native-worklog-local-authority.ts",
                      "--executor-confirmed": "scripts/test-native-worklog-local-settlement.ts",
                      "--executor-pending": "scripts/test-native-worklog-local-settlement.ts",
                      "--validation-locks": "scripts/test-native-worklog-local-settlement.ts",
                      "--reciprocal-workers": "scripts/test-native-worklog-local-settlement.ts",
                      "--operations": "scripts/test-native-worklog-local-settlement.ts",
                      "--schema-gate": "scripts/test-native-worklog-local-settlement.ts",
                      "--bootstrap": "scripts/test-native-worklog-local-settlement.ts",
                      "--concurrency": "scripts/test-native-worklog-local-concurrency.ts"}[sys.argv[1]]
            if sys.argv[1].startswith("--executor-"):
                node_env["TERRAQO_LOCAL_EXECUTOR_MODE"] = sys.argv[1].removeprefix("--executor-")
            if sys.argv[1] == "--validation-locks":
                node_env["TERRAQO_LOCAL_VALIDATION_LOCKS"] = "1"
            if sys.argv[1] == "--reciprocal-workers":
                node_env["TERRAQO_LOCAL_RECIPROCAL_WORKERS"] = "1"
            if sys.argv[1] == "--operations":
                node_env["TERRAQO_LOCAL_OPERATIONS"] = "1"
            if sys.argv[1] == "--schema-gate":
                node_env["TERRAQO_LOCAL_SCHEMA_GATE"] = "1"
            if sys.argv[1] == "--bootstrap":
                node_env["TERRAQO_LOCAL_BOOTSTRAP"] = "1"
            checked = subprocess.run([shutil.which("node"), "--conditions=react-server", "--import", "tsx",
                                      runner], cwd=ROOT, env=node_env,
                                     capture_output=True, text=True, encoding="utf-8", timeout=90)
            for line in (checked.stdout + "\n" + checked.stderr).splitlines():
                try:
                    report = json.loads(line)
                except ValueError:
                    continue
                allowed = {"outcome", "environment", "blocked_pairs", "same_key_receipts", "total_receipts",
                           "first_reservations", "first_credit", "first_ledgers", "jwt_http_proved",
                           "cross_owner_proved", "release_settlement_proved", "own_local_fixtures_absent", "category", "location", "sqlState", "diagnostics", "constraint",
                           "actual_transaction_rollback", "native_release_ledgers", "legacy_release_ledgers", "applied_once",
                           "first_ineligible_no_credit", "pending_retained", "confirmed_ack_exception", "network_cut_proved",
                           "owner_key_isolation", "grant_revoked_before_create", "role_demoted_before_create",
                           "revoke_after_commit_denies_read", "demote_after_commit_denies_read",
                           "new_grants_from_read", "accounting_credits", "validation_cross_owner_proved",
                           "executor_mode", "primary_rejected_reconciled", "phases_replayed", "attempts_charged",
                           "reciprocal_workers", "primary_transactions", "legacy_entries_unchanged", "validation_credits_unchanged",
                           "operations_boundary_proved", "rejected_commands_execute_calls", "concurrent_requests",
                           "deployed_http_proved", "production_secret_proved", "schema_gate_proved",
                           "catalog_constraints", "catalog_indexes", "rejected_schema_cases", "own_table_locks", "schema_case", "bootstrap_proved", "production_native_applied"}
                if isinstance(report, dict) and set(report) <= allowed:
                    print(json.dumps(report), flush=True)
            if checked.returncode:
                raise RuntimeError("Own local concurrency runner failed")
        print(json.dumps({"outcome": "passed", "source_major": 17, "local_major": local_major,
                          "schema_only_definitions_equal": True, "imported_rows": 0,
                          "source_native_objects": 0, "local_native_objects": native,
                          "independent_connections": 2, "password_enforced": True,
                          "schema_sha256": hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest(),
                          "concurrent_worklog_flows_proved": sys.argv[1:] in (["--concurrency"], ["--settlement"], ["--authority"], ["--validation-locks"], ["--reciprocal-workers"]),
                          "executor_flow_proved": sys.argv[1:] in (["--executor-confirmed"], ["--executor-pending"], ["--reciprocal-workers"], ["--operations"]),
                          "internal_operations_flow_proved": sys.argv[1:] == ["--operations"],
                          "schema_gate_proved": sys.argv[1:] == ["--schema-gate"],
                          "production_native_applied": False}), flush=True)
    finally:
        for process in (source, target):
            if process and process.poll() is None:
                process.terminate()
                process.wait(timeout=15)
        if started:
            run([str(BIN / "pg_ctl.exe"), "-D", str(cluster), "-m", "fast", "-w", "stop"], base)
            stopped = True
        # Resolve and prove ownership before recursively deleting only this new cluster directory.
        if private.resolve().parent == parent and private.name.startswith("native-schema-own-") and (not started or stopped):
            shutil.rmtree(private)
        else:
            raise RuntimeError("Owned cluster cleanup refused")
        print(json.dumps({"owned_cluster_stopped": not started or stopped, "owned_directory_removed": not private.exists()}), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"outcome": "failed", "category": type(error).__name__,
                          "private_diagnostics_suppressed": True}), flush=True)
        raise SystemExit(1)
