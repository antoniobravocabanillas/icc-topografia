import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rootCertificates } from 'node:tls';
import path from 'node:path';
import { Client } from 'pg';

// Read-only source. No restore, SQL migration, role change, deploy or blob deletion.
// A full database archive retains object ownership/ACL commands. Cluster roles are
// recorded without passwords; actual restoration must reconstruct/review them.
const siteId = '2d38524a-44f9-4473-8a1f-9270e03bc2bf';
const expectedCommit = '285b20ad45f79e80e0410967f399f561f0a64781';
const execute = promisify(execFile);
const sha = value => createHash('sha256').update(value).digest('hex');
const bin = 'C:/Program Files/PostgreSQL/18/bin';
let db, directory, phase = 'arguments';
try {
  assert.deepEqual(process.argv.slice(2), ['--confirm=read-only-production-backup']);
  assert.equal(process.platform, 'win32');
  const require = createRequire(new URL('../node_modules/netlify-cli/package.json', import.meta.url));
  const { getAPIToken } = await import(pathToFileURL(require.resolve('@netlify/dev-utils')).href);
  const { NetlifyAPI } = await import(pathToFileURL(require.resolve('@netlify/api')).href);
  const api = new NetlifyAPI(await getAPIToken());
  phase = 'site';
  const site = await api.getSite({ site_id: siteId });
  assert.equal(site.custom_domain, 'terraqoglobal.com');
  assert.equal(site.build_settings.repo_path, 'antoniobravocabanillas/icc-topografia');
  assert.equal(site.build_settings.repo_branch, 'codex/icc-production-preview');
  assert.equal(site.published_deploy.commit_ref, expectedCommit);
  const entries = await api.getEnvVars({ accountId: site.account_slug, siteId });
  const values = entries.find(entry => entry.key === 'DATABASE_URL')?.values;
  const url = new URL(values?.find(v => v.context === 'production')?.value ?? values?.find(v => v.context === 'all')?.value);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.equal(url.hostname, 'db.prisma.io'); assert.equal(url.searchParams.get('schema'), 'icc');
  assert.ok(url.username && url.password && !url.hash);
  for (const key of url.searchParams.keys()) assert.ok(['schema','sslmode','connection_limit','pool_timeout','pgbouncer'].includes(key));
  url.searchParams.set('sslmode', 'verify-full');

  phase = 'private-directory';
  const privateRoot = path.join(process.env.USERPROFILE, '.terraqo-private');
  await mkdir(privateRoot, { recursive: true });
  directory = await mkdtemp(path.join(privateRoot, 'platform51-'));
  const { stdout: sidOutput } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'], { windowsHide: true });
  const sid = sidOutput.trim(); assert.match(sid, /^S-1-5-21-(?:\d+-){2}\d+-\d+$/);
  await execute('icacls.exe', [directory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'], { windowsHide: true });
  const cert = path.join(directory, 'root-certificates.pem');
  await writeFile(cert, rootCertificates.join('\n'), { flag: 'wx' });
  phase = 'snapshot';
  db = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 15000, statement_timeout: 30000 });
  await db.connect();
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal((await db.query('SHOW transaction_read_only')).rows[0].transaction_read_only, 'on');
  await db.query("SET LOCAL idle_in_transaction_session_timeout='6min'");
  const snapshot = (await db.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
  assert.match(snapshot, /^[0-9A-Fa-f-]+$/);
  const ledger = (await db.query('SELECT * FROM icc._prisma_migrations ORDER BY migration_name,id')).rows;
  assert.equal(ledger.filter(r => r.finished_at && !r.rolled_back_at).length, 44);
  assert.equal(ledger.length, 45);
  assert.equal(ledger.filter(r => !r.finished_at && !r.rolled_back_at).length, 0);
  const projection = ledger.map(r => ({ migration_name: r.migration_name, checksum: r.checksum, finished: Boolean(r.finished_at), rolled_back: Boolean(r.rolled_back_at) }));
  const baseline = JSON.parse(await readFile('output/release-readback/production-ledger.json', 'utf8'));
  const ordered = rows => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  assert.deepEqual(ordered(projection), ordered(baseline.ledger));
  const identity = (await db.query("SELECT current_database() AS database,current_user AS actor,session_user AS session_actor,current_setting('server_version') AS version,pg_is_in_recovery() AS replica")).rows[0];
  assert.equal(identity.replica, false); assert.match(identity.version, /^17\./);
  const queries = {
    roles: 'SELECT oid,rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil,rolconfig FROM pg_roles ORDER BY oid',
    memberships: 'SELECT * FROM pg_auth_members ORDER BY roleid,member,grantor',
    schemas: "SELECT oid,nspname,nspowner,nspacl::text FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY oid",
    relations: "SELECT c.oid,n.nspname,c.relname,c.relkind,c.relowner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' ORDER BY c.oid",
    columnAcl: "SELECT a.attrelid,a.attnum,a.attname,a.attacl::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='icc' AND a.attacl IS NOT NULL ORDER BY a.attrelid,a.attnum",
    functions: "SELECT p.oid,n.nspname,p.proname,p.proowner,p.proacl::text,p.prosecdef,p.proconfig,pg_get_function_identity_arguments(p.oid) AS arguments FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' ORDER BY p.oid",
    types: "SELECT t.oid,n.nspname,t.typname,t.typowner,t.typacl::text FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='icc' ORDER BY t.oid",
    defaults: 'SELECT oid,defaclrole,defaclnamespace,defaclobjtype,defaclacl::text FROM pg_default_acl ORDER BY oid',
    policies: 'SELECT * FROM pg_policies ORDER BY schemaname,tablename,policyname',
    triggers: "SELECT t.oid,t.tgrelid,t.tgname,t.tgenabled,t.tgisinternal,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='icc' ORDER BY t.oid",
    extensions: 'SELECT oid,extname,extowner,extnamespace,extversion FROM pg_extension ORDER BY oid',
    database: 'SELECT oid,datname,datdba,encoding,datcollate,datctype,datacl::text FROM pg_database WHERE datname=current_database()',
  };
  const catalog = {};
  for (const [key, query] of Object.entries(queries)) catalog[key] = (await db.query(query)).rows;
  await writeFile(path.join(directory, 'catalog.json'), JSON.stringify({ identity, ledger, catalog }, null, 2), { flag: 'wx' });
  phase = 'dump';
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH','SYSTEMROOT','WINDIR','TEMP','TMP'].includes(key.toUpperCase())));
  Object.assign(env, { PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: 'verify-full', PGSSLROOTCERT: cert, PGCONNECT_TIMEOUT: '15', PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=180000' });
  const dump = path.join(directory, 'database.dump');
  const result = await execute(path.join(bin, 'pg_dump.exe'), ['--format=custom', `--snapshot=${snapshot}`, '--lock-wait-timeout=5s', '--file', dump], { env, windowsHide: true, shell: false, timeout: 240000, maxBuffer: 4 * 1024 * 1024 });
  // Preserve diagnostics privately, fail on warnings rather than bless a partial archive.
  await writeFile(path.join(directory, 'dump-diagnostics.txt'), result.stderr, { flag: 'wx' });
  assert.equal(result.stderr.trim(), '');
  await db.query('ROLLBACK'); await db.end(); db = undefined;
  phase = 'post-check';
  const freshSite = await api.getSite({ site_id: siteId });
  assert.equal(freshSite.published_deploy.id, site.published_deploy.id);
  db = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 15000, statement_timeout: 30000 });
  await db.connect(); await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.deepEqual((await db.query('SELECT * FROM icc._prisma_migrations ORDER BY migration_name,id')).rows, ledger);
  for (const [key, query] of Object.entries(queries)) assert.deepEqual((await db.query(query)).rows, catalog[key]);
  await db.query('ROLLBACK'); await db.end(); db = undefined;
  const archive = await readFile(dump), catalogBytes = await readFile(path.join(directory, 'catalog.json'));
  assert.ok(archive.length > 1000);
  const manifest = { capturedAt: new Date().toISOString(), siteId, sourceCommit: expectedCommit, sourceDeploy: site.published_deploy.id, readOnly: true, snapshotBound: true, fullDatabase: true, ownerAclRetained: true, databaseVersion: identity.version, sha256: sha(archive), bytes: archive.length, catalogSha256: sha(catalogBytes), applied: 44, historical: 45, restoreValidated: false, productionReady: false };
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
  await mkdir('output/release-readback', { recursive: true });
  await writeFile('output/release-readback/production51-backup.json', JSON.stringify({ directory, ...manifest }, null, 2));
  console.log(JSON.stringify({ directory, sha256: manifest.sha256, bytes: manifest.bytes, snapshotBound: true, restoreValidated: false }));
} catch (error) {
  console.error('Production51 read-only backup stopped', { phase, code: typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'BACKUP_REJECTED', partialDirectory: directory });
  process.exitCode = 1;
} finally { if (db) { await db.query('ROLLBACK').catch(() => {}); await db.end().catch(() => {}); } }
