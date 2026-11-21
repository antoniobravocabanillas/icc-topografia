import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { archivePin, childEnvironment, errorCategory, localPath, normalizeCatalog, normalizeLedger,
  parseArguments, requiredRoles, selectApplicationToc, sha256, verifiedPath, verifyBundle, verifyOwnedTree } from './restore-platform-production51-local.mjs';

const execute = promisify(execFile);
const source = 'C:/Users/Binv/.terraqo-private/platform51-oxB6Kq';
const confirm = '--confirm=local-application-restore-only';
const script = fileURLToPath(new URL('./restore-platform-production51-local.mjs', import.meta.url));

test('endpoint, UNC, ADS, relative, traversal and unapproved paths fail before any database process', async () => {
  for (const value of ['postgresql://secret@remote/db', 'file:///C:/backup', '//host/share', '\\\\host\\share',
    'C:relative', 'relative', 'C:/x:stream', 'C:/backup/../other', 'C:/backup.', 'C:/backup ', 'C:/x\nsecret'])
    assert.throws(() => localPath(value));
  assert.equal(parseArguments([source, confirm]), path.resolve(source));
  for (const args of [[], [source], [source, '--confirm=remote'], [source, confirm, '--url=remote'], ['C:/elsewhere', confirm]])
    assert.throws(() => parseArguments(args));
  const root = path.dirname(path.resolve(source));
  const before = (await readdir(root)).filter(n => n.startsWith('restore-platform51-')).sort();
  const result = await execute(process.execPath, [script, 'postgresql://secret@remote/db', confirm]).catch(e => e);
  assert.equal(result.code, 1);
  assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.equal(report.phase, 'input-preflight'); assert.equal(report.receipt, null);
  assert.ok(!result.stdout.includes('secret'));
  assert.deepEqual((await readdir(root)).filter(n => n.startsWith('restore-platform51-')).sort(), before);
});

test('archive and catalog corruption, stale manifest and wrong identity reject before startup', async () => {
  const manifest = await readFile(path.join(source, 'manifest.json'));
  const catalog = await readFile(path.join(source, 'catalog.json'));
  const dump = await readFile(path.join(source, 'database.dump'));
  assert.equal(verifyBundle(manifest, catalog, dump).manifest.sha256, archivePin);
  const corrupt = Buffer.from(dump); corrupt[100] ^= 1;
  assert.throws(() => verifyBundle(manifest, catalog, corrupt), { category: 'ARCHIVE_HASH_MISMATCH' });
  const changed = JSON.parse(manifest);
  changed.sha256 = sha256(corrupt);
  assert.throws(() => verifyBundle(JSON.stringify(changed), catalog, corrupt), { category: 'UNAPPROVED_ARCHIVE' });
  assert.throws(() => verifyBundle(manifest, Buffer.from('{}'), dump), { category: 'CATALOG_HASH_MISMATCH' });
  for (const delta of [{ bytes: 0 }, { siteId: 'wrong' }, { ownerAclRetained: false }, { snapshotBound: false },
    { databaseVersion: '18.0' }, { applied: 51 }, { capturedAt: '2000-01-01T00:00:00Z' }, { capturedAt: 'invalid' }])
    assert.throws(() => verifyBundle(JSON.stringify({ ...JSON.parse(manifest), ...delta }), catalog, dump));
  assert.throws(() => verifyBundle(manifest, catalog, dump, Date.parse(JSON.parse(manifest).capturedAt) - 600_000));
});

test('child environment never inherits connection, credential or executable injection settings', () => {
  const env = childEnvironment('C:/private/work', { SystemRoot: 'C:/Windows', PATH: 'malicious',
    PGHOST: 'remote', PGPASSWORD: 'secret', PGOPTIONS: 'unsafe', DATABASE_URL: 'remote',
    NODE_OPTIONS: '--require unsafe', HTTP_PROXY: 'remote', NETLIFY_AUTH_TOKEN: 'secret', PGSERVICE: 'remote' });
  for (const key of ['PGHOST', 'PGPASSWORD', 'PGOPTIONS', 'DATABASE_URL', 'NODE_OPTIONS', 'HTTP_PROXY', 'NETLIFY_AUTH_TOKEN', 'PGSERVICE'])
    assert.equal(env[key], undefined);
  assert.ok(!env.PATH.includes('malicious'));
  assert.equal(env.HOME, 'C:/private/work'); assert.equal(env.PGSSLMODE, 'disable');
});

test('TOC accepts icc schema, ACL and data only; rejects extension and other schema entries', () => {
  const toc = '; header\n1; 2615 12 SCHEMA - icc owner\n2; 1259 13 TABLE icc _prisma_migrations owner\n3; 0 13 TABLE DATA icc _prisma_migrations owner\n4; 0 0 ACL - SCHEMA icc owner\n';
  assert.ok(selectApplicationToc(toc).includes('ACL - SCHEMA icc'));
  for (const row of ['5; 3079 42 EXTENSION - prisma_postgres owner', '5; 1255 42 FUNCTION ppg verify() owner',
    '5; 0 42 TABLE DATA public secret owner', '5; 0 0 DATABASE - postgres owner'])
    assert.throws(() => selectApplicationToc(toc + row));
  assert.throws(() => selectApplicationToc(toc.replace('TABLE DATA icc _prisma_migrations', 'TABLE DATA icc other')));
});

test('catalog resolves changed OIDs but retains ACL, owner, RLS, enabled-trigger and definition differences', () => {
  const catalog = oid => ({ roles: [{ oid: oid + 1, rolname: 'owner' }], memberships: [],
    schemas: [{ oid: oid + 2, nspname: 'icc', nspowner: oid + 1, nspacl: null }],
    relations: [{ oid: oid + 3, nspname: 'icc', relname: 'Example', relowner: oid + 1, relacl: null, relrowsecurity: false }],
    functions: [], columnAcl: [], types: [], defaults: [], policies: [],
    triggers: [{ oid: oid + 4, tgrelid: oid + 3, tgname: `RI_ConstraintTrigger_a_${oid + 4}`,
      tgenabled: 'O', tgisinternal: true, definition: `CREATE CONSTRAINT TRIGGER "RI_ConstraintTrigger_a_${oid + 4}" AFTER DELETE ON icc."Example" EXECUTE FUNCTION f()` }] });
  const sourceCatalog = catalog(100), local = catalog(200);
  assert.deepEqual(normalizeCatalog(sourceCatalog), normalizeCatalog(local));
  for (const mutate of [c => { c.relations[0].relrowsecurity = true; }, c => { c.relations[0].relacl = '{owner=r/owner}'; },
    c => { c.roles[0].rolname = 'different'; }, c => { c.triggers[0].tgenabled = 'D'; },
    c => { c.triggers[0].definition += ' changed'; }]) {
    const altered = structuredClone(local); mutate(altered);
    assert.notDeepEqual(normalizeCatalog(sourceCatalog), normalizeCatalog(altered));
  }
  assert.deepEqual(requiredRoles(sourceCatalog), ['owner']);
});

test('full ledger comparisons detect historical logs, identity, timestamps, checksum and steps changes', () => {
  const row = { id: 'synthetic', migration_name: 'example', checksum: 'hash', logs: 'synthetic log', applied_steps_count: 1,
    started_at: '2026-11-21T00:00:00.000Z', finished_at: null, rolled_back_at: '2026-11-21T00:00:01.000Z' };
  assert.deepEqual(normalizeLedger([row]), normalizeLedger([{ ...row, started_at: '2026-11-21T00:00:00+00:00' }]));
  for (const delta of [{ id: 'other' }, { logs: null }, { applied_steps_count: 2 }, { checksum: 'other' }, { rolled_back_at: null }])
    assert.notDeepEqual(normalizeLedger([row]), normalizeLedger([{ ...row, ...delta }]));
});

test('junctions and unowned cleanup targets fail closed', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'platform51-path-test-'));
  const link = path.join(temp, 'redirect');
  try {
    await writeFile(path.join(temp, 'synthetic.txt'), 'synthetic');
    await symlink(temp, link, 'junction');
    await assert.rejects(verifiedPath(path.join(link, 'synthetic.txt')), { category: 'REPARSE_PATH_REJECTED' });
    await assert.rejects(verifyOwnedTree(temp, path.dirname(temp)), { category: 'UNOWNED_CLEANUP_PATH' });
  } finally {
    await unlink(link).catch(e => { if (e.code !== 'ENOENT') throw e; });
    assert.equal(path.dirname(await verifiedPath(temp)), path.resolve(os.tmpdir()));
    await rm(temp, { recursive: true });
  }
});

test('diagnostics retain only allow-listed categories, never stderr, SQL, customer values or secrets', () => {
  assert.equal(errorCategory({ stderr: 'ERROR: extension "prisma_postgres" is not available\ncustomer secret' }), 'PROVIDER_EXTENSION_UNAVAILABLE');
  assert.equal(errorCategory({ stderr: 'ERROR: schema "ppg" does not exist\ncustomer secret' }), 'PROVIDER_DEPENDENCY_UNSUPPORTED');
  assert.equal(errorCategory({ stderr: 'ERROR: relation "other" does not exist\ncustomer secret' }), 'RESTORE_MISSING_DEPENDENCY');
  assert.equal(errorCategory({ stderr: 'customer secret', message: 'secret' }), 'LOCAL_VERIFICATION_FAILED');
});
