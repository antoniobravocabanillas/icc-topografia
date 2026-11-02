import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parse } from 'dotenv';

assert.ok(process.argv.includes('--confirm=staging-backup-only'));
const require = createRequire(new URL('../node_modules/netlify-cli/package.json', import.meta.url));
const { getAPIToken } = await import(pathToFileURL(require.resolve('@netlify/dev-utils')).href);
const { NetlifyAPI } = await import(pathToFileURL(require.resolve('@netlify/api')).href);
const api = new NetlifyAPI(await getAPIToken());
const siteId = '6b8c43fb-6083-450a-9b85-46a820fb6358';
const site = await api.getSite({ site_id: siteId });
assert.equal(site.name, 'terraqo-platform-staging');
assert.equal(site.ssl_url, 'https://terraqo-platform-staging.netlify.app');
const entries = await api.getEnvVars({ accountId: site.account_slug, siteId });
const local = await readFile('.env.platform-staging.local', 'utf8').then(parse).catch(error => {
  if (error.code === 'ENOENT') return {};
  throw error;
});
const backupValue = process.env.STAGING_BACKUP_DATABASE_URL || local.STAGING_BACKUP_DATABASE_URL;
const value = backupValue || process.env.B5_GATE_DATABASE_URL || entries.find(e => e.key === 'B5_GATE_DATABASE_URL')?.values?.find(v => v.context === 'production')?.value;
if (!value || value.startsWith('***') || !URL.canParse(value)) {
  console.error('Staging credential unavailable or masked. Set B5_GATE_DATABASE_URL in the process environment; do not paste credentials into logs. No database connection attempted.');
  process.exit(2);
}
const url = new URL(value);
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'PostgreSQL protocol required');
const ref = 'mghdpciewbsowjrjwmwk';
const user = decodeURIComponent(url.username);
const role = backupValue ? 'postgres' : 'terraqo_staging_runtime';
assert.ok((url.hostname === `db.${ref}.supabase.co` && user === role) ||
  (url.hostname === 'aws-1-sa-east-1.pooler.supabase.com' && user === `${role}.${ref}`), 'Unexpected staging host or role');
assert.ok(!url.port || url.port === '5432', 'Session pooler port required');
assert.ok(!url.hash && url.password && !url.password.includes('YOUR-PASSWORD'), 'Invalid password URL encoding or placeholder');
assert.equal(url.pathname, '/postgres');
const directory = path.resolve('output', `s24-backup-${Date.now()}`);
await mkdir(directory, { recursive: false });
const dump = path.join(directory, 'icc.dump');
// Credentials only reach PostgreSQL's child environment, never command arguments or reports.
const env = { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH,
  TEMP: process.env.TEMP, TMP: process.env.TMP, PGHOST: url.hostname,
  PGPORT: url.port || '5432', PGDATABASE: 'postgres', PGUSER: user,
  PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '20',
  PGOPTIONS: '-c default_transaction_read_only=on' };
const execute = promisify(execFile);
const bin = 'C:/Program Files/PostgreSQL/18/bin';
try {
  await execute(path.join(bin, 'pg_dump.exe'), ['--format=custom', '--schema=icc', '--no-owner', '--no-acl', '--file', dump],
    { env, windowsHide: true, timeout: 240000 });
  const { stdout } = await execute(path.join(bin, 'pg_restore.exe'), ['--list', dump], { windowsHide: true });
  assert.ok(stdout.includes('_prisma_migrations'));
  const bytes = await readFile(dump);
  const proof = { projectRef: ref, siteId, schema: 'icc', bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), archiveReadable: true,
    restoreVerified: false, remoteWrites: false };
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify({ directory, ...proof }));
} catch (error) {
  console.error(JSON.stringify({ backupFailed: true, code: error.code,
    message: String(error.stderr || error.message).replaceAll(value, '[redacted]').replaceAll(decodeURIComponent(url.password), '[redacted]').slice(0, 1500) }));
  process.exitCode = 1;
}
