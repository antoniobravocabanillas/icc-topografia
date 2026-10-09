import assert from "node:assert/strict";
import { Prisma, PrismaClient } from "@prisma/client";
import { assertNativeWorklogSchemaInTransaction } from "../lib/server/native-worklog-schema-gate";
import { readNativeWorklogCompleteCatalog, NATIVE_WORKLOG_COMPLETE_PIN } from "../lib/server/native-worklog-complete-catalog";
import { NativeWorklogBudget } from "../lib/server/native-worklog-budget";

/** Empty, marker-guarded disposable LOCAL PG17 schema only. No production DDL. */
export async function testNativeLocalSchemaGate(db: PrismaClient) {
  const before = await db.$transaction(tx => readNativeWorklogCompleteCatalog(tx), { maxWait: 1000, timeout: 7000 });
  assert.deepEqual(before, { state: "exact", fingerprint: NATIVE_WORKLOG_COMPLETE_PIN, constraints: 36, indexes: 16 });
  await db.$transaction(async tx => {
    await assertNativeWorklogSchemaInTransaction(tx, new NativeWorklogBudget());
    const locks = await tx.$queryRaw<{ count: bigint }[]>(Prisma.sql`SELECT count(*) FROM pg_locks l
      JOIN pg_class c ON c.oid=l.relation JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE l.pid=pg_backend_pid() AND l.mode='AccessShareLock' AND l.granted AND n.nspname='icc'
      AND c.relname IN ('TerraqoNativeWorklogOperation','TerraqoNativeWorklogAccounting',
      'TerraqoNativeWorklogDecision','TerraqoNativeWorklogAuthority','TerraqoNativeWorklogFirstDecision','TerraqoBuilderContribution')`);
    assert.equal(Number(locks[0].count), 6);
  }, { maxWait: 1000, timeout: 7000 });
  const changed = [
    'ALTER TABLE icc."TerraqoNativeWorklogAccounting" ALTER COLUMN attempts SET DEFAULT 1',
    'CREATE SEQUENCE icc."NativeWorklogUnexpectedOwnGate"',
    'DROP TABLE icc."TerraqoNativeWorklogFirstDecision"',
    'ALTER TABLE icc."TerraqoNativeWorklogFirstDecision" DROP CONSTRAINT "NativeWorklogFirstDecision_contribution_fk"; DROP INDEX icc."NativeWorklogFirst_contribution_actor_key"',
    'DROP TABLE icc."TerraqoNativeWorklogFirstDecision",icc."TerraqoNativeWorklogAuthority",icc."TerraqoNativeWorklogDecision",icc."TerraqoNativeWorklogAccounting",icc."TerraqoNativeWorklogOperation"; DROP INDEX icc."NativeWorklogFirst_contribution_actor_key"',
  ];
  for (const [caseIndex, ddl] of changed.entries()) {
    let rejected = false;
    const rollback = new Error("OWN_LOCAL_GATE_ROLLBACK");
    await assert.rejects(() => db.$transaction(async tx => {
      // Only this empty isolated schema. One fixed statement at a time; no inputs.
      for (const statement of ddl.split("; ")) await tx.$executeRawUnsafe(statement);
      try { await assertNativeWorklogSchemaInTransaction(tx, new NativeWorklogBudget()); }
      catch { rejected = true; }
      assert.equal(rejected, true);
      throw rollback;
    }, { maxWait: 1000, timeout: 7000 }), error => {
      const expectedRollback = error instanceof Error && error.message === rollback.message;
      if (!expectedRollback) console.log(JSON.stringify({ outcome: "failed", schema_case: caseIndex,
        category: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error instanceof assert.AssertionError ? "assertion" : "unknown" }));
      return expectedRollback;
    });
    assert.deepEqual(await db.$transaction(tx => readNativeWorklogCompleteCatalog(tx), { maxWait: 1000, timeout: 7000 }), before);
  }
  let clock = 0;
  const exhausted = new NativeWorklogBudget(() => clock);
  clock = 48000;
  await assert.rejects(() => db.$transaction(tx => assertNativeWorklogSchemaInTransaction(tx, exhausted),
    { maxWait: 1000, timeout: 7000 }));
  assert.equal(await db.user.count(), 0); assert.equal(await db.terraqoBuilderLedger.count(), 0);
  console.log(JSON.stringify({ outcome: "passed", environment: "LOCAL_ISOLATED_ONLY",
    schema_gate_proved: true, catalog_constraints: 36, catalog_indexes: 16,
    rejected_schema_cases: changed.length, own_table_locks: 6, accounting_credits: 0 }));
}
