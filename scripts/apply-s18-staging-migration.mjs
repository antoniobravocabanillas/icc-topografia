import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'dotenv';
import pg from 'pg';
import { readBackup } from './rehearse-s18-staging-local.mjs';
import { root, prepareArtifact, sha256, migrationName, membershipQuery, expectedMembership, permissionChecks } from './prepare-s18-lifecycle-staging-migration.mjs';

const project = 'mghdpciewbsowjrjwmwk';
export async function pinnedDatabaseCa() {
  const pem = await readFile(path.join(root, 'scripts/certificates/supabase-prod-ca-2021.crt'), 'utf8');
  const certificate = new X509Certificate(pem);
  assert.equal(certificate.fingerprint256, '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');
  assert.equal(certificate.ca, true);
  assert.ok(Date.now() >= Date.parse(certificate.validFrom) && Date.now() < Date.parse(certificate.validTo));
  return pem;
}
export function targetConfiguration(value) {
  const url = new URL(value);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  const user = decodeURIComponent(url.username);
  assert.ok((url.hostname === `db.${project}.supabase.co` && user === 'postgres') ||
    (url.hostname === 'aws-1-sa-east-1.pooler.supabase.com' && user === `postgres.${project}`));
  assert.ok(!url.port || url.port === '5432');
  assert.equal(url.pathname, '/postgres');
  assert.equal(url.hash, '');
  assert.ok(url.password && !url.password.includes('YOUR-PASSWORD'));
  // Do not forward URL options, PG environment settings or permissive TLS overrides.
  for (const [key, value] of url.searchParams) assert.ok((key === 'sslmode' && value === 'require') || (key === 'schema' && value === 'icc'));
  return { host: url.hostname, port: 5432, user, password: decodeURIComponent(url.password), database: 'postgres',
    ssl: { rejectUnauthorized: true }, options: '-c client_encoding=UTF8', connectionTimeoutMillis: 20000,
    statement_timeout: 120000, query_timeout: 150000, application_name: 'terraqo-s18-staging-operator' };
}

async function main() {
  const [mode, envPath, backupPath, rehearsalPath, acceptancePath] = process.argv.slice(2);
  assert.equal(process.argv.length, 7);
  assert.ok(['--check', '--apply-staging-migration51'].includes(mode));
  const apply = mode === '--apply-staging-migration51';
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  if (apply) assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(), '', 'Commit reviewed source before applying');
  const artifactPath = path.join(root, 'output/s18-lifecycle');
  const metadata = JSON.parse(await readFile(path.join(artifactPath, 'staging-migration.json'), 'utf8'));
  const sql = await readFile(path.join(artifactPath, 'staging-migration.sql'), 'utf8');
  const prepared = await prepareArtifact(metadata.audit, metadata.candidate);
  assert.equal(sql, prepared.sql);
  assert.equal(sha256(sql), metadata.artifactSha256);
  const backup = await readBackup(path.resolve(backupPath));
  const rehearsal = JSON.parse(await readFile(rehearsalPath, 'utf8'));
  assert.equal(rehearsal.passed, true);
  assert.equal(rehearsal.releaseArtifactVerified, true);
  assert.equal(rehearsal.lateFailureRollbackVerified, true);
  assert.equal(rehearsal.priorMigrationRecordsUnchanged, true);
  assert.equal(rehearsal.releaseArtifactSha256, metadata.artifactSha256);
  assert.equal(rehearsal.backupSha256, backup.manifest.sha256);
  assert.equal(rehearsal.manifestSha256, backup.manifestSha256);
  assert.equal(rehearsal.prismaSchemaSha256, sha256(await readFile(path.join(root, 'prisma/schema.prisma'))));
  const acceptance = JSON.parse(await readFile(path.join(acceptancePath, 'runner.json'), 'utf8'));
  const journey = JSON.parse(await readFile(path.join(acceptancePath, 'journey.json'), 'utf8'));
  assert.equal(acceptance.passed, true); assert.equal(acceptance.cleanup, true);
  assert.equal(acceptance.migrationSha256, metadata.checksum);
  assert.equal(journey.documentsPassed, true); assert.equal(journey.accessPassed, true);
  const env = parse(await readFile(envPath, 'utf8'));
  const config = targetConfiguration(env.STAGING_BACKUP_DATABASE_URL);
  config.ssl.ca = await pinnedDatabaseCa();
  const client = new pg.Client(config);
  const result = { project, candidate: head, migration: migrationName, artifactSha256: metadata.artifactSha256,
    backupSha256: backup.manifest.sha256, checked: false, commitState: 'not-attempted', verified: false };
  await mkdir(path.join(root, 'output/s18-lifecycle'), { recursive: true });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const identity = (await client.query("SELECT current_database() AS database,current_user AS actor,session_user AS session,pg_has_role('postgres','terraqo_staging_migrator','SET') AS elevated")).rows[0];
    assert.deepEqual(identity, { database: 'postgres', actor: 'postgres', session: 'postgres', elevated: false });
    assert.deepEqual((await client.query(membershipQuery)).rows[0].jsonb_agg, expectedMembership);
    const ledger = (await client.query('SELECT migration_name,checksum FROM icc._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name')).rows;
    assert.deepEqual(ledger, [...metadata.audit.ledger].sort((a, b) => a.migration_name.localeCompare(b.migration_name)));
    assert.equal(Number((await client.query('SELECT count(*) AS n FROM icc._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL')).rows[0].n), 0);
    await client.query('COMMIT');
    result.checked = true;
    if (apply) {
      // The rehearsed artifact owns its atomic BEGIN/COMMIT, locks, complete row comparison,
      // exact ledger insertion and restoration of both pre-existing role grantors.
      result.commitState = 'unknown'; // Lost acknowledgement must never be reported as a rollback.
      await client.query(sql);
      result.commitState = 'acknowledged';
      const ledger = (await client.query('SELECT migration_name,checksum FROM icc._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name')).rows;
      assert.equal(ledger.length, 51);
      assert.deepEqual(ledger.find(row => row.migration_name === migrationName), { migration_name: migrationName, checksum: metadata.checksum });
      assert.deepEqual((await client.query(membershipQuery)).rows[0].jsonb_agg, expectedMembership);
      await client.query(permissionChecks);
      result.verified = true;
    }
    console.log(JSON.stringify(result));
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
    await writeFile(path.join(root, `output/s18-lifecycle/${apply ? 'apply' : 'check'}-receipt.json`), JSON.stringify(result, null, 2));
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url)
  main().catch(error => { console.error('S18 staging operator stopped; no secrets or SQL payload logged.', { code: error.code }); process.exitCode = 1; });
