import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';

// Produces a reviewable SQL artifact only. Never applies DDL or opens a connection.
const readback = process.argv[2];
assert.ok(readback, 'Provide the confirmed staging ledger readback');

const rows = JSON.parse(await readFile(readback, 'utf8'));
assert.equal(rows.length, 45);
for (const row of rows) {
 assert.match(row.migration_name, /^[a-z0-9_]+$/);
 assert.match(row.checksum, /^[a-f0-9]{64}$/);
 const appliedBytes = await readFile(`prisma/migrations/${row.migration_name}/migration.sql`);
 assert.equal(createHash('sha256').update(appliedBytes).digest('hex'), row.checksum);
}
const name = '20261104000200_customer_attention_followup';
const bytes = await readFile(`prisma/migrations/${name}/migration.sql`);
const checksum = createHash('sha256').update(bytes).digest('hex');
const values = rows.map(r => `('${r.migration_name}', '${r.checksum}')`).join(',\n');
// The checker only accepts repository directory names; still enforce SQL literals strictly.
for (const row of rows) assert.match(row.migration_name, /^[a-z0-9_]+$/);
const sql = `-- STAGING ONLY: mghdpciewbsowjrjwmwk. Requires verified backup and restore before execution.
-- Run the whole artifact in one transaction through the confirmed staging connector.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
GRANT terraqo_staging_migrator TO postgres WITH SET TRUE;
SET LOCAL ROLE terraqo_staging_migrator;
DO $guard$
BEGIN
  IF current_database() <> 'postgres' OR current_user <> 'terraqo_staging_migrator' THEN
    RAISE EXCEPTION 'Unexpected staging database or migration role';
  END IF;
  IF has_schema_privilege('anon', 'icc', 'USAGE') OR has_schema_privilege('authenticated', 'icc', 'USAGE') THEN
    RAISE EXCEPTION 'Private schema exposed';
  END IF;
END $guard$;
LOCK TABLE icc."_prisma_migrations" IN EXCLUSIVE MODE;
DO $ledger$
BEGIN
  IF EXISTS (SELECT 1 FROM icc."_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL)
    OR (SELECT count(*) FROM icc."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) <> ${rows.length}
    OR EXISTS (
      SELECT 1 FROM (VALUES ${values}) AS expected(name, checksum)
      WHERE NOT EXISTS (SELECT 1 FROM icc."_prisma_migrations" m
        WHERE m.migration_name=expected.name AND m.checksum=expected.checksum
          AND m.finished_at IS NOT NULL AND m.rolled_back_at IS NULL)
    ) THEN RAISE EXCEPTION 'Migration ledger changed; refresh preflight'; END IF;
END $ledger$;
${bytes.toString('utf8')}
DO $permissions$
DECLARE role_name text; privilege_name text;
BEGIN
  IF NOT has_table_privilege('terraqo_staging_runtime', 'icc."ChatConversation"', 'SELECT')
    OR NOT has_table_privilege('terraqo_staging_runtime', 'icc."ChatConversation"', 'INSERT')
    OR NOT has_table_privilege('terraqo_staging_runtime', 'icc."ChatConversation"', 'UPDATE')
    OR NOT has_table_privilege('terraqo_staging_runtime', 'icc."ChatConversation"', 'DELETE') THEN
    RAISE EXCEPTION 'Runtime permissions missing; rollback migration';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_schema_privilege(role_name, 'icc', 'USAGE') THEN
      RAISE EXCEPTION 'Private schema exposed; rollback migration';
    END IF;
    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege(role_name, 'icc."ChatConversation"', privilege_name) THEN
        RAISE EXCEPTION 'Request table exposed; rollback migration';
      END IF;
    END LOOP;
  END LOOP;
END $permissions$;
INSERT INTO icc."_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
VALUES ('${randomUUID()}', '${checksum}', now(), '${name}', now(), 1);
RESET ROLE;
GRANT terraqo_staging_migrator TO postgres WITH SET FALSE;
`;
await writeFile('output/attention-staging-migration.sql', sql);
console.log(JSON.stringify({ prepared: true, applied: false, checksum, ledgerRows: rows.length,
  artifact: 'output/attention-staging-migration.sql', backupRequired: true, restoreRequired: true }));
