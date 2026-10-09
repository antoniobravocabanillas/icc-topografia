import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { NativeWorklogCatalogError } from "./native-worklog-combined-catalog";
import { readNativeWorklogCompleteCatalog } from "./native-worklog-complete-catalog";

/** DDL-only rollback, no identity, entries, grants, accounts, allocations or points. */
export async function nativeCompleteCatalogRollback(tx: Prisma.TransactionClient) {
  const initial = await readNativeWorklogCompleteCatalog(tx);
  if (initial.state === "exact") return initial;
  assert.deepEqual(initial, { state: "absent" });
  async function change(statements: string[], expected: "absent" | "exact" | "reject") {
    await tx.$executeRawUnsafe("SAVEPOINT native_complete_change");
    try {
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
      if (expected === "reject") await assert.rejects(() => readNativeWorklogCompleteCatalog(tx), NativeWorklogCatalogError);
      else assert.equal((await readNativeWorklogCompleteCatalog(tx)).state, expected);
    } finally {
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT native_complete_change");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT native_complete_change");
    }
  }
  await change(['CREATE SEQUENCE icc."NativeWorklogFirst_own_reserved"'], "reject");
  await change(['CREATE INDEX "NativeWorklogFirst_contribution_actor_key" ON icc."TerraqoBuilderContribution" ("id")'], "reject");
  assert.deepEqual(await readNativeWorklogCompleteCatalog(tx), initial);
  for (const name of ["20261008051000_native_worklog_operations", "20261008161000_native_worklog_decision",
    "20261008162500_native_worklog_content_key", "20261008232500_native_worklog_authority_snapshot",
    "20261009035000_native_worklog_first_decision"]) {
    const ddl = await readFile(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8");
    for (const statement of ddl.split(";").map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
    if (name !== "20261009035000_native_worklog_first_decision") {
      await assert.rejects(() => readNativeWorklogCompleteCatalog(tx), NativeWorklogCatalogError);
    }
  }
  const exact = await readNativeWorklogCompleteCatalog(tx);
  assert.equal(exact.state, "exact");
  assert.deepEqual(await readNativeWorklogCompleteCatalog(tx), exact);
  for (const statements of [
    ['DROP TABLE icc."TerraqoNativeWorklogFirstDecision"'],
    ['ALTER TABLE icc."TerraqoNativeWorklogFirstDecision" DROP CONSTRAINT "NativeWorklogFirstDecision_choice_check"'],
    ['ALTER TABLE icc."TerraqoNativeWorklogFirstDecision" ALTER COLUMN "priorEntries" SET DEFAULT 0'],
    ['ALTER TABLE icc."TerraqoNativeWorklogFirstDecision" ALTER COLUMN fingerprint DROP NOT NULL'],
    ['ALTER TABLE icc."TerraqoNativeWorklogFirstDecision" DROP CONSTRAINT "NativeWorklogFirstDecision_receipt_fk"'],
    ['ALTER TABLE icc."TerraqoNativeWorklogFirstDecision" DROP CONSTRAINT "NativeWorklogFirstDecision_contribution_fk"',
      'DROP INDEX icc."NativeWorklogFirst_contribution_actor_key"'],
    ['ALTER TABLE icc."TerraqoNativeWorklogFirstDecision" DROP CONSTRAINT "NativeWorklogFirstDecision_contribution_fk"',
      'DROP INDEX icc."NativeWorklogFirst_contribution_actor_key"',
      'CREATE UNIQUE INDEX "NativeWorklogFirst_contribution_actor_key" ON icc."TerraqoBuilderContribution" ("userId","id")'],
    ['CREATE INDEX "NativeWorklogFirst_own_extra" ON icc."TerraqoBuilderContribution" ("id")'],
    ['CREATE SEQUENCE icc."NativeWorklogOwn_Unexpected"'],
    ['ALTER TABLE icc."TerraqoNativeWorklogAccounting" ALTER COLUMN attempts SET DEFAULT 1'],
  ]) {
    await change(statements, "reject");
    assert.deepEqual(await readNativeWorklogCompleteCatalog(tx), exact);
  }
  return exact;
}
