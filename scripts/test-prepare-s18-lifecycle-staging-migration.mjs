import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { expectedMembership, migrationName, prepareArtifact, root, sha256 } from './prepare-s18-lifecycle-staging-migration.mjs';

const candidate = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const names = (await readdir(path.join(root, 'prisma/migrations'), { withFileTypes: true }))
  .filter(entry => entry.isDirectory() && entry.name !== migrationName).map(entry => entry.name).sort();
const ledger = await Promise.all(names.map(async name => ({ migration_name: name,
  checksum: sha256(await readFile(path.join(root, 'prisma/migrations', name, 'migration.sql'))) })));
const audit = { project: 'mghdpciewbsowjrjwmwk', database: 'postgres', unfinished: 0,
  publicSchemaAccess: false, hasLifecycle: false, migrationCount: 50, ledger, membership: expectedMembership };

test('wrong targets, drift, public access, incomplete ledger and elevation fail before SQL generation', async () => {
  for (const patch of [{ project: 'production' }, { database: 'other' }, { unfinished: 1 },
    { publicSchemaAccess: true }, { hasLifecycle: true }, { migrationCount: 51 },
    { ledger: ledger.slice(1) }, { ledger: [...ledger.slice(1), ledger[1]] },
    { membership: expectedMembership.slice(1) },
    { membership: expectedMembership.map(row => ({ ...row, set: true })) },
    { ledger: [{ ...ledger[0], checksum: '0'.repeat(64) }, ...ledger.slice(1)] },
    { ledger: [{ ...ledger[0], migration_name: "injected';SELECT 1;" }, ...ledger.slice(1)] }]) {
    await assert.rejects(prepareArtifact({ ...audit, ...patch }, candidate));
  }
  await assert.rejects(prepareArtifact(audit, 'HEAD; malicious'));
});

test('artifact binds committed DDL, preserves old rows and grantors, and records exactly one migration', async () => {
  const artifact = await prepareArtifact(audit, candidate);
  const source = await readFile(path.join(root, 'prisma/migrations', migrationName, 'migration.sql'));
  assert.equal(artifact.checksum, sha256(source));
  assert.equal(artifact.artifactSha256, sha256(artifact.sql));
  assert.ok(artifact.sql.includes(source.toString('utf8').replace(/^BEGIN;\r?\n/m, '').replace(/COMMIT;\s*$/, '')));
  assert.equal((artifact.sql.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((artifact.sql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.equal((artifact.sql.match(/INSERT INTO icc\._prisma_migrations/g) || []).length, 1);
  assert.match(artifact.sql, /SET SESSION|session_user<>'postgres'/);
  assert.match(artifact.sql, /GRANT terraqo_staging_migrator TO postgres WITH SET TRUE/);
  assert.match(artifact.sql, /GRANT terraqo_staging_migrator TO postgres WITH SET FALSE/);
  assert.match(artifact.sql, /s18_prior_membership EXCEPT ALL/);
  assert.match(artifact.sql, /EXCEPT ALL SELECT \* FROM s18_prior_membership/);
  assert.match(artifact.sql, /GRANT SELECT,INSERT,UPDATE ON icc\."TerraqoDocumentReplacementAttempt"/);
  assert.doesNotMatch(artifact.sql, /DROP TABLE|TRUNCATE TABLE|DISABLE TRIGGER|SECURITY DEFINER/);
});
