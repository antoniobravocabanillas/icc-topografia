import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, lstat, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const prefix = 'terraqo-s18-document-';

async function main() {
  assert.deepEqual(process.argv.slice(2), ['--confirm=local-s18-only']);
  // No .env, remote URL or inherited provider credentials enter the child cluster.
  const env = { NODE_ENV: 'test', PGCLIENTENCODING: 'UTF8', CHECKPOINT_DISABLE: '1' };
  for (const [key, value] of Object.entries(process.env)) if (/^(path|systemroot|windir|temp|tmp|userprofile|appdata|localappdata|comspec|pathext|programfiles.*|programdata)$/i.test(key)) env[key] = value;
  for (const key of Object.keys(process.env)) if (/^PG/i.test(key)) delete process.env[key];
  const tempRoot = await realpath(os.tmpdir());
  const local = await mkdtemp(path.join(tempRoot, prefix));
  const data = path.join(local, 'pg');
  const bin = 'C:/Program Files/PostgreSQL/18/bin';
  const secret = randomBytes(32).toString('hex');
  const pg = (name, args) => exec(path.join(bin, name), args, { cwd: local, env: { ...env, PGPASSWORD: secret }, windowsHide: true, timeout: 60000 });
  let started = false;
  const sessions = [];
  try {
    const schema = await readFile(path.join(root, 'prisma/schema.prisma'), 'utf8');
    await writeFile(path.join(local, 'schema.prisma'), schema);
    const baseline = (await exec(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.join(local, 'schema.prisma'), '--script'], { cwd: local, env, windowsHide: true, timeout: 60000, maxBuffer: 16 * 1024 * 1024 })).stdout;
    const proposal = (await readFile(path.join(root, 'docs/work-documented/proposals/s18-document-lifecycle.proposed.sql'), 'utf8')).replace(/^--.*$/gm, '').trim();
    assert.ok(proposal.startsWith('BEGIN;') && proposal.endsWith('ROLLBACK;'));
    const ddl = proposal.slice(6, -9);
    const probe = createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    await writeFile(path.join(local, 'pw'), secret, { mode: 0o600 });
    await pg('initdb', ['-D', data, '-U', 's18_test', '-A', 'scram-sha-256', '--pwfile', path.join(local, 'pw'), '--encoding=UTF8', '--no-sync']);
    await rm(path.join(local, 'pw'));
    const boot = spawnSync(path.join(bin, 'pg_ctl'), ['-D', data, '-l', path.join(local, 'pg.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'], { cwd: local, env, windowsHide: true, stdio: 'ignore', timeout: 60000 });
    started = boot.status === 0 || await access(path.join(data, 'postmaster.pid')).then(() => true, () => false);
    assert.equal(boot.status, 0);
    const connect = async () => {
      const c = new Client({ host: '127.0.0.1', port, database: 'postgres', user: 's18_test', password: secret, ssl: false, statement_timeout: 10000, lock_timeout: 8000 });
      await c.connect(); sessions.push(c);
      const { rows: [actual] } = await c.query("SELECT current_setting('data_directory') AS data, host(inet_server_addr()) AS host");
      assert.equal(actual.data, data.replaceAll('\\', '/')); assert.equal(actual.host, '127.0.0.1');
      return c;
    };
    const c = await connect();
    await c.query(baseline);
    await c.query(`INSERT INTO icc."User" (id,email,"updatedAt") VALUES ('owner','owner@s18.invalid',now()),('other','other@s18.invalid',now());
      INSERT INTO icc."TerraqoProfessionalProfile" (id,"userId","updatedAt") VALUES ('profile','owner',now()),('other-profile','other',now());`);
    const insert = (client, id, predecessor = null, profile = 'profile', type = 'CERTIFICATE') => client.query(`INSERT INTO icc."TerraqoProfessionalDocument"
      (id,"professionalProfileId",type,"storageKey","fileName","contentType",size,"replacesDocumentId") VALUES ($1,$2,$3,$1,'synthetic.pdf','application/pdf',10,$4)`, [id, profile, type, predecessor]);
    // Seed legacy row before additive DDL; no history is inferred.
    await c.query(`INSERT INTO icc."TerraqoProfessionalDocument" (id,"professionalProfileId",type,"storageKey","fileName","contentType",size) VALUES ('legacy','profile','CERTIFICATE','legacy','legacy.pdf','application/pdf',10)`);
    await c.query('BEGIN'); await c.query(ddl); await c.query('COMMIT');
    assert.deepEqual((await c.query(`SELECT "lifecycleVersion","withdrawnAt","replacesDocumentId" FROM icc."TerraqoProfessionalDocument" WHERE id='legacy'`)).rows[0], { lifecycleVersion: 1, withdrawnAt: null, replacesDocumentId: null });
    const fails = async (promise, code) => assert.rejects(promise, error => error.code === code);
    await fails(insert(c, 'cross-profile', 'legacy', 'other-profile'), '23514');
    await fails(insert(c, 'cross-type', 'legacy', 'profile', 'CV'), '23514');
    await insert(c, 'identity', null, 'profile', 'DNI_FRONT');
    await fails(insert(c, 'identity-new', 'identity', 'profile', 'DNI_FRONT'), '23514');
    const withdraw = (client, id, version = 1) => client.query(`UPDATE icc."TerraqoProfessionalDocument" SET "withdrawnAt"=now(),"withdrawnByUserId"='owner',"withdrawOperationKey"='synthetic-operation-0001',"lifecycleVersion"="lifecycleVersion"+1 WHERE id=$1 AND "lifecycleVersion"=$2 AND "withdrawnAt" IS NULL RETURNING id`, [id, version]);
    await fails(withdraw(c, 'identity'), '23514');
    await insert(c, 'new', 'legacy');
    await fails(insert(c, 'branch', 'legacy'), '23505');
    await fails(c.query(`UPDATE icc."TerraqoProfessionalDocument" SET "replacesDocumentId"='new' WHERE id='legacy'`), '23514');
    await fails(c.query(`DELETE FROM icc."TerraqoProfessionalDocument" WHERE id='legacy'`), '23001');
    await fails(c.query(`UPDATE icc."TerraqoProfessionalDocument" SET "withdrawnAt"=now(),"lifecycleVersion"=2 WHERE id='new'`), '23514');
    assert.equal((await withdraw(c, 'new')).rowCount, 1);
    assert.equal((await withdraw(c, 'new')).rowCount, 0);
    await fails(c.query(`UPDATE icc."TerraqoProfessionalDocument" SET "withdrawnAt"=NULL,"withdrawnByUserId"=NULL,"withdrawOperationKey"=NULL WHERE id='new'`), '23514');
    await fails(insert(c, 'after-withdrawal', 'new'), '23514');
    await fails(c.query(`DELETE FROM icc."TerraqoProfessionalDocument" WHERE id='new'`), '23514');
    assert.equal((await c.query(`SELECT "reviewStatus" FROM icc."TerraqoProfessionalDocument" WHERE id='new'`)).rows[0].reviewStatus, 'SUBMITTED');
    console.log('PASS legacy preservation, ownership/type/identity lineage, one successor, immutable history, guarded deletion, withdrawal tuple/version, no restoration, review preserved');

    const a = await connect(), b = await connect();
    await insert(c, 'race');
    const results = await Promise.allSettled([insert(a, 'race-a', 'race'), insert(b, 'race-b', 'race')]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.code, '23505');
    await fails(c.query(`DELETE FROM icc."TerraqoProfessionalDocument" WHERE "replacesDocumentId"='race'`), '23514');
    await insert(c, 'withdraw-race');
    assert.deepEqual((await Promise.all([withdraw(a, 'withdraw-race'), withdraw(b, 'withdraw-race')])).map(r => r.rowCount).sort(), [0, 1]);
    await insert(c, 'held');
    await a.query('BEGIN'); await withdraw(a, 'held');
    const queued = insert(b, 'held-new', 'held').then(() => null, error => error.code);
    await a.query('COMMIT'); assert.equal(await queued, '23514');
    console.log('PASS independent-session replacement and withdrawal races; withdrawal wins against pending replacement');
    const { withdrawProfessionalDocumentInTransaction: withdrawService } = await tsImport('../lib/server/professional-document-lifecycle.ts', import.meta.url);
    // Execute the production transaction core against real PostgreSQL. Only the
    // Prisma transport is adapted; locks, predicates and writes are not mocked.
    const call = async (client, input, rollback = false) => {
      await client.query('BEGIN');
      try {
        const result = await withdrawService({
          $queryRaw: async sql => (await client.query(sql.text, sql.values)).rows,
          $executeRaw: async sql => (await client.query(sql.text, sql.values)).rowCount,
        }, input);
        await client.query(rollback ? 'ROLLBACK' : 'COMMIT'); return result;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    };
    await insert(c, 'service-cv', null, 'profile', 'CV');
    await c.query(`UPDATE icc."TerraqoProfessionalProfile" SET "cvUrl"='/api/terraqo/professional-documents/service-cv' WHERE id='profile'`);
    const command = { actorId: 'owner', documentId: 'service-cv', expectedVersion: 1, operationKey: 'service-operation-0001' };
    await assert.rejects(call(a, { ...command, actorId: 'other' }), error => error.status === 404);
    await assert.rejects(call(a, { ...command, expectedVersion: 2 }), error => error.status === 409);
    await assert.rejects(call(a, { ...command, documentId: 'identity' }), error => error.status === 409);
    await call(a, command, true);
    assert.equal((await c.query(`SELECT "withdrawnAt" FROM icc."TerraqoProfessionalDocument" WHERE id='service-cv'`)).rows[0].withdrawnAt, null);
    const replies = await Promise.all([call(a, command), call(b, command)]);
    assert.deepEqual(replies.map(r => r.replayed).sort(), [false, true]);
    assert.equal(replies[0].withdrawnAt.getTime(), replies[1].withdrawnAt.getTime());
    assert.equal((await c.query(`SELECT "cvUrl" FROM icc."TerraqoProfessionalProfile" WHERE id='profile'`)).rows[0].cvUrl, null);
    await assert.rejects(call(a, { ...command, operationKey: 'different-operation-0002' }), error => error.status === 409);
    await insert(c, 'service-old', null, 'profile', 'CV');
    await c.query(`UPDATE icc."TerraqoProfessionalProfile" SET "cvUrl"='/api/terraqo/professional-documents/current-other' WHERE id='profile'`);
    await call(a, { ...command, documentId: 'service-old' });
    assert.equal((await c.query(`SELECT "cvUrl" FROM icc."TerraqoProfessionalProfile" WHERE id='profile'`)).rows[0].cvUrl, '/api/terraqo/professional-documents/current-other');
    assert.deepEqual((await c.query(`SELECT size,"reviewStatus","storageKey" FROM icc."TerraqoProfessionalDocument" WHERE id='service-cv'`)).rows[0], { size: 10, reviewStatus: 'SUBMITTED', storageKey: 'service-cv' });
    console.log('PASS transaction core: owner isolation, stale conflict, identity protected, rollback, concurrent exact replay, stable audit, CV pointer compare-and-set, retained file/review');
    console.log('PENDING replacement service, readers/import workers, UI and hosted acceptance; not wired to live routes');
  } finally {
    await Promise.allSettled(sessions.map(c => c.end()));
    if (started) await pg('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    assert.equal(await access(path.join(data, 'postmaster.pid')).then(() => true, () => false), false);
    assert.equal((await lstat(local)).isSymbolicLink(), false);
    const resolved = await realpath(local);
    assert.equal(path.dirname(resolved), tempRoot); assert.equal(resolved, path.resolve(local)); assert.ok(path.basename(resolved).startsWith(prefix));
    await rm(resolved, { recursive: true, force: false, maxRetries: 5, retryDelay: 200 });
    await assert.rejects(access(resolved), { code: 'ENOENT' });
    console.log('PASS owned loopback cluster stopped and guarded directory removed');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
