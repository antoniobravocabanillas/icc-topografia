import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { Client } from 'pg';

// Read-only inventory, not a migration/deployment approval or backup receipt.
const siteId = '2d38524a-44f9-4473-8a1f-9270e03bc2bf';
let db; let phase = 'arguments';
try {
  const [expectedCommit, ...extra] = process.argv.slice(2);
  assert.match(expectedCommit || '', /^[a-f0-9]{40}$/); assert.equal(extra.length, 0);
  const require = createRequire(new URL('../node_modules/netlify-cli/package.json', import.meta.url));
  const { getAPIToken } = await import(pathToFileURL(require.resolve('@netlify/dev-utils')).href);
  const { NetlifyAPI } = await import(pathToFileURL(require.resolve('@netlify/api')).href);
  const api = new NetlifyAPI(await getAPIToken());
  phase = 'site-identity';
  const site = await api.getSite({ site_id: siteId });
  assert.equal(site.custom_domain, 'terraqoglobal.com');
  assert.equal(site.build_settings.repo_path, 'antoniobravocabanillas/icc-topografia');
  assert.equal(site.build_settings.repo_branch, 'codex/icc-production-preview');
  assert.equal(site.published_deploy.commit_ref, expectedCommit);
  const entries = await api.getEnvVars({ accountId: site.account_slug, siteId });
  const row = entries.find(entry => entry.key === 'DATABASE_URL');
  const connection = row?.values?.find(value => value.context === 'production')?.value ?? row?.values?.find(value => value.context === 'all')?.value;
  phase = 'database-target';
  const url = new URL(connection);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.equal(url.hostname, 'db.prisma.io'); assert.equal(url.searchParams.get('schema'), 'icc');
  assert.ok(!url.hash && url.username && url.password);
  for (const key of url.searchParams.keys()) assert.ok(['schema','sslmode','connection_limit','pool_timeout','pgbouncer'].includes(key));
  url.searchParams.set('sslmode', 'verify-full');
  db = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 15000, statement_timeout: 30000 });
  await db.connect();
  phase = 'read-only-ledger';
  await db.query('BEGIN READ ONLY');
  const readOnly = (await db.query('SHOW transaction_read_only')).rows[0].transaction_read_only;
  assert.equal(readOnly, 'on');
  const identity = (await db.query(`SELECT current_database() AS database, current_user AS actor, session_user AS session_actor,
    current_setting('server_version') AS version, pg_is_in_recovery() AS replica,
    r.rolsuper AS superuser, r.rolcreatedb AS create_database, r.rolcreaterole AS create_role, r.rolbypassrls AS bypass_rls
    FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
  const security = (await db.query(`SELECT n.nspname AS schema,pg_get_userbyid(n.nspowner) AS owner,n.nspacl::text AS acl,
    has_schema_privilege(current_user,n.oid,'CREATE') AS actor_can_create
    FROM pg_namespace n WHERE n.nspname='icc'`)).rows;
  const ownership = (await db.query(`SELECT pg_get_userbyid(c.relowner) AS owner,count(*)::integer AS tables
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='icc' AND c.relkind IN ('r','p') GROUP BY c.relowner ORDER BY owner`)).rows;
  const ledger = (await db.query('SELECT migration_name,checksum,finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS rolled_back FROM icc._prisma_migrations ORDER BY migration_name')).rows;
  await db.query('ROLLBACK');
  await db.end(); db = undefined;
  const receipt = { checkedAt: new Date().toISOString(), siteId, commit: expectedCommit, deployId: site.published_deploy.id,
    readOnly: true, applied: ledger.filter(row => row.finished && !row.rolled_back).length,
    unfinished: ledger.filter(row => !row.finished && !row.rolled_back).length, ledger, identity, security, ownership,
    limitation: 'No backup, restore rehearsal, checksum reconciliation or production release performed.' };
  await mkdir('output/release-readback', { recursive: true });
  await writeFile('output/release-readback/production-ledger.json', JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ readOnly: true, applied: receipt.applied, unfinished: receipt.unfinished, commit: expectedCommit,
    engine: identity.version, superuser: identity.superuser, bypassRls: identity.bypass_rls,
    schemaCreate: security[0]?.actor_can_create, ownershipGroups: ownership.length }));
} catch (error) {
  console.error('Production read-only inventory stopped', { phase, code: typeof error.code === 'string' ? error.code : 'READ_REJECTED' });
  process.exitCode = 1;
} finally { if (db) await db.end().catch(() => {}); }
