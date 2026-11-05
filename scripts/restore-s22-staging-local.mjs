import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, open, unlink } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

assert.ok(process.argv.includes('--confirm=local-restore-only'));
const evaluators = process.argv.includes('--evaluators');
const baseline = evaluators ? 47 : 46;
const artifact = path.resolve(evaluators ? 'output/s22/evaluator-migration.sql' : 'output/s22/staging-migration.sql');
const backup = path.resolve(process.argv[2]);
const manifest = JSON.parse(await readFile(path.join(backup, 'manifest.json'), 'utf8'));
assert.equal(manifest.projectRef, 'mghdpciewbsowjrjwmwk');
const dump = path.join(backup, 'icc.dump');
assert.equal(createHash('sha256').update(await readFile(dump)).digest('hex'), manifest.sha256);
assert.equal(manifest.siteId, '6b8c43fb-6083-450a-9b85-46a820fb6358');
assert.equal(manifest.schema, 'icc');
const dir = await mkdtemp(path.join(os.tmpdir(), 'terraqo-s22-restore-'));
const data = path.join(dir, 'data'), passwordFile = path.join(dir, 'password');
const bin = 'C:/Program Files/PostgreSQL/18/bin';
const probe = net.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const password = randomBytes(24).toString('hex');
const env = { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP, TMP: process.env.TMP,
  PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'local_restore', PGPASSWORD: password };
const execute = promisify(execFile);
const run = async (name, args) => (await execute(path.join(bin, `${name}.exe`), args,
  { env, windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024 })).stdout;
const query = async sql => (await run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql])).trim();
let child, log;
try {
  await writeFile(passwordFile, password, { flag: 'wx' });
  await run('initdb', ['-D', data, '-U', 'local_restore', '-A', 'scram-sha-256', '--pwfile', passwordFile, '--encoding=UTF8']);
  log = await open(path.join(dir, 'postgres.log'), 'a');
  child = spawn(path.join(bin, 'postgres.exe'), ['-D', data, '-h', '127.0.0.1', '-p', String(port)],
    { env, windowsHide: true, stdio: ['ignore', log.fd, log.fd] });
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try { await query('select 1'); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 300)); }
  }
  assert.ok(ready, 'Local cluster unavailable');
  await run('pg_restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', '--dbname=postgres', dump]);
  const count = await query('select count(*) from icc."_prisma_migrations" where finished_at is not null and rolled_back_at is null');
  assert.equal(count, String(baseline));
  const countsSql = `select string_agg(t || ':' || n, ',' order by t) from (
    select 'users' t, count(*) n from icc."User" union all
    select 'workspaces', count(*) from icc."TerraqoWorkspace" union all
    select 'worklogs', count(*) from icc."TerraqoWorklogEntry" union all
    select 'projections', count(*) from icc."TerraqoPublicProjection") s`;
  const before = await query(countsSql);
  // Recreate only the staging role boundary required by the installation artifact.
  await query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE postgres CREATEROLE; CREATE ROLE terraqo_staging_migrator; CREATE ROLE terraqo_staging_runtime;
    GRANT terraqo_staging_migrator TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;
    GRANT USAGE, CREATE ON SCHEMA icc TO terraqo_staging_migrator;
    DO $owners$ DECLARE item record; BEGIN
      FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='icc' LOOP
        EXECUTE format('ALTER TABLE icc.%I OWNER TO terraqo_staging_migrator', item.tablename);
      END LOOP;
    END $owners$;
    ALTER DEFAULT PRIVILEGES FOR ROLE terraqo_staging_migrator IN SCHEMA icc
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO terraqo_staging_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON icc."ChatConversation" TO terraqo_staging_runtime;`);
  if (evaluators) await query('GRANT SELECT, INSERT, UPDATE, DELETE ON icc."TerraqoWorkspaceInvitation" TO terraqo_staging_runtime');
  await run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-c', 'SET SESSION AUTHORIZATION postgres', '-f', artifact]);
  assert.equal(await query('select count(*) from icc."_prisma_migrations" where finished_at is not null and rolled_back_at is null'), String(baseline + 1));
  assert.equal(await query(countsSql), before);
  assert.equal(await query("select pg_has_role('postgres','terraqo_staging_migrator','SET')"), 'f');
  assert.equal(await query(`select has_table_privilege('terraqo_staging_runtime','icc."TerraqoWorkspaceInvitation"','SELECT')
    and not has_schema_privilege('anon','icc','USAGE') and not has_schema_privilege('authenticated','icc','USAGE')`), 't');
  let duplicateRejected = false;
  try { await run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-c', 'SET SESSION AUTHORIZATION postgres', '-f', artifact]); }
  catch { duplicateRejected = true; }
  assert.ok(duplicateRejected, 'Duplicate installation must fail');
  assert.equal(await query('select count(*) from icc."_prisma_migrations" where finished_at is not null and rolled_back_at is null'), String(baseline + 1));
  manifest.migrationName = evaluators ? "20261104000300_workspace_evaluators" : "20261104000100_workspace_invitations";
  manifest.restoreVerified = true;
  manifest.localMigrationVerified = true;
  manifest.duplicateRejected = true;
  manifest.existingCountsPreserved = true;
  manifest.restoreEngine = 'PostgreSQL 18 (source PostgreSQL 17)';
  await writeFile(path.join(backup, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ passed: true, restored: true, migrationVerified: true, duplicateRejected, remoteWrites: false }));
} catch (error) {
  console.error(String(error.stderr || error.message).replaceAll(password, '[redacted]').slice(0, 1800));
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) await run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  await log?.close();
  await unlink(passwordFile).catch(() => {});
}
