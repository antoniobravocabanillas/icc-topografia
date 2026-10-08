import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { persistNativeAccountingRetryInTransaction } from "../lib/server/native-worklog-accounting-retry";
import type { NativeAccountingRetrySnapshot } from "../lib/server/native-worklog-accounting-retry-policy";

/** Own temporary fixture only, under the pinned checker's outer DDL rollback. */
export async function nativeAccountingRetryRollback(tx: Prisma.TransactionClient, workspaceId: string) {
  const marker = randomUUID(), id = createHash("sha256").update(marker).digest("hex");
  const user = await tx.user.create({ data: { name: `ICC accounting retry rollback ${marker}`,
    email: `native-retry-${marker}@example.invalid`, role: "CUSTOMER" } });
  const profile = await tx.terraqoProfessionalProfile.create({ data: { userId: user.id, visibility: "PRIVATE", liveCvEnabled: false } });
  const stamp = new Date("2026-09-01T12:00:00.000Z"), fingerprint = "b".repeat(64);
  const entry = await tx.terraqoWorklogEntry.create({ data: { authorId: user.id, professionalProfileId: profile.id,
    workspaceId, title: "Own retry metadata", summary: "Temporary own retry transition only.", visibility: "PRIVATE",
    createdAt: stamp, updatedAt: stamp } });
  await tx.terraqoNativeWorklogOperation.create({ data: { id, actorId: user.id, workspaceId, professionalProfileId: profile.id,
    operationKey: "a".repeat(32), fingerprint, targetWorklogId: entry.id, worklogId: entry.id, resultVersion: stamp, createdAt: stamp } });
  await tx.terraqoNativeWorklogAccounting.create({ data: { operationId: id, nextAttemptAt: stamp } });
  await tx.terraqoNativeWorklogDecision.create({ data: { operationId: id, contentKey: "c".repeat(64),
    policyVersion: "native-declared-lima-v1", fingerprint, createdAt: stamp,
    dayStart: new Date("2026-09-01T05:00:00.000Z"), dayEndExclusive: new Date("2026-09-02T05:00:00.000Z"),
    trustStartInclusive: new Date(stamp.getTime() - 7 * 86400000), trustEndInclusive: stamp,
    availableAt: new Date(stamp.getTime() + 7 * 86400000), priorDuplicates: 0, rewardedInDay: 0,
    trustedInWindow: 0, tqPoints: 1, trustScore: 1, qualityScore: 55, moderationStatus: "DECLARED", riskScore: 0 } });
  const account = await tx.terraqoBuilderAccount.create({ data: { userId: user.id, pendingPoints: 3,
    availablePoints: 2, lifetimeEarned: 2, contributionScore: 2, trustScore: 4 } });
  const decision = await tx.terraqoNativeWorklogDecision.findUniqueOrThrow({ where: { operationId: id } });
  const accountBefore = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } });
  const entryBefore = await tx.terraqoWorklogEntry.findUniqueOrThrow({ where: { id: entry.id } });
  const read = () => tx.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId: id } });
  async function expected(): Promise<NativeAccountingRetrySnapshot> {
    const row = await read(); return { state: row.state as NativeAccountingRetrySnapshot["state"], attempts: row.attempts,
      nextAttemptAt: row.nextAttemptAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null };
  }
  async function protectedUnchanged() {
    assert.deepEqual(await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } }), accountBefore);
    assert.deepEqual(await tx.terraqoWorklogEntry.findUniqueOrThrow({ where: { id: entry.id } }), entryBefore);
    assert.deepEqual(await tx.terraqoNativeWorklogDecision.findUniqueOrThrow({ where: { operationId: id } }), decision);
    assert.equal(await tx.terraqoBuilderContribution.count({ where: { userId: user.id } }), 0);
    assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 0);
  }
  const transient = { kind: "TRANSIENT_FAILURE" as const }, initial = await expected();
  await tx.$executeRawUnsafe("SAVEPOINT own_retry_write");
  const first = await persistNativeAccountingRetryInTransaction(tx, id, initial, transient);
  assert.equal(first.outcome, "persisted"); assert.equal((await read()).attempts, 1);
  // The write is real SQL. Rolling back its surrounding transaction/savepoint removes it.
  await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_retry_write");
  await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_retry_write");
  assert.deepEqual(await expected(), initial); await protectedUnchanged();
  await tx.$executeRawUnsafe("SAVEPOINT own_retry_fault");
  const faulty = new Proxy(tx, { get(target, key) {
    if (key !== "terraqoNativeWorklogAccounting") return Reflect.get(target, key);
    return new Proxy(target.terraqoNativeWorklogAccounting, { get(model, method) {
      if (method !== "updateMany") return Reflect.get(model, method);
      return async (args: Prisma.TerraqoNativeWorklogAccountingUpdateManyArgs) => {
        await model.updateMany(args);
        assert.equal((await read()).attempts, 1); // Real SQL write before controlled acknowledgement fault.
        return { count: 0 };
      };
    } });
  } });
  await assert.rejects(() => persistNativeAccountingRetryInTransaction(faulty, id, initial, transient), error =>
    error instanceof Error && "status" in error && error.status === 503);
  await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_retry_fault");
  await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_retry_fault");
  assert.deepEqual(await expected(), initial); await protectedUnchanged();
  const started = Date.now();
  assert.equal((await persistNativeAccountingRetryInTransaction(tx, id, initial, transient)).outcome, "persisted");
  const once = await read(); assert.equal(once.attempts, 1); assert.equal(once.state, "PENDING");
  assert.ok(once.nextAttemptAt.getTime() >= started + 60000);
  assert.equal((await persistNativeAccountingRetryInTransaction(tx, id, initial, transient)).outcome, "stale");
  assert.deepEqual(await read(), once); await protectedUnchanged();
  for (let attempts = 2; attempts <= 8; attempts++) {
    assert.equal((await persistNativeAccountingRetryInTransaction(tx, id, await expected(), transient)).outcome, "persisted");
    assert.equal((await read()).attempts, attempts);
  }
  const quarantined = await read(); assert.equal(quarantined.state, "QUARANTINED"); assert.equal(quarantined.completedAt, null);
  assert.equal((await persistNativeAccountingRetryInTransaction(tx, id, await expected(), transient)).outcome, "unchanged");
  assert.deepEqual(await read(), quarantined); await protectedUnchanged();
  await tx.$executeRawUnsafe("SAVEPOINT own_retry_other");
  await tx.terraqoNativeWorklogAccounting.update({ where: { operationId: id }, data: { state: "PENDING", attempts: 0, nextAttemptAt: stamp } });
  const deferred = await persistNativeAccountingRetryInTransaction(tx, id, await expected(), { kind: "DEFERRED", resumeAt: "2099-01-01T00:00:00.000Z" });
  assert.equal(deferred.outcome, "persisted"); assert.equal((await read()).attempts, 0);
  assert.equal((await read()).nextAttemptAt.toISOString(), "2099-01-01T00:00:00.000Z");
  assert.equal((await persistNativeAccountingRetryInTransaction(tx, id, await expected(), { kind: "ACKNOWLEDGEMENT_UNKNOWN" })).outcome, "persisted");
  assert.equal((await read()).state, "QUARANTINED"); assert.equal((await read()).attempts, 0);
  await protectedUnchanged();
  // Synthetic historical APPLIED only tests preservation, never completed accounting authority.
  await tx.terraqoNativeWorklogAccounting.update({ where: { operationId: id }, data: { state: "APPLIED", completedAt: stamp } });
  const applied = await read();
  assert.equal((await persistNativeAccountingRetryInTransaction(tx, id, await expected(), transient)).outcome, "unchanged");
  assert.deepEqual(await read(), applied);
  await tx.terraqoNativeWorklogDecision.delete({ where: { operationId: id } });
  await assert.rejects(() => persistNativeAccountingRetryInTransaction(tx, id, initial, transient), error =>
    error instanceof Error && "status" in error && error.status === 503);
  assert.deepEqual(await read(), applied);
  await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_retry_other");
  await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_retry_other");
  await protectedUnchanged(); assert.deepEqual(await read(), quarantined);
  await tx.terraqoBuilderAccount.delete({ where: { id: account.id } });
  await tx.terraqoNativeWorklogDecision.delete({ where: { operationId: id } });
  await tx.terraqoNativeWorklogAccounting.delete({ where: { operationId: id } });
  await tx.terraqoNativeWorklogOperation.delete({ where: { id } });
  await tx.user.delete({ where: { id: user.id } });
  assert.equal(await tx.user.count({ where: { id: user.id } }), 0);
  assert.equal(await tx.terraqoBuilderAccount.count({ where: { userId: user.id } }), 0);
}
