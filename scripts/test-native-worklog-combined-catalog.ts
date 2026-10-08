import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { NativeWorklogCatalogError, readNativeWorklogCombinedCatalog } from "./native-worklog-combined-catalog";

/** Schema-only cases inside the checker's outer rollback; no users, entries or points. */
export async function nativeCombinedCatalogRollback(tx: Prisma.TransactionClient) {
  const initial = await readNativeWorklogCombinedCatalog(tx);
  if (initial.state === "exact") return initial;
  assert.deepEqual(initial, { state: "absent" });
  const migrations = ["20261008051000_native_worklog_operations", "20261008161000_native_worklog_decision", "20261008162500_native_worklog_content_key"];
  for (const [position, name] of migrations.entries()) {
    const ddl = await readFile(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8");
    for (const statement of ddl.split(";").map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
    if (position < 2) await assert.rejects(() => readNativeWorklogCombinedCatalog(tx), NativeWorklogCatalogError);
  }
  const exact = await readNativeWorklogCombinedCatalog(tx);
  assert.equal(exact.state, "exact");
  assert.deepEqual(await readNativeWorklogCombinedCatalog(tx), exact);
  async function reject(change: string) {
    await tx.$executeRawUnsafe("SAVEPOINT native_combined_invalid");
    try {
      await tx.$executeRawUnsafe(change);
      await assert.rejects(() => readNativeWorklogCombinedCatalog(tx), NativeWorklogCatalogError);
    } finally {
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT native_combined_invalid");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT native_combined_invalid");
    }
    assert.deepEqual(await readNativeWorklogCombinedCatalog(tx), exact);
  }
  await reject('ALTER TABLE icc."TerraqoNativeWorklogAccounting" ALTER COLUMN attempts SET DEFAULT 1');
  await reject('ALTER TABLE icc."TerraqoNativeWorklogDecision" DROP CONSTRAINT "NativeWorklogDecision_content_key_check"');
  await reject('DROP INDEX icc."NativeWorklogDecision_content_created_idx"');
  await reject('CREATE INDEX "NativeWorklogDecision_own_extra" ON icc."TerraqoNativeWorklogDecision" ("operationId")');
  await reject('DROP TABLE icc."TerraqoNativeWorklogDecision"');
  return exact;
}
