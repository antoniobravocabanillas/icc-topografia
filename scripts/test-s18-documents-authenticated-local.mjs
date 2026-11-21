import assert from 'node:assert/strict';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { access, cp, lstat, mkdir, mkdtemp, open, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const prefix = 'terraqo-s18-authenticated-';
const migrationName = '20261120000300_professional_document_lifecycle';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function freePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}
async function stop(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  if (process.platform === 'win32') {
    await exec('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }).catch(() => {});
  } else child.kill('SIGTERM');
  let timer;
  try { await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Owned child did not stop')), 10000); })]); }
  finally { clearTimeout(timer); }
}

/** No external URL or backup input: only a newly initialized owned cluster is accepted. */
async function main() {
  assert.deepEqual(process.argv.slice(2), ['--confirm=local-s18-only']);
  // node-postgres also consults the parent process, not just spawn's environment.
  for (const key of Object.keys(process.env)) if (/^PG/i.test(key)) delete process.env[key];
  const env = { NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', CHECKPOINT_DISABLE: '1', PGCLIENTENCODING: 'UTF8' };
  for (const [key, value] of Object.entries(process.env))
    if (/^(path|systemroot|windir|temp|tmp|userprofile|appdata|localappdata|comspec|pathext|programfiles.*|programdata|playwright_browsers_path)$/i.test(key)) env[key] = value;
  const tempRoot = await realpath(os.tmpdir());
  const local = await mkdtemp(path.join(tempRoot, prefix));
  const app = path.join(local, 'app'), data = path.join(local, 'pg');
  const out = path.join(root, 'output/playwright/s18-authenticated', path.basename(local));
  await mkdir(out, { recursive: true });
  const bin = 'C:/Program Files/PostgreSQL/18/bin';
  const secret = randomBytes(32).toString('hex');
  const runtimeSecret = randomBytes(32).toString('hex');
  const pg = (name, args) => exec(path.join(bin, name), args, { cwd: local, env, windowsHide: true, timeout: 60000 });
  let started = false, next, test, client, log, phase = 'bootstrap';
  const receipt = { passed: false, cleanup: false, source: '', migration: migrationName, migrationSha256: '', baseline: 'f1055b6', output: out };
  console.log('S18 evidence:', out);
  try {
    receipt.source = (await exec('git', ['rev-parse', 'HEAD'], { cwd: root, env })).stdout.trim();
    const migration = await readFile(path.join(root, 'prisma/migrations', migrationName, 'migration.sql'));
    receipt.migrationSha256 = digest(migration);
    const baselineSchema = (await exec('git', ['show', 'f1055b6:prisma/schema.prisma'], { cwd: root, env, maxBuffer: 16 * 1024 * 1024 })).stdout;
    await writeFile(path.join(local, 'baseline.prisma'), baselineSchema);
    const baseline = (await exec(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.join(local, 'baseline.prisma'), '--script'],
      { cwd: local, env, windowsHide: true, timeout: 60000, maxBuffer: 16 * 1024 * 1024 })).stdout;
    const pgPort = await freePort(), webPort = await freePort();
    const origin = `http://127.0.0.1:${webPort}`;
    await writeFile(path.join(local, 'pw'), secret, { mode: 0o600 });
    await pg('initdb', ['-D', data, '-U', 's18_owner', '-A', 'scram-sha-256', '--pwfile', path.join(local, 'pw'), '--encoding=UTF8', '--no-sync']);
    await rm(path.join(local, 'pw'));
    const boot = spawnSync(path.join(bin, 'pg_ctl'), ['-D', data, '-l', path.join(local, 'pg.log'), '-o', `-h 127.0.0.1 -p ${pgPort}`, '-w', 'start'], { cwd: local, env, windowsHide: true, stdio: 'ignore', timeout: 60000 });
    started = boot.status === 0 || await access(path.join(data, 'postmaster.pid')).then(() => true, () => false);
    assert.equal(boot.status, 0, 'Owned PostgreSQL startup');
    client = new Client({ host: '127.0.0.1', port: pgPort, database: 'postgres', user: 's18_owner', password: secret, ssl: false });
    await client.connect();
    const identity = (await client.query("SELECT current_setting('data_directory') AS data, host(inet_server_addr()) AS host, current_setting('listen_addresses') AS listeners")).rows[0];
    assert.deepEqual(identity, { data: data.replaceAll('\\', '/'), host: '127.0.0.1', listeners: '127.0.0.1' });
    assert.equal((await client.query("SELECT count(*)::int AS n FROM pg_namespace WHERE nspname='icc'")).rows[0].n, 0);
    await client.query(baseline);
    await client.query(migration.toString('utf8'));
    const ownerUrl = `postgresql://s18_owner:${secret}@127.0.0.1:${pgPort}/postgres?schema=icc`;
    const currentSchema = path.join(local, 'current.prisma');
    await cp(path.join(root, 'prisma/schema.prisma'), currentSchema);
    const parity = (await exec(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-schema-datasource', currentSchema, '--to-schema-datamodel', currentSchema, '--script'],
      { cwd: local, env: { ...env, DATABASE_URL: ownerUrl, DIRECT_URL: ownerUrl }, windowsHide: true, timeout: 60000, maxBuffer: 16 * 1024 * 1024 })).stdout;
    assert.equal(parity.replace(/^--.*$/gm, '').trim(), '', 'Baseline plus source migration must match current Prisma');
    const guards = (await client.query("SELECT proname,prosecdef,proconfig FROM pg_proc WHERE pronamespace='icc'::regnamespace AND proname IN ('guard_document_replacement_attempt','guard_professional_document_lifecycle')")).rows;
    assert.equal(guards.length, 2);
    for (const guard of guards) { assert.equal(guard.prosecdef, false); assert.deepEqual(guard.proconfig, ['search_path=pg_catalog, icc']); }
    // HTTP uses a separate non-owner role. No superuser/schema-create bypass in the application.
    await client.query(`CREATE ROLE s18_runtime LOGIN PASSWORD '${runtimeSecret}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      GRANT USAGE ON SCHEMA icc TO s18_runtime;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA icc TO s18_runtime;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA icc TO s18_runtime;
      REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON icc."TerraqoDocumentReplacementAttempt" FROM s18_runtime;
      REVOKE EXECUTE ON FUNCTION icc.guard_document_replacement_attempt(), icc.guard_professional_document_lifecycle() FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION icc.guard_document_replacement_attempt(), icc.guard_professional_document_lifecycle() TO s18_runtime;`);
    const database = `postgresql://s18_runtime:${runtimeSecret}@127.0.0.1:${pgPort}/postgres?schema=icc&connection_limit=5`;
    Object.assign(env, { DATABASE_URL: database, DIRECT_URL: database, AUTH_SECRET: randomBytes(32).toString('hex'), AUTH_TRUST_HOST: 'true', AUTH_URL: origin,
      NEXT_PUBLIC_SITE_URL: origin, NEXT_PUBLIC_PORTAL_URL: origin, NEXT_PUBLIC_ADMIN_URL: origin, NEXT_PUBLIC_API_URL: origin,
      TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: 'false', TERRAQO_DOCUMENT_LIFECYCLE_V1: 'true', TERRAQO_SCOPED_SHARING_V1: 'true', CULQI_MODE: 'test', TERRAQO_EVIDENCE_ANALYSIS_PROVIDER: 'off',
      S18_OWNED_LOCAL_ROOT: local, S18_EVIDENCE_DIRECTORY: out, S18_OWNED_LOCAL: 'synthetic-only' });
    await writeFile(path.join(local, 'ownership.json'), JSON.stringify({ origin, pgPort, runtimeRole: 's18_runtime', source: receipt.source }));
    phase = 'source-copy';
    await mkdir(app);
    for (const name of ['app', 'lib', 'components', 'types', 'services', 'emails', 'auth.ts', 'middleware.ts', 'next.config.ts', 'tsconfig.json', 'package.json', 'tailwind.config.ts', 'postcss.config.js'])
      await cp(path.join(root, name), path.join(app, name), { recursive: true });
    // Only read shared dependencies/assets. Next generates files exclusively under the owned app copy.
    for (const name of ['node_modules', 'public']) await symlink(path.join(root, name), path.join(app, name), 'junction');
    // Fail closed on accidental outbound server calls, in addition to excluding .env/provider inputs.
    const fence = path.join(local, 's18-loopback-only.cjs');
    await writeFile(fence, `const net=require('node:net'); const original=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){const a=Array.isArray(args[0])?args[0]:args;const o=a[0];const host=typeof o==='object'?o.host:typeof a[1]==='string'?a[1]:undefined;
if(host&&!['127.0.0.1','localhost','::1'].includes(host))throw new Error('S18 non-loopback connection blocked');return original.apply(this,args);};
const dns=require('node:dns');const lookup=dns.lookup;dns.lookup=function(host,...args){if(host&&!['127.0.0.1','localhost','::1'].includes(host))throw new Error('S18 non-loopback DNS blocked');return lookup.call(this,host,...args);};`);
    env.NODE_OPTIONS = `--require="${fence.replaceAll('\\', '/')}"`;
    log = await open(path.join(local, 'next.log'), 'w');
    phase = 'next-readiness';
    next = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(webPort)], { cwd: app, env, windowsHide: true, stdio: ['ignore', log.fd, log.fd] });
    let ready = false;
    for (let i = 0; i < 90; i++) {
      assert.equal(next.exitCode, null, 'Owned Next process exited');
      try { ready = (await fetch(origin + '/api/auth/csrf', { redirect: 'error', signal: AbortSignal.timeout(10000) })).ok; } catch { /* bounded cold start */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, 'Owned Next readiness timeout');
    console.log('PASS owned loopback identity, source migration51, structural parity, invoker guards; isolated Next development server');
    phase = 'authenticated-browser';
    test = spawn(process.execPath, ['--import', 'tsx', 'scripts/lib/s18-documents-authenticated.ts'], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
    let timer;
    try {
      const code = await Promise.race([
        new Promise((resolve, reject) => { test.once('error', reject); test.once('exit', resolve); }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('S18 browser deadline exceeded')), 12 * 60 * 1000); }),
      ]);
      assert.equal(code, 0, 'S18 real authenticated journey failed');
    } finally { clearTimeout(timer); }
    assert.equal((await exec('git', ['rev-parse', 'HEAD'], { cwd: root, env })).stdout.trim(), receipt.source, 'Source HEAD changed during acceptance');
    receipt.passed = true;
  } catch (error) {
    console.error(`S18 failed during ${phase}; inspect evidence; no remote effects.`);
    throw error;
  } finally {
    // Retained history is never deleted through SQL. Stop all clients, then destroy only this owned cluster.
    try {
      await stop(test); await stop(next);
      await client?.end();
      if (started) await pg('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
      await log?.close();
      const raw = await readFile(path.join(local, 'next.log'), 'utf8').catch(() => '');
      await writeFile(path.join(out, 'next-local.log'), raw.replaceAll(secret, '[redacted]').replaceAll(runtimeSecret, '[redacted]').replaceAll(env.AUTH_SECRET || secret, '[redacted]')
        .replace(/([?&](?:password|token|csrfToken|passkeyToken)=)[^\s&]*/gi, '$1[redacted]'));
      assert.equal(path.dirname(await realpath(local)), tempRoot);
      assert.ok(path.basename(local).startsWith(prefix));
      assert.equal((await lstat(local)).isSymbolicLink(), false);
      // Unlink junctions explicitly before recursive removal; never traverse shared assets/dependencies.
      for (const name of ['node_modules', 'public']) await rm(path.join(app, name), { force: true });
      await rm(local, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
      assert.equal(await access(local).then(() => true, () => false), false);
      receipt.cleanup = true;
      console.log('PASS owned Next stopped; owned PostgreSQL stopped and removed; retained guards never disabled');
    } finally { await writeFile(path.join(out, 'runner.json'), JSON.stringify(receipt, null, 2)); }
  }
}
main().catch(error => {
  // Never print commands/connection strings or browser request bodies on failure.
  console.error('S18 acceptance FAILED', { code: error.code, location: error.stack?.split('\n').filter(line => /at .*s18-/.test(line)).slice(0, 3) });
  process.exitCode = 1;
});
