import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, open, unlink } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

assert.ok(process.argv.includes('--confirm=local-restore-only'));
const backup = path.resolve(process.argv[2]);
const manifest = JSON.parse(await readFile(path.join(backup, 'manifest.json'), 'utf8'));
assert.equal(manifest.siteId, '2d38524a-44f9-4473-8a1f-9270e03bc2bf');
assert.equal(manifest.readOnly, true);
const dump = path.join(backup, 'icc.dump');
assert.equal(createHash('sha256').update(await readFile(dump)).digest('hex'), manifest.sha256);
const dir = await mkdtemp(path.join(os.tmpdir(), 'terraqo-attention-restore-'));
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
let child, log, stage = 'init';
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
  stage = 'restore';
  await run('pg_restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', '--dbname=postgres', dump]);
  const count = await query('select count(*) from icc."_prisma_migrations" where finished_at is not null and rolled_back_at is null');
  assert.equal(Number(count), manifest.ledger.filter(row => row.finished && !row.rolled_back).length);
  const snapshots = async () => {
    const tables = (await query("SELECT tablename FROM pg_tables WHERE schemaname='icc' ORDER BY tablename")).split('\n').map(table => table.trim()).filter(Boolean);
    const result = {};
    for (const table of tables) {
      const quoted = '"' + table.replaceAll('"', '""') + '"';
      const projection = table === 'ChatConversation' ? manifest.columns.map(column => '"' + column.replaceAll('"', '""') + '"').join(',') : '*';
      result[table] = await query(`SELECT count(*)::text || ':' || md5(coalesce(string_agg(h,',' ORDER BY h),'')) FROM (SELECT md5(row_to_json(t)::text) h FROM (SELECT ${projection} FROM icc.${quoted}) t) records`);
    }
    return result;
  };
  stage = 'snapshot';
  const before = await snapshots();
  const migration = path.resolve('prisma/migrations/20261104000200_customer_attention_followup/migration.sql');
  stage = 'migration';
  await run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-f', migration]);
  assert.deepEqual(await snapshots(), before, 'Existing data changed during migration');
  assert.equal(await query("SELECT count(*) FROM information_schema.columns WHERE table_schema='icc' AND table_name='ChatConversation' AND column_name IN ('nextAction','nextActionAt','nextActionCompletedAt')"), '3');
  let duplicateRejected = false;
  try { await run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-f', migration]); }
  catch { duplicateRejected = true; }
  assert.ok(duplicateRejected);
  assert.deepEqual(await snapshots(), before);
  manifest.migrationName = "20261104000200_customer_attention_followup";
  manifest.restoreVerified = true;
  manifest.localMigrationVerified = true;
  manifest.duplicateRejected = true;
  manifest.existingCountsPreserved = true;
  manifest.restoreEngine = 'PostgreSQL 18';
  manifest.sourceTablesVerified = Object.keys(before).length;
  manifest.migrationSha256 = createHash('sha256').update(await readFile(migration)).digest('hex');
  await writeFile(path.join(backup, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ passed: true, restored: true, migrationVerified: true, duplicateRejected, remoteWrites: false }));
} catch (error) {
  await writeFile(path.join(backup, 'restore-error-private.log'), String(error.stderr || error.stack || error.message));
  console.error(JSON.stringify({ stage, code: error.code, localRehearsalFailed: true, remoteWrites: false }));
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) await run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  await log?.close();
  await unlink(passwordFile).catch(() => {});
}
