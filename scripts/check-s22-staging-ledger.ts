import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { migrationSourceChecksums } from "./lib/migration-source-checksums";

// Offline audit only. No connection, credentials, DDL or provider mutations.
async function main() {
  const file = process.argv[2];
  assert.ok(file, "Provide the saved staging catalog audit");
  const audit = JSON.parse(await readFile(file, "utf8"));
  assert.equal(audit.project, "mghdpciewbsowjrjwmwk");
  assert.equal(audit.name, "Terraqo Platform Staging");
  assert.equal(audit.database, "postgres");
  assert.equal(audit.readOnly, true);
  assert.equal(audit.unfinished, 0);
  assert.equal(audit.publicSchemaAccess, false);
  assert.ok(Array.isArray(audit.ledger));
  assert.equal(audit.migrationCount, audit.ledger.length);
  const applied = new Set<string>();
  for (const row of audit.ledger) {
    assert.match(row.migration_name, /^[a-z0-9_]+$/);
    assert.match(row.checksum, /^[a-f0-9]{64}$/);
    assert.ok(!applied.has(row.migration_name));
    applied.add(row.migration_name);
    assert.ok(migrationSourceChecksums(await readFile(`prisma/migrations/${row.migration_name}/migration.sql`)).has(row.checksum), `Source mismatch: ${row.migration_name}`);
  }
  const names = (await readdir("prisma/migrations", { withFileTypes: true })).filter(item => item.isDirectory()).map(item => item.name);
  const missing = names.filter(name => !applied.has(name));
  const invitationApplied = applied.has("20261104000100_workspace_invitations");
  assert.equal(Boolean(audit.invitationTable), invitationApplied, "Invitation catalog and ledger disagree");
  console.log(JSON.stringify({ sourceChecksumsVerified: applied.size, missing, invitationSchemaReady: invitationApplied, hostedAcceptanceVerified: false, remoteWrites: false }, null, 2));
  if (missing.length) process.exitCode = 2;
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Ledger audit failed"); process.exitCode = 1; });
