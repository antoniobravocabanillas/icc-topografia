import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { lstat, mkdtemp, readFile, writeFile, open, unlink, realpath, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { root, migrationName, candidate, sha256, tables, functions, schemaChecks,
  permissionChecks, prepareArtifact, expectedMembership, membershipQuery } from './prepare-s17-disclosure-staging-migration.mjs';

// Restores only into a newly owned loopback cluster. Never accepts a connection URL or inherited PG settings.
const execute = promisify(execFile);
let phase = 'arguments';
const checks = [];
const pass = label => { checks.push(label); console.log(`PASS ${label}`); };
const identifier = value => `"${value.replaceAll('"', '""')}"`;
const literal = value => `'${value.replaceAll("'", "''")}'`;

async function main() {
  const args = process.argv.slice(2);
  assert.equal(args.length, 2, 'Usage: node scripts/restore-s17-staging-local.mjs <backup-directory> --confirm=local-restore-only');
  assert.equal(args[1], '--confirm=local-restore-only');
  assert.ok(args[0] && !args[0].startsWith('--') && !args[0].includes('://'));
  const backup = await realpath(path.resolve(args[0]));
  const manifestPath = path.join(backup, 'manifest.json'), dump = path.join(backup, 'icc.dump');
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.projectRef, 'mghdpciewbsowjrjwmwk');
  assert.equal(manifest.siteId, '6b8c43fb-6083-450a-9b85-46a820fb6358');
  assert.equal(manifest.schema, 'icc');
  assert.equal(manifest.archiveReadable, true);
  assert.equal(manifest.remoteWrites, false);
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
  // The established backup manifest has no timestamp: require fresh file mtimes as well as its digest.
  for (const file of [manifestPath, dump]) {
    const stat = await lstat(file);
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'Backup inputs must be regular files');
    const age = Date.now() - stat.mtimeMs;
    assert.ok(age >= -300_000 && age <= 6 * 60 * 60 * 1000, 'Backup/manifest older than six hours or future-dated');
  }
  const dumpBytes = await readFile(dump);
  assert.equal(dumpBytes.length, manifest.bytes);
  assert.equal(sha256(dumpBytes), manifest.sha256);
  const artifact = path.join(root, 'output/s17-disclosure/staging-migration.sql');
  const receipt = JSON.parse(await readFile(path.join(root, 'output/s17-disclosure/staging-migration.json'), 'utf8'));
  const prepared = await prepareArtifact(receipt.audit);
  assert.equal(receipt.candidate, candidate);
  assert.equal(receipt.migrationName, migrationName);
  assert.equal(receipt.checksum, prepared.checksum);
  assert.equal(receipt.artifactSha256, prepared.artifactSha256);
  assert.equal(await readFile(artifact, 'utf8'), prepared.sql, 'Artifact changed after preparation');
  pass('fresh staging backup manifest, archive digest, exact candidate source and 49 audited checksums');

  const tempRoot = await realpath(os.tmpdir());
  const dir = await mkdtemp(path.join(tempRoot, 'terraqo-s17-restore-'));
  const ownedDirectory = await realpath(dir);
  assert.equal(path.dirname(ownedDirectory), tempRoot);
  const data = path.join(dir, 'data'), passwordFile = path.join(dir, 'password');
  const bin = 'C:/Program Files/PostgreSQL/18/bin';
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  const password = randomBytes(32).toString('hex');
  const env = { PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'local_restore',
    PGPASSWORD: password, PGCONNECT_TIMEOUT: '5', PGCLIENTENCODING: 'UTF8', PGSSLMODE: 'disable' };
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(path|systemroot|windir|temp|tmp|comspec|pathext)$/i.test(key)) env[key] = value;
  }
  const run = async (name, argv) => (await execute(path.join(bin, `${name}.exe`), argv,
    { cwd: dir, env, windowsHide: true, timeout: 120_000, maxBuffer: 32 * 1024 * 1024 })).stdout;
  const query = async sql => (await run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql])).trim();
  const apply = async () => {
    assert.equal(await readFile(artifact, 'utf8'), prepared.sql, 'Artifact changed during rehearsal');
    return run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', 'SET SESSION AUTHORIZATION postgres', '-f', artifact]);
  };
  let child, log, startupError, evidence;
  let cleanupComplete = false;
  try {
    phase = 'initialize owned loopback cluster';
    await writeFile(passwordFile, password, { flag: 'wx', mode: 0o600 });
    await run('initdb', ['-D', data, '-U', 'local_restore', '-A', 'scram-sha-256', '--pwfile', passwordFile, '--encoding=UTF8']);
    await unlink(passwordFile);
    log = await open(path.join(dir, 'postgres.log'), 'a');
    child = spawn(path.join(bin, 'postgres.exe'), ['-D', data, '-h', '127.0.0.1', '-p', String(port)],
      { cwd: dir, env, windowsHide: true, stdio: ['ignore', log.fd, log.fd] });
    child.once('error', error => { startupError = error; });
    let ready = false;
    for (let i = 0; i < 50; i++) {
      if (startupError) throw startupError;
      assert.equal(child.exitCode, null, 'Owned PostgreSQL exited during startup');
      try { await query('select 1'); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 200)); }
    }
    assert.ok(ready, 'Owned local cluster unavailable');
    const identity = JSON.parse(await query(`SELECT json_build_object('database',current_database(),'role',current_user,
      'host',host(inet_server_addr()),'port',inet_server_port(),'data',current_setting('data_directory'),
      'listeners',current_setting('listen_addresses'),'encoding',current_setting('server_encoding'))`));
    assert.deepEqual(identity, { database: 'postgres', role: 'local_restore', host: '127.0.0.1', port,
      data: data.replaceAll('\\', '/'), listeners: '127.0.0.1', encoding: 'UTF8' });
    assert.equal(Number((await readFile(path.join(data, 'postmaster.pid'), 'utf8')).split('\n')[0]), child.pid);
    const engine = await query('SELECT version()');
    pass('owned process, data directory, loopback listener and UTF8 verified');
    phase = 'restore verified backup';
    await run('pg_restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', '--dbname=postgres', dump]);
    const ledgerSql = `SELECT coalesce(json_agg(json_build_object('migration_name',migration_name,'checksum',checksum)
      ORDER BY migration_name),'[]') FROM icc._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const audited = [...receipt.audit.ledger].sort((a, b) => a.migration_name.localeCompare(b.migration_name));
    assert.deepEqual(JSON.parse(await query(ledgerSql)), audited);
    assert.equal(await query('SELECT count(*) FROM icc._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL'), '0');
    assert.equal(await query(`SELECT count(*) FROM pg_tables WHERE schemaname='icc' AND tablename IN ('TerraqoCertificateDisclosure','TerraqoCertificateDisclosureEvent')`), '0');
    const sourceTables = JSON.parse(await query(`SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='icc'`));
    assert.ok(tables.filter(t => !t.startsWith("TerraqoCertificateDisclosure")).every(t => sourceTables.includes(t)), 'Required source tables absent');
    // Every complete row is compared as canonical JSON. Hashes are kept in memory/evidence; payloads are never logged.
    const snapshot = async migrated => {
      const result = {};
      const currentTables = JSON.parse(await query(`SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='icc'`));
      assert.deepEqual(currentTables, migrated ? [...sourceTables,"TerraqoCertificateDisclosure","TerraqoCertificateDisclosureEvent"].sort() : sourceTables);
      for (const table of sourceTables) {
        const expression = 'to_jsonb(r)';
        const filter = migrated && table === '_prisma_migrations' ? `WHERE migration_name<>${literal(migrationName)}` : '';
        const rows = await query(`SELECT coalesce(jsonb_agg(payload ORDER BY payload),'[]') FROM
          (SELECT ${expression} AS payload FROM icc.${identifier(table)} r ${filter}) rows`);
        result[table] = { count: JSON.parse(rows).length, sha256: sha256(rows) };
      }
      return result;
    };
    const before = await snapshot(false);
    pass(`real backup restored: ledger49/unfinished0, ${sourceTables.length} complete table snapshots including invitations`);
    phase = 'recreate minimal staging role boundary';
    await query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE ROLE postgres CREATEROLE; CREATE ROLE supabase_admin CREATEROLE;
      CREATE ROLE terraqo_staging_migrator; CREATE ROLE terraqo_staging_runtime;
      GRANT terraqo_staging_migrator TO supabase_admin WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;
      SET SESSION AUTHORIZATION supabase_admin;
      GRANT terraqo_staging_migrator TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;
      RESET SESSION AUTHORIZATION;
      SET SESSION AUTHORIZATION postgres;
      GRANT terraqo_staging_migrator TO postgres WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
      RESET SESSION AUTHORIZATION;
      ALTER SCHEMA icc OWNER TO terraqo_staging_migrator;
      GRANT USAGE ON SCHEMA icc TO terraqo_staging_runtime;
      DO $owners$ DECLARE item record; BEGIN
        FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='icc' LOOP
          EXECUTE format('ALTER TABLE icc.%I OWNER TO terraqo_staging_migrator',item.tablename);
        END LOOP;
      END $owners$;
      ${tables.filter(t => !t.startsWith("TerraqoCertificateDisclosure")).map(t => `GRANT SELECT,INSERT,UPDATE,DELETE ON icc.${identifier(t)} TO terraqo_staging_runtime;`).join('\n')}`);
    const assertMembership = async () => {
      assert.deepEqual(JSON.parse(await query(membershipQuery)), expectedMembership);
      assert.equal(await query("SELECT pg_has_role('postgres','terraqo_staging_migrator','SET')"), 'f');
      assert.equal(await query("SELECT pg_has_role('postgres','terraqo_staging_migrator','USAGE')"), 't');
    };
    await assertMembership();
    const assertBaseline = async () => {
      assert.deepEqual(JSON.parse(await query(ledgerSql)), audited);
      assert.equal(await query(`SELECT count(*) FROM pg_tables WHERE schemaname='icc' AND tablename IN ('TerraqoCertificateDisclosure','TerraqoCertificateDisclosureEvent')`), '0');
      assert.equal(await query(`SELECT count(*) FROM pg_proc WHERE pronamespace='icc'::regnamespace
        AND proname IN (${functions.map(literal).join(',')})`), '0');
      await assertMembership();
      assert.deepEqual(await snapshot(false), before);
    };
    const rejectArtifact = async expected => {
      let rejected;
      try { await apply(); } catch (error) { rejected = error; }
      assert.ok(rejected, 'Expected artifact rejection');
      assert.match(String(rejected.stderr), expected, 'Artifact failed for an unexpected reason');
    };
    phase = 'prove late failure rolls back DDL, ledger and role elevation';
    await query('REVOKE SELECT ON icc."TerraqoClosureRevision" FROM terraqo_staging_runtime');
    await rejectArtifact(/Runtime DML permission missing/);
    await assertBaseline();
    await query('GRANT SELECT ON icc."TerraqoClosureRevision" TO terraqo_staging_runtime');
    pass('late runtime-permission failure atomically rolls back DDL, functions, ledger, rows and postgres SET');
    phase = 'apply exact artifact locally';
    await apply();
    assert.equal(JSON.parse(await query(ledgerSql)).length, 50);
    assert.equal(await query(`SELECT count(*) FROM icc._prisma_migrations WHERE migration_name=${literal(migrationName)}
      AND checksum=${literal(prepared.checksum)} AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND applied_steps_count=1`), '1');
    await query(schemaChecks);
    await query(permissionChecks);

    assert.deepEqual(await snapshot(true), before);
    await assertMembership();
    pass('ledger50; two invoker functions/three enabled triggers; RESTRICT foreign keys and checks; every existing row preserved');
    phase = 'restricted runtime read and authorization checks';
    const runtime = JSON.parse(await query(`SET SESSION AUTHORIZATION terraqo_staging_runtime;
      BEGIN READ ONLY;
      SELECT json_build_object('role',current_user,'legacy',count(*) FILTER (WHERE "acceptedProposalId" IS NULL),
        'bound',count(*) FILTER (WHERE "acceptedProposalId" IS NOT NULL)) FROM icc."TerraqoClosureRevision";
      COMMIT`));
    assert.equal(runtime.role, 'terraqo_staging_runtime');
    assert.equal(runtime.legacy, before.TerraqoClosureRevision.count);
    assert.equal(runtime.bound, 0);
    for (const sql of [
      'SET SESSION AUTHORIZATION terraqo_staging_runtime; SET ROLE terraqo_staging_migrator',
      'SET SESSION AUTHORIZATION terraqo_staging_runtime; CREATE TABLE icc.s17_forbidden_probe(id int)',
      'SET SESSION AUTHORIZATION anon; SELECT "acceptedProposalId" FROM icc."TerraqoClosureRevision" LIMIT 0',
    ]) {
      let denied;
      try { await query(sql); } catch (error) { denied = error; }
      assert.ok(denied, 'Restricted role unexpectedly authorized');
      assert.match(String(denied.stderr), /permission denied/);
    }
    pass('real restricted-runtime SELECT succeeds; runtime elevation/DDL and anonymous reads denied');
    phase = 'duplicate rejection and independent readback';
    await rejectArtifact(/S17 target or ledger changed/);
    assert.equal(JSON.parse(await query(ledgerSql)).length, 50);
    assert.deepEqual(await snapshot(true), before);
    await query(schemaChecks);
    await query(permissionChecks);
    await assertMembership();
    assert.equal(await query('SELECT count(*) FROM icc._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL'), '0');

    pass('duplicate rejected; independent connections confirm unchanged ledger50, rows, guards and SET=false');
    evidence = { passed: true, verifiedAt: new Date().toISOString(), candidate, migrationName,
      backup, backupSha256: manifest.sha256, manifestSha256: sha256(manifestBytes), artifactSha256: prepared.artifactSha256,
      migrationChecksum: prepared.checksum, restoreVerified: true, localMigrationVerified: true,
      baseline: 49, target: 50, unfinished: 0, functions: 2, triggers: 3, legacyNullPreserved: true,
      existingRowsPreserved: true, tableSnapshots: before, duplicateRejected: true, lateFailureRollbackVerified: true,
      runtimeRestrictedSelect: true, postgresMigratorSet: false, postgresMigratorUsage: true,
      exactMembershipPreserved: expectedMembership, remoteWrites: false, engine,
      roleBoundary: 'Locally reconstructed minimal grants; not a live hosted-role audit',
      engineLimitation: 'PostgreSQL 18 local restore; hosted PostgreSQL 17.11 execution remains separate', checks };
  } catch (error) {
    // PostgreSQL errors may include customer row DETAIL/CONTEXT: never echo stderr or server logs.
    throw new Error(`S17 local restore failed during ${phase}: ${error.code || error.name || 'verification'}; no database payload logged`);
  } finally {
    phase = 'owned cluster cleanup';
    const actual = await realpath(dir);
    assert.equal(actual, ownedDirectory);
    assert.equal(path.dirname(actual), tempRoot);
    assert.ok(path.basename(actual).startsWith('terraqo-s17-restore-'));
    assert.ok(!(await lstat(dir)).isSymbolicLink());
    if (child && child.exitCode === null && child.pid) {
      assert.equal(Number((await readFile(path.join(data, 'postmaster.pid'), 'utf8')).split('\n')[0]), child.pid,
        'Refuse to stop an unowned server');
      await run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
      await assert.rejects(lstat(path.join(data, 'postmaster.pid')), { code: 'ENOENT' });
    }
    await log?.close();
    await unlink(passwordFile).catch(error => { if (error.code !== 'ENOENT') throw error; });
    // Recursive removal is confined to this run's checked, non-symlink temporary root, after server shutdown.
    await rm(actual, { recursive: true });
    await assert.rejects(lstat(actual), { code: 'ENOENT' });
    cleanupComplete = true;
  }
  assert.ok(evidence && cleanupComplete);
  evidence.ownedClusterStoppedAndRemoved = true;
  evidence.checks = [...checks, 'owned loopback server stopped; temporary data, passwords and logs removed'];
  const evidencePath = path.join(root, 'output/s17-disclosure/restore-evidence.json');
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ passed: true, restored: true, baseline: 49, target: 50, duplicateRejected: true,
    existingRowsPreserved: true, cleanupComplete, remoteWrites: false, evidence: evidencePath }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
