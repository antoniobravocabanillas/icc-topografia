import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrationSourceChecksums } from './lib/migration-source-checksums.ts';

// Offline artifact generator. No provider client, environment loading or database connection.
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const migrationName = '20261120000200_certificate_disclosure_consent';
export const candidate = '70efdb368489d97e55fd475f5968def8003f4f91';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// Live staging readback supplied by the coordinating operator; preserve BOTH grantors.
export const expectedMembership = [
  { grantor: 'postgres', admin: false, inherit: true, set: false },
  { grantor: 'supabase_admin', admin: true, inherit: false, set: false },
];
export const membershipQuery = `SELECT jsonb_agg(jsonb_build_object('grantor',g.rolname,
  'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option) ORDER BY g.rolname)
  FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.grantor
  WHERE m.roleid='terraqo_staging_migrator'::regrole AND m.member='postgres'::regrole`;
export const tables = ['TerraqoClosureRevision', 'TerraqoCollaborationProposal',
  'TerraqoCollaborationAcceptance', 'TerraqoCollaborationClosure', 'TerraqoCollaboration',
  'TerraqoCollaborationCertificate', 'TerraqoWorkspaceInvitation',
  'TerraqoCertificateDisclosure', 'TerraqoCertificateDisclosureEvent'];
export const functions = ['certificate_disclosure_immutable','certificate_disclosure_event_guard'];
const literals = values => values.map(v => "'"+v+"'").join(',');
export const schemaChecks = `DO $disclosure_catalog$
BEGIN
  IF to_regclass('icc."TerraqoCertificateDisclosure"') IS NULL
    OR to_regclass('icc."TerraqoCertificateDisclosureEvent"') IS NULL
    OR (SELECT count(*) FROM pg_proc WHERE pronamespace='icc'::regnamespace AND proname IN ('certificate_disclosure_immutable','certificate_disclosure_event_guard') AND pronargs=0 AND NOT prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, icc'])<>2
    OR (SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN (VALUES
      ('certificate_disclosure_immutable','TerraqoCertificateDisclosure','certificate_disclosure_immutable'),
      ('certificate_disclosure_event_immutable','TerraqoCertificateDisclosureEvent','certificate_disclosure_immutable'),
      ('certificate_disclosure_event_guard','TerraqoCertificateDisclosureEvent','certificate_disclosure_event_guard')) e(t,n,f)
      ON t.tgname=e.t AND t.tgrelid=format('icc.%I',e.n)::regclass AND p.proname=e.f AND p.pronamespace='icc'::regnamespace
      WHERE t.tgenabled='O' AND NOT t.tgisinternal)<>3
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid IN ('icc."TerraqoCertificateDisclosure"'::regclass,'icc."TerraqoCertificateDisclosureEvent"'::regclass) AND contype='f' AND confdeltype='r' AND convalidated)<>5
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid IN ('icc."TerraqoCertificateDisclosure"'::regclass,'icc."TerraqoCertificateDisclosureEvent"'::regclass) AND contype='c' AND convalidated)<>3
    OR NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('icc."TerraqoCertificateDisclosureEvent_actorId_operationKey_key"') AND indisunique AND indisvalid)
  THEN RAISE EXCEPTION 'Disclosure catalog verification failed'; END IF;
END $disclosure_catalog$;`;

export const permissionChecks = `DO $s17_privileges$
DECLARE role_name text; privilege_name text; table_name text; function_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('terraqo_staging_runtime','terraqo_staging_migrator')
    AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls))
    OR NOT has_schema_privilege('terraqo_staging_runtime','icc','USAGE')
    OR has_schema_privilege('terraqo_staging_runtime','icc','CREATE')
    OR pg_has_role('terraqo_staging_runtime','terraqo_staging_migrator','MEMBER') THEN
    RAISE EXCEPTION 'Unsafe staging runtime or migrator role'; END IF;
  FOREACH table_name IN ARRAY ARRAY[${literals(tables.map(t => `icc."${t}"`))}] LOOP
    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF NOT has_table_privilege('terraqo_staging_runtime',table_name,privilege_name) THEN
        RAISE EXCEPTION 'Runtime DML permission missing'; END IF;
    END LOOP;
    FOREACH privilege_name IN ARRAY ARRAY['TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('terraqo_staging_runtime',table_name,privilege_name) THEN
        RAISE EXCEPTION 'Runtime permission too broad'; END IF;
    END LOOP;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_schema_privilege(role_name,'icc','USAGE') THEN RAISE EXCEPTION 'Private schema exposed'; END IF;
      FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF has_table_privilege(role_name,table_name,privilege_name) THEN RAISE EXCEPTION 'Private table exposed'; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  FOREACH function_name IN ARRAY ARRAY[${literals(functions.map(f => `icc.${f}()`))}] LOOP
    IF NOT has_function_privilege('terraqo_staging_runtime',function_name,'EXECUTE') THEN
      RAISE EXCEPTION 'Runtime function permission missing'; END IF;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_function_privilege(role_name,function_name,'EXECUTE') THEN RAISE EXCEPTION 'S17 function exposed'; END IF;
    END LOOP;
  END LOOP;
END $s17_privileges$;`;

export async function prepareArtifact(audit) {
  assert.equal(audit.project, 'mghdpciewbsowjrjwmwk');
  assert.equal(audit.database, 'postgres');
  assert.equal(audit.unfinished, 0);
  assert.equal(audit.publicSchemaAccess, false);
  assert.equal(audit.hasDisclosure, false);
  assert.equal(audit.migrationCount, 49);
  assert.ok(Array.isArray(audit.ledger));
  assert.equal(audit.ledger.length, 49);
  assert.equal(new Set(audit.ledger.map(r => r.migration_name)).size, 49);
  assert.deepEqual(audit.membership, expectedMembership);
  const rows = [...audit.ledger].sort((a, b) => a.migration_name.localeCompare(b.migration_name));
  for (const row of rows) {
    assert.match(row.migration_name, /^[a-z0-9_]+$/);
    assert.match(row.checksum, /^[a-f0-9]{64}$/);
    assert.notEqual(row.migration_name, migrationName);
    assert.ok(migrationSourceChecksums(await readFile(path.join(root, 'prisma/migrations', row.migration_name, 'migration.sql')))
      .has(row.checksum), `Source mismatch: ${row.migration_name}`);
  }
  const relative = `prisma/migrations/${migrationName}/migration.sql`;
  const source = await readFile(path.join(root, relative));
  const committed = execFileSync('git', ['show', `${candidate}:${relative}`], { cwd: root, windowsHide: true });
  assert.equal(source.toString('utf8').replaceAll('\r\n', '\n'), committed.toString('utf8').replaceAll('\r\n', '\n'),
    'Migration differs from authorized candidate');
  const checksum = sha256(source);
  let ddl = source.toString('utf8');
  assert.equal((ddl.match(/^BEGIN;\r?$/gm) || []).length, 1);
  assert.equal((ddl.match(/^COMMIT;\r?$/gm) || []).length, 1);
  assert.match(ddl, /COMMIT;\s*$/);
  // Only unwrap the migration's transaction; its full DDL body is unchanged.
  ddl = ddl.replace(/^BEGIN;\r?\n/m, '').replace(/COMMIT;\s*$/, '');
  assert.doesNotMatch(ddl, /^\s*(?:COMMIT|ROLLBACK|START TRANSACTION|PREPARE TRANSACTION);/im);
  const id = `${checksum.slice(0, 8)}-${checksum.slice(8, 12)}-${checksum.slice(12, 16)}-${checksum.slice(16, 20)}-${checksum.slice(20, 32)}`;
  const sql = `-- STAGING ONLY mghdpciewbsowjrjwmwk / postgres; candidate ${candidate}
-- Generated offline. Fresh backup + local restore gate required before separate authorized execution.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $s17_identity$ BEGIN
  IF current_database()<>'postgres' OR current_user<>'postgres' OR session_user<>'postgres'
    OR pg_has_role('postgres','terraqo_staging_migrator','SET')
    OR NOT pg_has_role('postgres','terraqo_staging_migrator','USAGE')
    OR (SELECT rolsuper FROM pg_roles WHERE rolname='postgres')
    OR (${membershipQuery}) IS DISTINCT FROM '${JSON.stringify(expectedMembership)}'::jsonb THEN
    RAISE EXCEPTION 'Unexpected database, actor or preexisting migrator elevation'; END IF;
END $s17_identity$;
CREATE TEMP TABLE s17_prior_membership ON COMMIT DROP AS
  SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members
  WHERE roleid='terraqo_staging_migrator'::regrole AND member='postgres'::regrole;
GRANT terraqo_staging_migrator TO postgres WITH SET TRUE;
SET LOCAL ROLE terraqo_staging_migrator;
LOCK TABLE icc._prisma_migrations IN EXCLUSIVE MODE;
DO $s17_ledger$ BEGIN
  IF EXISTS (SELECT 1 FROM icc._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL)
    OR (SELECT count(*) FROM icc._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 49
    OR EXISTS (SELECT 1 FROM icc._prisma_migrations WHERE migration_name='${migrationName}')
    OR EXISTS (SELECT 1 FROM (VALUES ${rows.map(r => `('${r.migration_name}','${r.checksum}')`).join(',\n')}) expected(name,checksum)
      WHERE NOT EXISTS (SELECT 1 FROM icc._prisma_migrations m WHERE m.migration_name=expected.name
        AND m.checksum=expected.checksum AND m.finished_at IS NOT NULL AND m.rolled_back_at IS NULL))
    OR to_regclass('icc."TerraqoCertificateDisclosure"') IS NOT NULL
    OR to_regclass('icc."TerraqoCertificateDisclosureEvent"') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='icc'::regnamespace AND proname IN ('certificate_disclosure_immutable','certificate_disclosure_event_guard')) THEN
    RAISE EXCEPTION 'S17 target or ledger changed; refresh preflight'; END IF;
END $s17_ledger$;
-- Hold writers out while comparing complete row multisets, including invitations and ledger history.
CREATE TEMP TABLE s17_prior_rows (table_name text NOT NULL, payload jsonb NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE s17_prior_tables (table_name text PRIMARY KEY) ON COMMIT DROP;
DO $s17_snapshot$ DECLARE t record; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='icc' ORDER BY tablename LOOP
    EXECUTE format('LOCK TABLE icc.%I IN SHARE ROW EXCLUSIVE MODE',t.tablename);
    INSERT INTO s17_prior_tables VALUES (t.tablename);
    EXECUTE format('INSERT INTO s17_prior_rows SELECT %L,to_jsonb(r) FROM icc.%I r',t.tablename,t.tablename);
  END LOOP;
END $s17_snapshot$;
${ddl}
DO $s17_preserve$ DECLARE t record; changed boolean; projection text; BEGIN
  FOR t IN SELECT table_name FROM s17_prior_tables LOOP
    projection := 'to_jsonb(r)';
    EXECUTE format('SELECT EXISTS ((SELECT payload FROM s17_prior_rows WHERE table_name=%L EXCEPT ALL SELECT %s FROM icc.%I r)
      UNION ALL (SELECT %s FROM icc.%I r EXCEPT ALL SELECT payload FROM s17_prior_rows WHERE table_name=%L))',
      t.table_name,projection,t.table_name,projection,t.table_name,t.table_name) INTO changed;
    IF changed THEN RAISE EXCEPTION 'S17 existing rows changed: %',t.table_name; END IF;
  END LOOP;

END $s17_preserve$;
${schemaChecks}
REVOKE ALL ON icc."TerraqoCertificateDisclosure", icc."TerraqoCertificateDisclosureEvent" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON icc."TerraqoCertificateDisclosure", icc."TerraqoCertificateDisclosureEvent" TO terraqo_staging_runtime;
-- Limit new function execution to the existing runtime and owning migrator.
${functions.map(f => `REVOKE ALL ON FUNCTION icc.${f}() FROM PUBLIC, anon, authenticated, service_role;\nGRANT EXECUTE ON FUNCTION icc.${f}() TO terraqo_staging_runtime;`).join('\n')}
${permissionChecks}
INSERT INTO icc._prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
VALUES ('${id}','${checksum}',now(),'${migrationName}',now(),1);
RESET ROLE;
GRANT terraqo_staging_migrator TO postgres WITH SET FALSE;
DO $s17_exit$ BEGIN
  IF pg_has_role('postgres','terraqo_staging_migrator','SET')
    OR NOT pg_has_role('postgres','terraqo_staging_migrator','USAGE')
    OR EXISTS (
      (SELECT * FROM s17_prior_membership EXCEPT ALL
        SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members
        WHERE roleid='terraqo_staging_migrator'::regrole AND member='postgres'::regrole)
      UNION ALL
      (SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members
        WHERE roleid='terraqo_staging_migrator'::regrole AND member='postgres'::regrole
        EXCEPT ALL SELECT * FROM s17_prior_membership)
    ) THEN RAISE EXCEPTION 'Migrator membership changed or SET leaked'; END IF;
END $s17_exit$;
COMMIT;
`;
  return { sql, checksum, artifactSha256: sha256(sql), audit };
}

async function main() {
  assert.equal(process.argv.length, 3, 'Usage: node scripts/prepare-s17-disclosure-staging-migration.mjs <audit.json>');
  const prepared = await prepareArtifact(JSON.parse(await readFile(path.resolve(process.argv[2]), 'utf8')));
  const directory = path.join(root, 'output/s17-disclosure');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'staging-migration.sql'), prepared.sql);
  await writeFile(path.join(directory, 'staging-migration.json'), JSON.stringify({ ...prepared, sql: undefined,
    candidate, migrationName, preparedAt: new Date().toISOString(), applied: false }, null, 2));
  console.log(JSON.stringify({ prepared: true, applied: false, baseline: 49, target: 50,
    checksum: prepared.checksum, artifactSha256: prepared.artifactSha256, artifact: 'output/s17-disclosure/staging-migration.sql',
    backupRequired: true, restoreRequired: true, remoteWrites: false }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
