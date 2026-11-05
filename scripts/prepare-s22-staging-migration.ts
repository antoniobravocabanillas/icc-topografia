import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { migrationSourceChecksums } from "./lib/migration-source-checksums";

// Generates an artifact only. Applying it requires a separate verified backup/restore gate.
async function main() {
  assert.ok(process.argv[2], "Provide the saved staging ledger audit");
  const audit = JSON.parse(await readFile(process.argv[2], "utf8"));
  assert.equal(audit.project, "mghdpciewbsowjrjwmwk");
  assert.equal(audit.database, "postgres");
  assert.equal(audit.unfinished, 0);
  assert.equal(audit.publicSchemaAccess, false);
  const evaluators = process.argv.includes("--evaluators");
  const baselineCount = evaluators ? 47 : 46;
  if (evaluators) {
    assert.ok(audit.invitationTable);
    assert.equal(audit.evaluatorTable, null);
  } else assert.equal(audit.invitationTable, null);
  assert.equal(audit.migrationCount, baselineCount);
  const rows: Array<{ migration_name: string; checksum: string }> = audit.ledger;
  assert.equal(rows.length, baselineCount);
  assert.equal(new Set(rows.map(row => row.migration_name)).size, rows.length);
  for (const row of rows) {
    assert.match(row.migration_name, /^[a-z0-9_]+$/);
    assert.match(row.checksum, /^[a-f0-9]{64}$/);
    assert.ok(migrationSourceChecksums(await readFile(`prisma/migrations/${row.migration_name}/migration.sql`)).has(row.checksum));
  }
  const name = evaluators ? "20261104000300_workspace_evaluators" : "20261104000100_workspace_invitations";
  assert.ok(!rows.some(row => row.migration_name === name));
  const source = await readFile(`prisma/migrations/${name}/migration.sql`);
  const checksum = createHash("sha256").update(source).digest("hex");
  let ddl = source.toString("utf8");
  if (evaluators) {
    // Keep the role switch, ledger write, data checks and DDL in one transaction.
    assert.match(ddl, /^BEGIN;[\s\S]*COMMIT;\s*$/);
    ddl = ddl.replace(/^BEGIN;\s*/, "").replace(/COMMIT;\s*$/, "");
    assert.ok(!/^\s*(?:BEGIN|COMMIT|ROLLBACK);/im.test(ddl));
  }
  const tables = evaluators ? ["TerraqoWorkspaceInvitation", "TerraqoWorkspaceEvaluator", "TerraqoWorkspaceEvaluatorAssignment"] : ["TerraqoWorkspaceInvitation"];
  const targetTable = evaluators ? "TerraqoWorkspaceEvaluator" : "TerraqoWorkspaceInvitation";
  const values = rows.map(row => `('${row.migration_name}', '${row.checksum}')`).join(",\n");
  const sql = `-- STAGING ONLY mghdpciewbsowjrjwmwk. Not executed by this generator.
-- Require fresh backup and verified restore; execute as a single transaction.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
GRANT terraqo_staging_migrator TO postgres WITH SET TRUE;
SET LOCAL ROLE terraqo_staging_migrator;
LOCK TABLE icc._prisma_migrations IN EXCLUSIVE MODE;
DO $guard$
BEGIN
  IF current_database() <> 'postgres' OR current_user <> 'terraqo_staging_migrator'
    OR to_regclass('icc."${targetTable}"') IS NOT NULL
    OR EXISTS (SELECT 1 FROM icc._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL)
    OR (SELECT count(*) FROM icc._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) <> ${baselineCount}
    OR EXISTS (SELECT 1 FROM (VALUES ${values}) AS expected(name,checksum) WHERE NOT EXISTS (
      SELECT 1 FROM icc._prisma_migrations m WHERE m.migration_name=expected.name AND m.checksum=expected.checksum AND m.finished_at IS NOT NULL AND m.rolled_back_at IS NULL
    )) THEN RAISE EXCEPTION 'Target or ledger changed; refresh preflight'; END IF;
END $guard$;
${evaluators ? `LOCK TABLE icc."TerraqoWorkspaceInvitation" IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE prior_invitations ON COMMIT DROP AS
  SELECT id, md5(to_jsonb(i)::text) AS fingerprint FROM icc."TerraqoWorkspaceInvitation" i;` : ""}
${ddl}
${evaluators ? `DO $preserve$ BEGIN
  IF EXISTS (SELECT 1 FROM prior_invitations p FULL JOIN icc."TerraqoWorkspaceInvitation" i USING(id)
    WHERE p.id IS NULL OR i.id IS NULL OR i."canReadEvaluations" OR
      p.fingerprint <> md5((to_jsonb(i) - 'canReadEvaluations')::text)) THEN
    RAISE EXCEPTION 'Existing invitations changed'; END IF;
END $preserve$;` : ""}
DO $privileges$
DECLARE role_name text; privilege_name text; table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[${tables.map(t => `'icc."${t}"'`).join(",")}] LOOP
  FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
    IF NOT has_table_privilege('terraqo_staging_runtime',table_name,privilege_name) THEN
      RAISE EXCEPTION 'Runtime default grants missing; rollback'; END IF;
  END LOOP;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_schema_privilege(role_name,'icc','USAGE') THEN RAISE EXCEPTION 'Private schema exposed'; END IF;
    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege(role_name,table_name,privilege_name) THEN
        RAISE EXCEPTION 'Invitation table exposed'; END IF;
    END LOOP;
  END LOOP;
  END LOOP;
END $privileges$;
INSERT INTO icc._prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
VALUES ('${randomUUID()}','${checksum}',now(),'${name}',now(),1);
RESET ROLE;
GRANT terraqo_staging_migrator TO postgres WITH SET FALSE;
COMMIT;
`;
  await mkdir("output/s22", { recursive: true });
  const artifact = evaluators ? "output/s22/evaluator-migration.sql" : "output/s22/staging-migration.sql";
  await writeFile(artifact, sql);
  console.log(JSON.stringify({ prepared: true, applied: false, ledgerRows: rows.length, checksum, backupRequired: true, restoreRequired: true, artifact }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Preparation failed"); process.exitCode = 1; });
