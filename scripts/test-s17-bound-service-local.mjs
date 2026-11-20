import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { access, lstat, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// Disposable bootstrap copied from test-s17-provenance-local.mjs; that script auto-runs
// and cannot be imported as a library. Do not edit or execute the parent's suite here.
// No .env loading, client generation, migrations or external URL input.
// Runtime services execute only in the identity-checked child process below.
const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselineRef = 'f0b34c58c54bd92a9af09d66dc9e199cf43354af';
const prefix = 'terraqo-s17-bound-service-';
const sha = value => createHash('sha256').update(value).digest('hex');
let phase = 'arguments';
let checks = 0;
const pass = label => { checks++; console.log(`PASS ${label}`); };
const ident = value => { assert.match(value, /^[A-Za-z_][A-Za-z0-9_]*$/); return `"${value}"`; };

async function main() {
  const args = process.argv.slice(2);
  assert.ok(args.includes('--confirm=local-s17-bound-service-only'), 'Explicit disposable-loopback confirmation required');
  assert.ok(args.every(a => a === '--confirm=local-s17-bound-service-only' || a.startsWith('--pg-bin=')));
  const option = key => args.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3);
  const dependencies = root;
  const require = createRequire(path.join(dependencies, 'package.json'));
  const { Client } = require('pg');
  const pgVersion = require('pg/package.json').version;
  const prismaVersion = require('prisma/package.json').version;
  assert.equal(prismaVersion, '6.19.3', 'Review baseline CLI flags before changing installed version');
  const bin = path.resolve(option('pg-bin') || 'C:/Program Files/PostgreSQL/18/bin');
  // Child processes receive OS essentials only; PG*, app secrets and provider flags are discarded.
  const env = { NODE_ENV: 'test', PGCLIENTENCODING: 'UTF8', CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1' };
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(path|systemroot|windir|temp|tmp|home|userprofile|appdata|localappdata|comspec|pathext|programfiles.*|programdata)$/i.test(key)) env[key] = value;
  }
  // pg also reads process.env. Clear inherited PG options before constructing any client.
  for (const key of Object.keys(process.env)) if (/^PG/i.test(key)) delete process.env[key];
  phase = 'read baseline and draft';
  const baseline = (await exec('git', ['show', `${baselineRef}:prisma/schema.prisma`], { cwd: root, env, encoding: 'utf8' })).stdout;
  assert.ok(!baseline.includes('acceptedProposalId'));
  const proposalPath = path.join(root, 'docs/work-documented/proposals/s17-accepted-proposal-provenance.proposed.sql');
  const proposal = await readFile(proposalPath, 'utf8');
  const sql = proposal.replace(/^--.*$/gm, '').trim();
  assert.ok(sql.startsWith('BEGIN;') && sql.endsWith('ROLLBACK;'));
  const ddl = sql.slice('BEGIN;'.length, -'ROLLBACK;'.length);
  assert.ok(!/\b(COMMIT|ROLLBACK|START\s+TRANSACTION|PREPARE\s+TRANSACTION)\b/i.test(ddl));
  console.log(`INPUT baseline=${baselineRef} schema_sha256=${sha(baseline)} proposal_sha256=${sha(proposal)} pg=${pgVersion} prisma=${prismaVersion}`);

  const tempRoot = await realpath(os.tmpdir());
  const local = await mkdtemp(path.join(tempRoot, prefix));
  const data = path.join(local, 'pg');
  const secret = randomBytes(32).toString('hex');
  const database = 's17_bound_service_test';
  let started = false;
  let client;
  const sessions = new Set();
  const pg = (name, argv) => exec(path.join(bin, name), argv, {
    cwd: local, env: { ...env, PGPASSWORD: secret }, encoding: 'utf8', windowsHide: true, timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
  });
  try {
    phase = 'offline baseline DDL';
    const schemaFile = path.join(local, 'baseline.prisma');
    await writeFile(schemaFile, baseline, 'utf8');
    // Run outside all checkouts to prevent Prisma auto-loading repository config or .env files.
    const baselineDDL = (await exec(process.execPath, [path.join(dependencies, 'node_modules/prisma/build/index.js'),
      'migrate', 'diff', '--from-empty', '--to-schema-datamodel', schemaFile, '--script'], {
      cwd: local, env, encoding: 'utf8', windowsHide: true, timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
    })).stdout;
    assert.ok(baselineDDL.includes('CREATE TABLE "icc"."TerraqoClosureRevision"'));
    assert.ok(!baselineDDL.includes('acceptedProposalId'));
    const probe = createServer();
    await new Promise((resolve, reject) => probe.on('error', reject).listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
    phase = 'initialize fresh UTF8 cluster';
    const pw = path.join(local, 'pw');
    await writeFile(pw, secret, { encoding: 'utf8', mode: 0o600 });
    await pg('initdb', ['-D', data, '-U', database, '-A', 'scram-sha-256', '--pwfile', pw, '--encoding=UTF8', '--no-sync']);
    await rm(pw);
    const boot = spawnSync(path.join(bin, 'pg_ctl'), ['-D', data, '-l', path.join(local, 'pg.log'),
      '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'], {
      cwd: local, env, stdio: 'ignore', windowsHide: true, timeout: 60_000,
    });
    started = boot.status === 0 || await access(path.join(data, 'postmaster.pid')).then(() => true, () => false);
    if (boot.status !== 0) console.error((await readFile(path.join(local, 'pg.log'), 'utf8').catch(() => 'No server log')).replaceAll(secret, '[redacted]'));
    assert.equal(boot.status, 0, 'Disposable server startup failed');
    await pg('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', database, database]);
    const config = { host: '127.0.0.1', port, user: database, database, password: secret, ssl: false,
      client_encoding: 'UTF8', connectionTimeoutMillis: 5000, statement_timeout: 15000,
      lock_timeout: 8000, application_name: 's17-disposable-bound-service', options: '-c client_encoding=UTF8' };
    const connect = async () => {
      const c = new Client(config);
      try {
        await c.connect();
        const { rows: [actual] } = await c.query(`SELECT current_database() AS db, current_user AS role,
          host(inet_server_addr()) AS host, inet_server_port() AS port,
          current_setting('data_directory') AS data, current_setting('listen_addresses') AS listeners,
          current_setting('server_encoding') AS encoding, current_setting('client_encoding') AS client_encoding`);
        assert.deepEqual(actual, { db: database, role: database, host: '127.0.0.1', port,
          data: data.replaceAll('\\', '/'), listeners: '127.0.0.1', encoding: 'UTF8', client_encoding: 'UTF8' });
        sessions.add(c);
        return c;
      } catch (error) { await c.end(); throw error; }
    };
    client = await connect();
    console.log(`SERVER ${(await client.query('SELECT version() AS v')).rows[0].v}`);
    phase = 'install baseline only';
    await client.query(baselineDDL);
    // Only the freshly initialized, identity-verified owned cluster may commit draft DDL.
    await client.query('BEGIN');
    try { await client.query(ddl); await client.query('COMMIT'); }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    const tables = (await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='icc' ORDER BY tablename`)).rows.map(r => r.tablename);
    const empty = async c => {
      const counts = await c.query(tables.map(t => `SELECT '${t}' AS name, count(*)::int AS count FROM icc.${ident(t)}`).join(' UNION ALL '));
      assert.deepEqual(counts.rows.filter(r => r.count !== 0), []);
    };
    const close = async c => { await c.end(); sessions.delete(c); };
    const independent = async label => {
      const c = await connect();
      try {
        await empty(c);
        assert.equal((await c.query(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname LIKE 's17_%' AND NOT tgisinternal`)).rows[0].n, 6);
      } finally { await close(c); }
      pass(`${label}: independent zero readback across ${tables.length} tables; committed guards remain installed`);
    };
    await independent('committed local DDL');
    phase = 'actual runtime service integration with committed guards';
    const url = `postgresql://${database}:${secret}@127.0.0.1:${port}/${database}?schema=icc&connection_limit=8`;
    const childEnv = { ...env, DATABASE_URL: url, DIRECT_URL: url,
      S17_BOUND_TEST_DATABASE: database, S17_BOUND_TEST_SYNTHETIC: 'confirmed',
      S17_BOUND_TEST_DATA_DIRECTORY: data.replaceAll('\\', '/'),
      TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: 'false' };
    const runtimeFiles = ['lib/terraqo/closure.ts', 'lib/terraqo/collaboration.ts',
      'lib/terraqo/closure-projection.ts', 'lib/validations/terraqo.ts', 'prisma/schema.prisma',
      'node_modules/.prisma/client/schema.prisma', 'docs/work-documented/proposals/s17-accepted-proposal-provenance.proposed.sql'];
    const hashes = await Promise.all(runtimeFiles.map(async file => [file, sha(await readFile(path.join(root, file)))]));
    console.log(`RUNTIME_INPUTS ${JSON.stringify(Object.fromEntries(hashes))}`);
    // Same-worktree generated client and tsx; never generate or borrow another checkout.
    let childError;
    try {
      const result = await exec(process.execPath, ['--import', 'tsx', 'scripts/test-s17-bound-service-postgres.ts'], {
        cwd: root, env: childEnv, windowsHide: true, timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
      });
      process.stdout.write(result.stdout.replaceAll(secret, '[redacted]'));
      process.stderr.write(result.stderr.replaceAll(secret, '[redacted]'));
    } catch (error) {
      if (error.stdout) process.stdout.write(error.stdout.replaceAll(secret, '[redacted]'));
      if (error.stderr) process.stderr.write(error.stderr.replaceAll(secret, '[redacted]'));
      childError = error;
    }
    await independent('after runtime service ordered cleanup');
    for (const [file, hash] of hashes) assert.equal(sha(await readFile(path.join(root, file))), hash, `Input changed during run: ${file}`);
    if (childError) throw childError;
    pass('actual runtime services completed with unchanged input hashes');
  } finally {
    // Only connections verified against this owned cluster enter sessions.
    try {
      await Promise.allSettled([...sessions].map(c => c.end()));
    } finally { if (started) await pg('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); }
    assert.equal(await access(path.join(data, 'postmaster.pid')).then(() => true, () => false), false);
    assert.equal((await lstat(local)).isSymbolicLink(), false);
    const resolved = await realpath(local);
    assert.equal(path.dirname(resolved), tempRoot);
    assert.equal(path.resolve(local), resolved);
    assert.ok(path.basename(resolved).startsWith(prefix));
    await rm(resolved, { recursive: true, force: false, maxRetries: 5, retryDelay: 200 });
    await assert.rejects(access(resolved), { code: 'ENOENT' });
    pass('own cluster stopped; postmaster absent; guarded resolved directory removed');
  }
  console.log(`RESULT ${checks} bootstrap checks passed; runtime services + six committed guards; own loopback cluster removed`);
}

main().catch(error => {
  console.error('FAIL S17 bound service bootstrap', { phase, code: error?.code, name: error?.name });
  if (error?.name === 'AssertionError') console.error(error.message);
  process.exitCode = 1;
});
