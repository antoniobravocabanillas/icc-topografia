import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { lstat, mkdtemp, readFile, readdir, realpath, rm, symlink, unlink, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { childEnvironment, parseArguments, proposalBody, readBackup, sha256, summarizeParity } from './rehearse-s18-staging-local.mjs';

const execute = promisify(execFile);
const script = fileURLToPath(new URL('./rehearse-s18-staging-local.mjs', import.meta.url));
const confirmation = '--confirm=local-s18-only';

test('reject URLs, network/drive-relative paths, malformed flags and extra targets before I/O', () => {
  for (const input of ['postgresql://secret@host/db', 'postgres:host', 'file:///C:/backup', 'https://host',
    '//host/share', '\\\\host\\share', 'C:relative', '--backup', 'x\npassword', ' backup ', 'C:/x:stream']) {
    assert.throws(() => parseArguments([input, confirmation]));
  }
  for (const args of [[], ['output/backup'], ['output/backup', '--confirm=staging-backup-only'],
    ['output/backup', confirmation, '--url=postgresql://host/db']]) assert.throws(() => parseArguments(args));
  assert.equal(parseArguments(['output/backup', confirmation]), path.resolve('output/backup'));
});

test('child environment excludes inherited PG, database/provider credentials and Node injection', () => {
  const env = childEnvironment({ PATH: 'local-binaries', SystemRoot: 'os-root', PGHOST: 'remote',
    PGPASSWORD: 'secret', PGDATABASE: 'postgresql://remote', PGSERVICEFILE: 'remote.conf',
    PgHoSt: 'case-variant', PGOPTIONS: '-c session_preload_libraries=unsafe', DATABASE_URL: 'remote',
    DIRECT_URL: 'remote', NETLIFY_AUTH_TOKEN: 'secret', NODE_OPTIONS: '--require malicious.cjs',
    HTTP_PROXY: 'remote', HOME: 'untrusted-home' });
  assert.equal(env.PATH, 'local-binaries');
  assert.equal(env.SystemRoot, 'os-root');
  assert.equal(env.PGSSLMODE, 'disable');
  for (const key of ['PGHOST', 'PGPASSWORD', 'PGDATABASE', 'PGSERVICEFILE', 'PgHoSt', 'PGOPTIONS',
    'DATABASE_URL', 'DIRECT_URL', 'NETLIFY_AUTH_TOKEN', 'NODE_OPTIONS', 'HTTP_PROXY', 'HOME']) assert.equal(env[key], undefined);
});

test('proposal wrapper is required and function bodies stay byte-exact', async () => {
  const bytes = await readFile(new URL('../docs/work-documented/proposals/s18-document-lifecycle.proposed.sql', import.meta.url));
  const source = bytes.toString('utf8');
  const body = proposalBody(source);
  assert.ok(body.includes('CREATE FUNCTION icc.guard_document_replacement_attempt()'));
  assert.ok(body.includes('BEGIN\n') || body.includes('BEGIN\r\n'));
  assert.equal(proposalBody(`-- note\r\nBEGIN;${body}ROLLBACK;\r\n`), body);
  assert.throws(() => proposalBody(source.replace(/ROLLBACK;\s*$/, 'COMMIT;')));
  assert.throws(() => proposalBody(`${source}\nSELECT 1;`));
  assert.equal(sha256(await readFile(new URL('../docs/work-documented/proposals/s18-document-lifecycle.proposed.sql', import.meta.url))), sha256(bytes));
});

test('structural drift fails closed and its receipt omits SQL literals and bodies', () => {
  assert.equal(summarizeParity('-- This is an empty migration.\r\n').matches, true);
  const drift = summarizeParity(`-- AlterTable
ALTER TABLE "icc"."Example" ALTER COLUMN "token" SET DEFAULT 'receipt-must-not-contain-this-secret';
DROP INDEX "icc"."Example_index";
SELECT 'receipt-must-not-contain-this-secret';`);
  assert.equal(drift.matches, false);
  assert.equal(drift.knownFullTextOnly, false);
  const known = 'DROP INDEX "icc"."Worklog_search_vector_gin_idx";\nALTER TABLE "icc"."TerraqoWorklogEntry" ALTER COLUMN "searchVector" DROP DEFAULT;';
  assert.equal(summarizeParity(known).matches, false);
  assert.equal(summarizeParity(known).knownFullTextOnly, true);
  for (const changed of [known + '\nSELECT 1;', known.replace('"icc"', '"public"'), known.replace('searchVector', 'summary'), known.split('\n')[0], known + '\n' + known])
    assert.equal(summarizeParity(changed).knownFullTextOnly, false);
  assert.deepEqual(drift.operations, [
    { operation: 'ALTER TABLE', target: '"icc"."Example"', column: '"token"', change: 'SET DEFAULT' },
    { operation: 'DROP INDEX', target: '"icc"."Example_index"' },
  ]);
  assert.ok(!JSON.stringify(drift).includes('receipt-must-not-contain-this-secret'));
  assert.equal(summarizeParity('SELECT 1;').matches, false, 'Unrecognized statements cannot masquerade as parity');
});

test('backup contract fails closed for tampering, wrong identity, stale/future files and symlinks', async () => {
  const tempRoot = await realpath(os.tmpdir());
  const directory = await mkdtemp(path.join(tempRoot, 'terraqo-s18-input-test-'));
  const archive = Buffer.from('synthetic archive: input validation only, never restored');
  const manifest = { projectRef: 'mghdpciewbsowjrjwmwk', siteId: '6b8c43fb-6083-450a-9b85-46a820fb6358',
    schema: 'icc', bytes: archive.length, sha256: sha256(archive), archiveReadable: true, remoteWrites: false };
  const manifestFile = path.join(directory, 'manifest.json');
  const dumpFile = path.join(directory, 'icc.dump');
  const put = value => writeFile(manifestFile, JSON.stringify(value));
  try {
    await writeFile(dumpFile, archive);
    await put(manifest);
    assert.equal((await readBackup(directory)).manifest.sha256, manifest.sha256);
    for (const delta of [{ projectRef: 'wrong' }, { siteId: 'wrong' }, { schema: 'public' },
      { archiveReadable: false }, { remoteWrites: true }, { bytes: archive.length + 1 },
      { bytes: -1 }, { sha256: '0'.repeat(64) }, { sha256: 'bad' }]) {
      await put({ ...manifest, ...delta });
      await assert.rejects(readBackup(directory));
    }
    await put(manifest);
    await writeFile(dumpFile, Buffer.alloc(archive.length));
    await assert.rejects(readBackup(directory));
    await writeFile(dumpFile, archive);
    for (const file of [manifestFile, dumpFile]) {
      for (const offset of [-7 * 60 * 60 * 1000, 10 * 60 * 1000]) {
        const invalidTime = new Date(Date.now() + offset);
        await utimes(file, invalidTime, invalidTime);
        await assert.rejects(readBackup(directory));
        await utimes(file, new Date(), new Date());
      }
    }
    // Windows junctions exercise the directory symlink guard without developer-mode privileges.
    const link = path.join(directory, 'alias');
    await symlink(directory, link, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(readBackup(link));
    await unlink(link);
    assert.equal((await readBackup(directory)).manifest.sha256, manifest.sha256);
  } finally {
    assert.equal(await realpath(directory), directory);
    assert.equal(path.dirname(directory), tempRoot);
    assert.ok(path.basename(directory).startsWith('terraqo-s18-input-test-'));
    assert.ok(!(await lstat(directory)).isSymbolicLink());
    await rm(directory, { recursive: true });
  }
});

test('executable dry bad arguments fail without cluster creation or credential disclosure', async () => {
  const existing = (await readdir(os.tmpdir())).filter(name => name.startsWith('terraqo-s18-rehearsal-')).sort();
  for (const args of [[], ['postgresql://dry-secret@remote/db', confirmation],
    ['output/nonexistent-s18-dry-backup', confirmation], ['output/backup', '--confirm=remote']]) {
    await assert.rejects(execute(process.execPath, [script, ...args], {
      env: { ...process.env, PGHOST: 'must-not-be-used.invalid', PGPASSWORD: 'dry-secret', DATABASE_URL: 'postgresql://dry-secret@remote/db' },
      windowsHide: true, timeout: 15_000,
    }), error => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /^S18 local rehearsal failed during (arguments|backup manifest\/digest\/freshness); no database payload logged\r?\n$/);
      assert.ok(!`${error.stdout}${error.stderr}`.includes('dry-secret'));
      return true;
    });
  }
  assert.deepEqual((await readdir(os.tmpdir())).filter(name => name.startsWith('terraqo-s18-rehearsal-')).sort(), existing);
});
