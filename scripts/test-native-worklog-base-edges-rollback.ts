import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { parseNativeWorklogPayload } from "../lib/server/native-worklog-payload";
import { nativeWorklogContentKey } from "../lib/server/native-worklog-content-key";
import { decideNativeDeclaredWorklog } from "../lib/server/native-worklog-base-decision";
import { applyNativeWorklogBaseInTransaction } from "../lib/server/native-worklog-base-accounting";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";

/** Only inside the pinned checker's outer DDL rollback, never standalone. */
export async function nativeBaseEdgesRollback(tx: Prisma.TransactionClient, workspaceId: string) {
  for (const counts of [
    { priorDuplicates: 1, rewardedInDay: 0, trustedInWindow: 0 },
    { priorDuplicates: 0, rewardedInDay: 0, trustedInWindow: 10 },
    { priorDuplicates: 0, rewardedInDay: 3, trustedInWindow: 0 },
    { priorDuplicates: 0, rewardedInDay: 3, trustedInWindow: 10 },
    { priorDuplicates: 0, rewardedInDay: 0, trustedInWindow: 0 },
  ]) {
    const marker = randomUUID(), id = createHash("sha256").update(marker).digest("hex");
    const user = await tx.user.create({ data: { name: `ICC base-edges rollback ${marker}`,
      email: `native-base-edges-${marker}@example.invalid`, role: "CUSTOMER" } });
    const profile = await tx.terraqoProfessionalProfile.create({ data: { userId: user.id, visibility: "PRIVATE", liveCvEnabled: false } });
    const parsed = await parseNativeWorklogPayload(new Request("https://example.invalid/own", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ operationKey: "a".repeat(32),
        title: "ICC own release", summary: "Own temporary SQL release evidence only.", outcome: "", type: "FIELD_UPDATE", projectId: "", projectVersion: "" }) }));
    const d = decideNativeDeclaredWorklog(parsed, "2026-09-01T12:00:00.000Z", counts);
    const stamp = new Date(d.createdAt), contentKey = nativeWorklogContentKey(parsed.payload);
    const entry = await tx.terraqoWorklogEntry.create({ data: { authorId: user.id, professionalProfileId: profile.id,
      workspaceId, title: parsed.payload.title, summary: parsed.payload.summary, visibility: "PRIVATE",
      contentFingerprint: contentKey, createdAt: stamp, updatedAt: stamp } });
    await tx.terraqoNativeWorklogOperation.create({ data: { id, actorId: user.id, workspaceId, professionalProfileId: profile.id,
      operationKey: parsed.payload.operationKey, fingerprint: d.fingerprint, targetWorklogId: entry.id,
      worklogId: entry.id, resultVersion: stamp, createdAt: stamp } });
    await tx.terraqoNativeWorklogAccounting.create({ data: { operationId: id } });
    await tx.terraqoNativeWorklogDecision.create({ data: { operationId: id, contentKey,
      policyVersion: d.policyVersion, fingerprint: d.fingerprint, priorDuplicates: d.priorDuplicates,
      rewardedInDay: d.rewardedInDay, trustedInWindow: d.trustedInWindow, tqPoints: d.tqPoints,
      trustScore: d.trustScore, qualityScore: d.qualityScore, moderationStatus: d.moderationStatus, riskScore: d.riskScore,
      createdAt: stamp, dayStart: new Date(d.dayStart), dayEndExclusive: new Date(d.dayEndExclusive),
      trustStartInclusive: new Date(d.trustStartInclusive), trustEndInclusive: new Date(d.trustEndInclusive), availableAt: new Date(d.availableAt) } });
    const snapshot = await tx.terraqoNativeWorklogDecision.findUniqueOrThrow({ where: { operationId: id } });
    async function rejected(run: () => Promise<unknown>, expected: number) {
      await tx.$executeRawUnsafe("SAVEPOINT own_base_edges");
      await assert.rejects(run, (e: unknown) => e instanceof NativeWorklogOperationError && e.status === expected);
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_base_edges");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_base_edges");
    }
    // Manual policy counts, not SQL quota/auth provenance. All child states roll back.
    if (d.tqPoints === 1 && d.trustScore === 1) {
  // All balances and backlog rows below belong to this NEW fixture and are rolled back.
  for (const field of ["pendingPoints", "trustScore"] as const) {
    await rejected(async () => {
      const a = await tx.terraqoBuilderAccount.create({ data: { userId: user.id, [field]: 2147483647 } });
      await assert.rejects(() => applyNativeWorklogBaseInTransaction(tx, id),
        (error: unknown) => error instanceof NativeWorklogOperationError && error.status === 503);
      assert.equal((await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: a.id } }))[field], 2147483647);
      throw new NativeWorklogOperationError(503);
    }, 503);
  }
  await rejected(async () => {
    const a = await tx.terraqoBuilderAccount.create({ data: { userId: user.id } });
    await tx.terraqoBuilderContribution.createMany({ data: Array.from({ length: 201 }, (_, i) => ({
      userId: user.id, type: "BUG_REPORT" as const, title: `Own backlog ${i}`, detail: "Own rollback only",
      approvedPoints: 0, availableAt: new Date(Date.now() + 86400000),
    })) });
    await assert.rejects(() => applyNativeWorklogBaseInTransaction(tx, id),
      (error: unknown) => error instanceof NativeWorklogOperationError && error.status === 503);
    assert.equal(await tx.terraqoBuilderContribution.count({ where: { userId: user.id } }), 201);
    const kept = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(kept.pendingPoints + kept.trustScore, 0);
    throw new NativeWorklogOperationError(503);
  }, 503);
  await rejected(async () => {
    const a = await tx.terraqoBuilderAccount.create({ data: { userId: user.id } });
    const c = await tx.terraqoBuilderContribution.create({ data: { userId: user.id, type: "BUG_REPORT",
      title: "Own ledger backlog", detail: "Synthetic state only within rollback", approvedPoints: 201,
      availableAt: new Date(Date.now() + 86400000) } });
    await tx.terraqoBuilderLedger.createMany({ data: Array.from({ length: 201 }, (_, i) => ({
      accountId: a.id, contributionId: c.id, type: "CREDIT" as const, pointsDelta: 1, scoreDelta: 1,
      balanceAfter: 0, description: "Synthetic own rollback row", idempotencyKey: `own-base:${marker}:${i}`,
    })) });
    await assert.rejects(() => applyNativeWorklogBaseInTransaction(tx, id),
      (error: unknown) => error instanceof NativeWorklogOperationError && error.status === 503);
    assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: a.id } }), 201);
    const kept = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(kept.pendingPoints + kept.trustScore + kept.availablePoints, 0);
    throw new NativeWorklogOperationError(503);
  }, 503);
  assert.equal(await tx.terraqoBuilderAccount.count({ where: { userId: user.id } }), 0);
  assert.equal(await tx.terraqoBuilderContribution.count({ where: { userId: user.id } }), 0);
    }
    assert.equal(await applyNativeWorklogBaseInTransaction(tx, id), "allocated");
    assert.equal(await applyNativeWorklogBaseInTransaction(tx, id), "historical");
    const a = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { userId: user.id } });
    assert.equal(a.pendingPoints, d.tqPoints); assert.equal(a.trustScore, d.trustScore);
    assert.equal(a.availablePoints + a.lifetimeEarned + a.contributionScore, 0);
    assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: a.id } }), 0);
    assert.equal(await tx.terraqoBuilderContribution.count({ where: { userId: user.id } }), 1);
    assert.deepEqual(await tx.terraqoNativeWorklogDecision.findUniqueOrThrow({ where: { operationId: id } }), snapshot);
    assert.equal((await tx.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId: id } })).state, "PENDING");
    await tx.terraqoBuilderContribution.deleteMany({ where: { userId: user.id } });
    await tx.terraqoBuilderAccount.delete({ where: { id: a.id } });
    await tx.terraqoNativeWorklogDecision.delete({ where: { operationId: id } });
    await tx.terraqoNativeWorklogAccounting.delete({ where: { operationId: id } });
    await tx.terraqoNativeWorklogOperation.delete({ where: { id } });
    await tx.user.delete({ where: { id: user.id } });
    assert.equal(await tx.user.count({ where: { id: user.id } }), 0);
    assert.equal(await tx.terraqoBuilderAccount.count({ where: { userId: user.id } }), 0);
  }
}
