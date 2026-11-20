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
    // Immutable pre-S18 schema; current Prisma now models the proposed columns.
    const schema = (await exec('git', ['show', 'f1055b6:prisma/schema.prisma'], { cwd: root, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })).stdout;
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
    const parity = (await exec(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff',
      '--from-url', `postgresql://s18_test:${secret}@127.0.0.1:${port}/postgres`,
      '--to-schema-datamodel', path.join(root, 'prisma/schema.prisma'), '--script'],
    { cwd: local, env, windowsHide: true, timeout: 60000, maxBuffer: 16 * 1024 * 1024 })).stdout;
    assert.equal(parity.replace(/^--.*$/gm, '').trim(), '', 'Proposed SQL must match current Prisma structural schema');
    console.log('PASS full Prisma structural parity against baseline plus proposed SQL (custom guards checked separately)');
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
    const transport = client => {
      let queue = Promise.resolve();
      const aggregate = (sql, field = 'size') => ({ aggregate: async args => {
        // The shared storage-floor service supplies its real owner predicates.
        const json = JSON.stringify(args.where);
        assert.ok(json.includes('owner'));
        const pending = queue.then(() => client.query(sql, ['owner']));
        queue = pending.catch(() => undefined);
        const { rows: [row] } = await pending;
        return { _sum: { [field]: Number(row.total) } };
      } });
      return {
        $queryRaw: async sql => (await client.query(sql.text, sql.values)).rows,
        $executeRaw: async sql => (await client.query(sql.text, sql.values)).rowCount,
        terraqoProfessionalDocument: aggregate(`SELECT COALESCE(sum(d.size),0) AS total FROM icc."TerraqoProfessionalDocument" d JOIN icc."TerraqoProfessionalProfile" p ON p.id=d."professionalProfileId" WHERE p."userId"=$1`),
        terraqoWorklogMedia: aggregate(`SELECT COALESCE(sum(m.size),0) AS total FROM icc."TerraqoWorklogMedia" m JOIN icc."TerraqoWorklogEntry" w ON w.id=m."worklogId" WHERE w."authorId"=$1`),
        terraqoMessageAttachment: aggregate(`SELECT COALESCE(sum(a.size),0) AS total FROM icc."TerraqoMessageAttachment" a JOIN icc."TerraqoDirectMessage" m ON m.id=a."messageId" WHERE m."senderId"=$1`),
        terraqoExperienceEvidence: aggregate(`SELECT COALESCE(sum(e.size),0) AS total FROM icc."TerraqoExperienceEvidence" e JOIN icc."TerraqoProfessionalExperience" x ON x.id=e."experienceId" JOIN icc."TerraqoProfessionalProfile" p ON p.id=x."professionalProfileId" WHERE p."userId"=$1`),
        terraqoEducationEvidence: aggregate(`SELECT COALESCE(sum(e.size),0) AS total FROM icc."TerraqoEducationEvidence" e JOIN icc."TerraqoProfessionalEducation" x ON x.id=e."educationId" JOIN icc."TerraqoProfessionalProfile" p ON p.id=x."professionalProfileId" WHERE p."userId"=$1`),
        terraqoEducationEvidenceAttempt: aggregate(`SELECT COALESCE(sum(e."reservedUnits"),0) AS total FROM icc."TerraqoEducationEvidenceAttempt" e JOIN icc."TerraqoProfessionalEducation" x ON x.id=e."educationId" JOIN icc."TerraqoProfessionalProfile" p ON p.id=x."professionalProfileId" WHERE p."userId"=$1 AND e.state IN ('RESERVED','CLEANUP_PENDING','QUARANTINED')`, 'reservedUnits'),
        terraqoDocumentReplacementAttempt: aggregate(`SELECT COALESCE(sum(a."reservedUnits"),0) AS total FROM icc."TerraqoDocumentReplacementAttempt" a JOIN icc."TerraqoProfessionalProfile" p ON p.id=a."professionalProfileId" WHERE p."userId"=$1 AND a.state IN ('RESERVED','CLEANUP_PENDING')`, 'reservedUnits'),
      };
    };
    const call = async (client, input, rollback = false, service = withdrawService) => {
      await client.query('BEGIN');
      try {
        const result = await service(transport(client), input);
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
    const attempts = await tsImport('../lib/server/document-replacement-attempt.ts', import.meta.url);
    await insert(c, 'attempt-source', null, 'profile', 'CV');
    const attemptInput = { ...replacement, documentId: 'attempt-source', operationKey: 'attempt-operation-0001' };
    const reserve = (client, input, rollback = false) => call(client, input, rollback, attempts.reserveDocumentReplacementInTransaction);
    const finalize = (client, id) => call(client, id, false, (tx, value) => attempts.commitDocumentReplacementInTransaction(tx, 'owner', value));
    const fence = (client, id) => call(client, id, false, (tx, value) => attempts.fenceDocumentReplacementCleanupInTransaction(tx, 'owner', value));
    await reserve(a, attemptInput, true);
    assert.equal((await c.query(`SELECT count(*)::int AS n FROM icc."TerraqoDocumentReplacementAttempt"`)).rows[0].n, 0);
    assert.equal((await c.query(`SELECT count(*)::int AS n FROM icc."TerraqoUsageBucket"`)).rows[0].n, 0);
    const reserved = await Promise.all([reserve(a, attemptInput), reserve(b, attemptInput)]);
    const sharedUsage = await tsImport('../lib/terraqo/billing/personal-storage-usage.ts', import.meta.url);
    assert.equal(await sharedUsage.personalRetainedStorageUnits(transport(c), 'owner'), 3, 'all callers count pending replacements exactly once');
    assert.ok(reserved.every(r => r.kind === 'reserved'));
    assert.notEqual(reserved[0].attempt.storageKey, reserved[1].attempt.storageKey);
    assert.equal((await c.query(`SELECT used FROM icc."TerraqoUsageBucket" WHERE "ownerKey"='user:owner'`)).rows[0].used, 3);
    const confirmed = await Promise.all([finalize(a, reserved[0].attempt.id), finalize(b, reserved[1].attempt.id)]);
    assert.deepEqual(confirmed.map(r => r.replayed).sort(), [false, true]);
    const pending = confirmed.find(r => r.cleanupAttemptId).cleanupAttemptId;
    assert.equal(await sharedUsage.personalRetainedStorageUnits(transport(c), 'owner'), 2, 'committed attempt is counted only by retained document bytes');
    const committed = reserved.find(r => r.attempt.id !== pending).attempt.id;
    assert.equal(await fence(a, committed), 'retained');
    await fails(c.query(`UPDATE icc."TerraqoDocumentReplacementAttempt" SET "storageKey"='foreign-key' WHERE id=$1`, [pending]), '23514');
    await fails(c.query(`UPDATE icc."TerraqoDocumentReplacementAttempt" SET state='RESERVED' WHERE id=$1`, [pending]), '23514');
    await fails(c.query(`DELETE FROM icc."TerraqoDocumentReplacementAttempt" WHERE id=$1`, [committed]), '23514');
    assert.equal((await finalize(a, committed)).replayed, true);
    await assert.rejects(finalize(a, pending), error => error.status === 409);
    assert.equal((await c.query(`SELECT used FROM icc."TerraqoUsageBucket" WHERE "ownerKey"='user:owner'`)).rows[0].used, 3, 'no refund before physical deletion');
    const receipt = await reserve(a, attemptInput); assert.equal(receipt.kind, 'receipt');
    assert.equal((await c.query(`SELECT count(*)::int AS n FROM icc."TerraqoDocumentReplacementAttempt"`)).rows[0].n, 2);
    await insert(c, 'fence-source', null, 'profile', 'CV');
    const fenced = await reserve(a, { ...attemptInput, documentId: 'fence-source', operationKey: 'fence-operation-0001' });
    assert.equal(await fence(a, fenced.attempt.id), 'pending');
    await assert.rejects(finalize(a, fenced.attempt.id), error => error.status === 409);
    await c.query(`UPDATE icc."TerraqoUsageBucket" SET used=2147483646 WHERE "ownerKey"='user:owner'`);
    await assert.rejects(reserve(a, { ...attemptInput, documentId: 'fence-source', operationKey: 'quota-operation-0001' }), error => error.status === 409);
    assert.equal((await c.query(`SELECT count(*)::int AS n FROM icc."TerraqoDocumentReplacementAttempt"`)).rows[0].n, 3);
    console.log('PASS attempt ledger: atomic quota rollback, distinct reserved keys, concurrent one commit, durable replay cleanup, lost-reply recovery, live-reference protection, receipt without recharge, pending fence denies commit, quota denial without orphan');
    const cleanup = await tsImport('../lib/server/document-replacement-cleanup.ts', import.meta.url);
    // Real local files stand in for the provider; never use production blob storage.
    const keys = new Map([...reserved.map(r => r.attempt), fenced.attempt].map(row => [row.storageKey, path.join(local, `blob-${row.id}`)]));
    for (const file of keys.values()) await writeFile(file, 'synthetic bytes');
    const store = { delete: async key => { assert.ok(keys.has(key)); await rm(keys.get(key), { force: true }); } };
    const database = client => ({ $transaction: async callback => {
      await client.query('BEGIN');
      try { const result = await callback(transport(client)); await client.query('COMMIT'); return result; }
      catch (error) { await client.query('ROLLBACK'); throw error; }
    } });
    const recover = (client, id, providedStore = store, now = new Date()) => cleanup.recoverDocumentReplacementAttempt(database(client), 'owner', id, providedStore, now);
    // Restore the deliberately exhausted synthetic bucket, preserving all charges.
    await c.query(`UPDATE icc."TerraqoUsageBucket" SET used=4 WHERE "ownerKey"='user:owner'`);
    const used = async () => (await c.query(`SELECT used FROM icc."TerraqoUsageBucket" WHERE "ownerKey"='user:owner'`)).rows[0].used;
    assert.equal(await recover(a, committed), 'retained');
    assert.equal(await recover(a, pending, { delete: async () => { throw Error('synthetic store outage'); } }), 'retry');
    assert.equal(await used(), 4);
    assert.equal(await recover(a, pending), 'skipped', 'backoff is durable');
    const afterBackoff = new Date(Date.now() + 10 * 60 * 1000);
    const recoveryRace = await Promise.all([recover(a, pending, store, afterBackoff), recover(b, pending, store, afterBackoff)]);
    assert.equal(recoveryRace.filter(value => value === 'completed').length, 1);
    assert.equal(await used(), 3, 'one refund across independent recovery sessions');
    const pendingFile = keys.get(reserved.find(r => r.attempt.id === pending).attempt.storageKey);
    await assert.rejects(access(pendingFile), { code: 'ENOENT' });
    await writeFile(pendingFile, 'late write after lost transport acknowledgement');
    const afterWatch = new Date(afterBackoff.getTime() + 7 * 60 * 60 * 1000);
    assert.equal(await recover(a, pending, store, afterWatch), 'completed');
    assert.equal(await used(), 3, 'tombstone revisit never refunds twice');
    await assert.rejects(access(pendingFile), { code: 'ENOENT' });
    await access(keys.get(reserved.find(r => r.attempt.id === committed).attempt.storageKey));
    // Physical deletion followed by SQL rollback must retain charge and retry safely.
    await call(a, fenced.attempt.id, true, (tx, id) => cleanup.recoverDocumentReplacementInTransaction(tx, 'owner', id, store));
    assert.equal(await used(), 3);
    assert.equal(await recover(a, fenced.attempt.id), 'completed');
    assert.equal(await used(), 2);
    // A pending fence created in this same transaction is not sufficient.
    await insert(c, 'uncommitted-fence', null, 'profile', 'CV');
    const unsafe = await reserve(a, { ...attemptInput, documentId: 'uncommitted-fence', operationKey: 'unsafe-operation-001' });
    let forbiddenDeletes = 0;
    await assert.rejects(call(a, unsafe.attempt.id, false, async (tx, id) => {
      await attempts.fenceDocumentReplacementCleanupInTransaction(tx, 'owner', id);
      return cleanup.recoverDocumentReplacementInTransaction(tx, 'owner', id, { delete: async () => { forbiddenDeletes++; } });
    }), /DOCUMENT_CLEANUP_FENCE_NOT_COMMITTED/);
    assert.equal(forbiddenDeletes, 0);
    const unsafePath = path.join(local, `blob-${unsafe.attempt.id}`);
    keys.set(unsafe.attempt.storageKey, unsafePath); await writeFile(unsafePath, 'synthetic interrupted upload');
    const beforeTimeout = await used();
    await c.query(`UPDATE icc."TerraqoUsageBucket" SET used=0 WHERE "ownerKey"='user:owner'`);
    let invalidFloorDeletes = 0;
    assert.equal(await recover(a, unsafe.attempt.id, { delete: async () => { invalidFloorDeletes++; } }), 'blocked');
    assert.equal(invalidFloorDeletes, 0);
    await c.query(`UPDATE icc."TerraqoUsageBucket" SET used=$1 WHERE "ownerKey"='user:owner'`, [beforeTimeout]);
    let finishLate;
    const delayed = new Promise(resolve => { finishLate = resolve; });
    const slowStore = { delete: async key => { await delayed; await store.delete(key); } };
    assert.equal(await recover(a, unsafe.attempt.id, slowStore), 'retry');
    assert.equal(await used(), beforeTimeout);
    finishLate();
    await delayed;
    assert.equal(await recover(a, unsafe.attempt.id, store, new Date(Date.now() + 10 * 60 * 1000)), 'completed');
    assert.equal(await used(), beforeTimeout - 1);
    console.log('PASS recovery: real local blob deletion, durable backoff, single concurrent refund, retained committed blob, late-write tombstone sweep without refund, SQL rollback after deletion, uncommitted fence denies I/O');
    console.log('PASS insufficient quota floor blocks deletion; timed-out delete retains charge until confirmed recovery');
    const { uploadDocumentReplacement } = await tsImport('../lib/server/document-replacement-upload.ts', import.meta.url);
    let writes = 0;
    const uploadStore = { set: async (key, bytes) => {
      assert.match(key, /^professional-documents\/profile\/cv\/[a-f0-9-]+$/);
      writes++; const target = path.join(local, `upload-${key.split('/').at(-1)}`);
      keys.set(key, target); await writeFile(target, new Uint8Array(bytes));
    } };
    const pdf = new File(['%PDF-1.7\nSynthetic replacement'], 'updated.pdf', { type: 'application/pdf' });
    await insert(c, 'upload-source', null, 'profile', 'CV');
    const uploadInput = { actorId: 'owner', documentId: 'upload-source', expectedVersion: 1, operationKey: 'upload-operation-0001', file: pdf };
    await assert.rejects(uploadDocumentReplacement(database(a), uploadStore, { ...uploadInput, file: new File(['not pdf'], 'wrong.pdf', { type: 'application/pdf' }) }), error => error.status === 422);
    assert.equal(writes, 0);
    const uploaded = await uploadDocumentReplacement(database(a), uploadStore, uploadInput);
    assert.equal(uploaded.replayed, false); assert.equal(writes, 1);
    const beforeReplayUnits = await used();
    assert.deepEqual(await uploadDocumentReplacement(database(a), uploadStore, uploadInput), { id: uploaded.id, replayed: true });
    assert.equal(writes, 1); assert.equal(await used(), beforeReplayUnits);
    await insert(c, 'lost-reply-source', null, 'profile', 'CV');
    let txCalls = 0;
    const lostReplyDb = { $transaction: async callback => {
      const result = await database(a).$transaction(callback);
      if (++txCalls === 2) throw Error('synthetic lost commit acknowledgement');
      return result;
    } };
    const lostInput = { ...uploadInput, documentId: 'lost-reply-source', operationKey: 'lost-reply-operation-01' };
    await assert.rejects(uploadDocumentReplacement(lostReplyDb, uploadStore, lostInput), /synthetic lost commit/);
    const lostRow = (await c.query(`SELECT state,"storageKey" FROM icc."TerraqoDocumentReplacementAttempt" WHERE "documentId"='lost-reply-source'`)).rows[0];
    assert.equal(lostRow.state, 'COMMITTED'); await access(keys.get(lostRow.storageKey));
    const writesAfterLostReply = writes;
    assert.equal((await uploadDocumentReplacement(database(a), uploadStore, lostInput)).replayed, true);
    assert.equal(writes, writesAfterLostReply);
    await insert(c, 'failed-store-source', null, 'profile', 'CV');
    const failedInput = { ...uploadInput, documentId: 'failed-store-source', operationKey: 'failed-store-operation-01' };
    await assert.rejects(uploadDocumentReplacement(database(a), { set: async (key, bytes) => { await uploadStore.set(key, bytes); throw Error('synthetic write uncertainty'); } }, failedInput), /synthetic write uncertainty/);
    const failedRow = (await c.query(`SELECT id,state,"storageKey" FROM icc."TerraqoDocumentReplacementAttempt" WHERE "documentId"='failed-store-source'`)).rows[0];
    assert.equal(failedRow.state, 'CLEANUP_PENDING'); await access(keys.get(failedRow.storageKey));
    const dispatchDb = { ...database(a), $queryRaw: transport(c).$queryRaw, $executeRaw: transport(c).$executeRaw };
    const counts = await cleanup.dispatchDocumentReplacementCleanup(dispatchDb, store);
    assert.ok(counts.completed >= 1);
    assert.equal((await c.query(`SELECT state FROM icc."TerraqoDocumentReplacementAttempt" WHERE id=$1`, [failedRow.id])).rows[0].state, 'CLEANED');
    await assert.rejects(access(keys.get(failedRow.storageKey)), { code: 'ENOENT' });
    await access(keys.get(lostRow.storageKey));
    // New producer leases are not dispatched as abandoned RESERVED rows.
    await insert(c, 'fresh-dispatch-source', null, 'profile', 'CV');
    const freshAttempt = await reserve(a, { ...attemptInput, documentId: 'fresh-dispatch-source', operationKey: 'fresh-dispatch-operation' });
    await cleanup.dispatchDocumentReplacementCleanup(dispatchDb, store);
    assert.equal((await c.query(`SELECT state FROM icc."TerraqoDocumentReplacementAttempt" WHERE id=$1`, [freshAttempt.attempt.id])).rows[0].state, 'RESERVED');
    keys.set(freshAttempt.attempt.storageKey, path.join(local, 'abandoned-not-written'));
    const staleCounts = await cleanup.dispatchDocumentReplacementCleanup(dispatchDb, store, new Date(Date.now() + 11 * 60 * 1000));
    assert.ok(staleCounts.completed >= 1);
    await assert.rejects(finalize(a, freshAttempt.attempt.id), error => error.status === 409);
    await insert(c, 'slow-upload-source', null, 'profile', 'CV');
    let resumeWrite;
    const writeGate = new Promise(resolve => { resumeWrite = resolve; });
    let lateWrite;
    const slowUploadStore = { set: (key, bytes) => {
      keys.set(key, path.join(local, `late-upload-${key.split('/').at(-1)}`));
      lateWrite = writeGate.then(() => writeFile(keys.get(key), new Uint8Array(bytes)));
      return lateWrite;
    } };
    await assert.rejects(uploadDocumentReplacement(database(a), slowUploadStore, { ...uploadInput, documentId: 'slow-upload-source', operationKey: 'slow-upload-operation-01' }), error => error.status === 503);
    const slowRow = (await c.query(`SELECT id,state,"storageKey" FROM icc."TerraqoDocumentReplacementAttempt" WHERE "documentId"='slow-upload-source'`)).rows[0];
    assert.equal(slowRow.state, 'CLEANUP_PENDING');
    await cleanup.dispatchDocumentReplacementCleanup(dispatchDb, store);
    const unitsBeforeLate = await used();
    resumeWrite(); await lateWrite;
    await access(keys.get(slowRow.storageKey));
    assert.equal((await c.query(`SELECT count(*)::int AS n FROM icc."TerraqoProfessionalDocument" WHERE "replacesDocumentId"='slow-upload-source'`)).rows[0].n, 0);
    assert.equal(await cleanup.recoverDocumentReplacementAttempt(database(a), 'owner', slowRow.id, store, new Date(Date.now() + 7 * 60 * 60 * 1000)), 'completed');
    assert.equal(await used(), unitsBeforeLate);
    await assert.rejects(access(keys.get(slowRow.storageKey)), { code: 'ENOENT' });
    console.log('PASS orchestrator/dispatcher: actual PDF bytes, validation before charge/write, receipt without rewrite/recharge, lost SQL reply preserves live blob, uncertain write fenced then reclaimed, fresh reservation excluded');
    console.log('PASS abandoned reservation reclaimed; timed-out uploader has no late SQL commit and its late bytes are swept without second refund');
    console.log('PENDING migration promotion, Office replacement validation, reader/import barriers, UI and hosted acceptance; no scheduler activated');
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
