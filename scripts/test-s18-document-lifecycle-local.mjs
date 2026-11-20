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
      (id,"professionalProfileId",type,"storageKey","fileName","contentType",size,"replacesDocumentId","replacementOperationKey","replacementFingerprint")
      VALUES ($1,$2,$3,$1,'synthetic.pdf','application/pdf',10,$4,$5,$6)`, [id, profile, type, predecessor, predecessor ? `synthetic-operation-${id}` : null, predecessor ? 'a'.repeat(64) : null]);
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
    const { withdrawProfessionalDocumentInTransaction: withdrawService, replaceProfessionalDocumentInTransaction: replaceService } = await tsImport('../lib/server/professional-document-lifecycle.ts', import.meta.url);
    // Execute the production transaction core against real PostgreSQL. Only the
    // Prisma transport is adapted; locks, predicates and writes are not mocked.
    const call = async (client, input, rollback = false, service = withdrawService) => {
      await client.query('BEGIN');
      try {
        const result = await service({
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
    await insert(c, 'replace-cv', null, 'profile', 'CV');
    await c.query(`UPDATE icc."TerraqoProfessionalDocument" SET "reviewStatus"='VERIFIED',"reviewNote"='Historical review' WHERE id='replace-cv';
      UPDATE icc."TerraqoProfessionalProfile" SET "cvUrl"='/api/terraqo/professional-documents/replace-cv' WHERE id='profile'`);
    const replacement = { actorId: 'owner', documentId: 'replace-cv', expectedVersion: 1, operationKey: 'replacement-operation-001',
      file: { storageKey: 'professional-documents/profile/cv/prepared-a.pdf', fileName: 'updated.pdf', contentType: 'application/pdf', size: 12, contentSha256: 'b'.repeat(64) } };
    const replace = (client, input, rollback = false) => call(client, input, rollback, replaceService);
    await assert.rejects(replace(a, { ...replacement, actorId: 'other' }), error => error.status === 404);
    await assert.rejects(replace(a, { ...replacement, expectedVersion: 2 }), error => error.status === 409);
    await assert.rejects(replace(a, { ...replacement, documentId: 'identity' }), error => error.status === 409);
    await assert.rejects(replace(a, { ...replacement, file: { ...replacement.file, storageKey: 'professional-documents/other/cv/file.pdf' } }), error => error.status === 422);
    await replace(a, replacement, true);
    assert.equal((await c.query(`SELECT count(*)::int AS n FROM icc."TerraqoProfessionalDocument" WHERE "replacesDocumentId"='replace-cv'`)).rows[0].n, 0);
    const versions = await Promise.all([replace(a, replacement), replace(b, { ...replacement, file: { ...replacement.file, storageKey: 'professional-documents/profile/cv/prepared-b.pdf' } })]);
    assert.deepEqual(versions.map(r => r.replayed).sort(), [false, true]); assert.equal(versions[0].id, versions[1].id);
    assert.equal((await c.query(`SELECT "cvUrl" FROM icc."TerraqoProfessionalProfile" WHERE id='profile'`)).rows[0].cvUrl, `/api/terraqo/professional-documents/${versions[0].id}`);
    await assert.rejects(replace(a, { ...replacement, file: { ...replacement.file, contentSha256: 'c'.repeat(64) } }), error => error.status === 409);
    await assert.rejects(replace(a, { ...replacement, operationKey: 'different-operation-003' }), error => error.status === 409);
    assert.deepEqual((await c.query(`SELECT "reviewStatus","reviewNote" FROM icc."TerraqoProfessionalDocument" WHERE id='replace-cv'`)).rows[0], { reviewStatus: 'VERIFIED', reviewNote: 'Historical review' });
    const versionRow = (await c.query(`SELECT "reviewStatus",size,"replacesDocumentId" FROM icc."TerraqoProfessionalDocument" WHERE id=$1`, [versions[0].id])).rows[0];
    assert.deepEqual(versionRow, { reviewStatus: 'SUBMITTED', size: 12, replacesDocumentId: 'replace-cv' });
    await fails(c.query(`UPDATE icc."TerraqoProfessionalDocument" SET "replacementFingerprint"=$1 WHERE id=$2`, ['d'.repeat(64), versions[0].id]), '23514');
    await insert(c, 'another-cv', null, 'profile', 'CV');
    await assert.rejects(replace(a, { ...replacement, documentId: 'another-cv' }), error => error.status === 409);
    await call(a, { ...command, documentId: versions[0].id });
    assert.equal((await replace(a, replacement)).id, versions[0].id);
    assert.equal((await c.query(`SELECT "withdrawnAt" IS NOT NULL AS retired FROM icc."TerraqoProfessionalDocument" WHERE id=$1`, [versions[0].id])).rows[0].retired, true);
    await insert(c, 'different-pointer', null, 'profile', 'CV');
    await c.query(`UPDATE icc."TerraqoProfessionalProfile" SET "cvUrl"='/api/terraqo/professional-documents/another-cv' WHERE id='profile'`);
    await replace(a, { ...replacement, documentId: 'different-pointer', operationKey: 'pointer-operation-004', file: { ...replacement.file, storageKey: 'professional-documents/profile/cv/pointer.pdf' } });
    assert.equal((await c.query(`SELECT "cvUrl" FROM icc."TerraqoProfessionalProfile" WHERE id='profile'`)).rows[0].cvUrl, '/api/terraqo/professional-documents/another-cv');
    await insert(c, 'replace-versus-withdraw', null, 'profile', 'CV');
    const mixed = await Promise.allSettled([
      replace(a, { ...replacement, documentId: 'replace-versus-withdraw', operationKey: 'mixed-operation-0001', file: { ...replacement.file, storageKey: 'professional-documents/profile/cv/mixed.pdf' } }),
      call(b, { ...command, documentId: 'replace-versus-withdraw' }),
    ]);
    assert.equal(mixed[1].status, 'fulfilled');
    if (mixed[0].status === 'rejected') assert.equal(mixed[0].reason.status, 409);
    assert.equal((await c.query(`SELECT "withdrawnAt" IS NOT NULL AS retired FROM icc."TerraqoProfessionalDocument" WHERE id='replace-versus-withdraw'`)).rows[0].retired, true);
    // Retiring an old version affects that exact document, never a later version.
    if (mixed[0].status === 'fulfilled') assert.equal((await c.query(`SELECT "withdrawnAt" FROM icc."TerraqoProfessionalDocument" WHERE id=$1`, [mixed[0].value.id])).rows[0].withdrawnAt, null);
    await c.query(`INSERT INTO icc."TerraqoWorkspace" (id,slug,name,"ownerUserId","updatedAt") VALUES ('company','s18-company','Synthetic company','other',now());
      INSERT INTO icc."TerraqoWorkspaceMember" (id,"workspaceId","userId",role,active,"updatedAt") VALUES ('member','company','owner','PROFESSIONAL',false,now());
      INSERT INTO icc."TerraqoProfessionalDocument" (id,"professionalProfileId","workspaceId",type,"storageKey","fileName","contentType",size)
      VALUES ('company-document','profile','company','CERTIFICATE','company-doc','synthetic.pdf','application/pdf',10)`);
    const companyReplacement = { ...replacement, documentId: 'company-document', operationKey: 'company-operation-0001', file: { ...replacement.file, storageKey: 'professional-documents/profile/certificate/company.pdf' } };
    await assert.rejects(replace(a, companyReplacement), error => error.status === 404);
    await c.query(`UPDATE icc."TerraqoWorkspaceMember" SET active=true WHERE id='member'`);
    const companyVersion = await replace(a, companyReplacement);
    assert.equal((await c.query(`SELECT "workspaceId",type FROM icc."TerraqoProfessionalDocument" WHERE id=$1`, [companyVersion.id])).rows[0].workspaceId, 'company');
    await c.query(`UPDATE icc."TerraqoWorkspaceMember" SET active=false WHERE id='member'`);
    await assert.rejects(replace(a, companyReplacement), error => error.status === 404);
    console.log('PASS replacement core: owner/key validation, rollback, concurrent exact replay, changed payload/key conflict, stable lineage, preserved verified review, new pending review, no replay resurrection, pointer preservation, mixed race and current company membership');
    console.log('PENDING upload orchestration/compensation, readers/import workers, UI and hosted acceptance; not wired to live routes');
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
