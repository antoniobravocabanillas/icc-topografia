import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { bootstrapNativeWorklogInTransaction, nativeBootstrapBaseline } from "./native-worklog-bootstrap";
import { readNativeWorklogCompleteCatalog } from "../lib/server/native-worklog-complete-catalog";
import { NativeWorklogCatalogError } from "../lib/server/native-worklog-combined-catalog";

/** Only called after LOCAL database/role/marker/empty-table guards. No source DDL. */
export async function testNativeLocalBootstrap(a: PrismaClient, b: PrismaClient) {
  const options = { maxWait: 1000, timeout: 30000 }; // Maintenance, not runtime accounting.
  const original = await a.$transaction(tx => nativeBootstrapBaseline(tx), options);
  await a.$transaction(async tx => {
    await tx.$executeRaw`DROP TABLE icc."TerraqoNativeWorklogFirstDecision",icc."TerraqoNativeWorklogAuthority",
      icc."TerraqoNativeWorklogDecision",icc."TerraqoNativeWorklogAccounting",icc."TerraqoNativeWorklogOperation"`;
    await tx.$executeRaw`DROP INDEX icc."NativeWorklogFirst_contribution_actor_key"`;
  }, options);
  assert.deepEqual(await b.$transaction(tx => readNativeWorklogCompleteCatalog(tx), options), { state: "absent" });
  await assert.rejects(() => a.$transaction(async tx => {
    assert.equal((await bootstrapNativeWorklogInTransaction(tx)).outcome, "created");
    throw new Error("OWN_BOOTSTRAP_AFTER_ALL_DDL_ROLLBACK");
  }, options), (error: unknown) => error instanceof Error && error.message === "OWN_BOOTSTRAP_AFTER_ALL_DDL_ROLLBACK");
  assert.deepEqual(await b.$transaction(tx => readNativeWorklogCompleteCatalog(tx), options), { state: "absent" });
  assert.equal(await b.$transaction(tx => nativeBootstrapBaseline(tx), options), original);
  // Two real independent callers; advisory locking serializes cooperating tools.
  // No pg_blocking_pids barrier: this asserts the concurrent result, not an observed wait.
  const results = await Promise.all([a, b].map(db => db.$transaction(tx => bootstrapNativeWorklogInTransaction(tx), options)));
  assert.deepEqual(results.map(result => result.outcome).sort(), ["created", "existing"]);
  for (const result of results) { assert.equal(result.baseline, original); assert.equal(result.constraints, 36); assert.equal(result.indexes, 16); }
  const exact = await b.$transaction(tx => readNativeWorklogCompleteCatalog(tx), options);
  assert.equal((await a.$transaction(tx => bootstrapNativeWorklogInTransaction(tx), options)).outcome, "existing");
  for (const ddl of [
    'ALTER TABLE icc."TerraqoNativeWorklogAccounting" ALTER COLUMN attempts SET DEFAULT 1',
    'DROP TABLE icc."TerraqoNativeWorklogFirstDecision"',
  ]) {
    await assert.rejects(() => a.$transaction(async tx => {
      await tx.$executeRawUnsafe(ddl); // Fixed DDL on the guarded local empty schema only.
      await assert.rejects(() => bootstrapNativeWorklogInTransaction(tx), NativeWorklogCatalogError);
      throw new Error("OWN_BOOTSTRAP_NEGATIVE_ROLLBACK");
    }, options), (error: unknown) => error instanceof Error && error.message === "OWN_BOOTSTRAP_NEGATIVE_ROLLBACK");
    assert.deepEqual(await b.$transaction(tx => readNativeWorklogCompleteCatalog(tx), options), exact);
  }
  assert.equal(await b.$transaction(tx => nativeBootstrapBaseline(tx), options), original);
  assert.equal(await b.user.count(), 0); assert.equal(await b.terraqoBuilderLedger.count(), 0);
  console.log(JSON.stringify({ outcome: "passed", environment: "LOCAL_ISOLATED_ONLY", bootstrap_proved: true,
    catalog_constraints: 36, catalog_indexes: 16, accounting_credits: 0, production_native_applied: false }));
}
