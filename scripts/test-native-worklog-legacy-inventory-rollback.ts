import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { parseNativeWorklogPayload } from "../lib/server/native-worklog-payload";
import { nativeWorklogContentKey } from "../lib/server/native-worklog-content-key";
import { decideNativeDeclaredWorklog } from "../lib/server/native-worklog-base-decision";
import { inspectNativeLegacyWorklogInventoryInTransaction } from "../lib/server/native-worklog-legacy-inventory";

/** Only inside the pinned checker's outer DDL rollback, never standalone. */
export async function nativeLegacyInventoryRollback(tx: Prisma.TransactionClient, workspaceId: string) {
  for (const tq of [1]) {
    const marker = randomUUID(), id = createHash("sha256").update(marker).digest("hex");
    const user = await tx.user.create({ data: { name: `ICC legacy-inventory rollback ${marker}`,
      email: `native-inventory-${marker}@example.invalid`, role: "CUSTOMER" } });
    const profile = await tx.terraqoProfessionalProfile.create({ data: { userId: user.id, visibility: "PRIVATE", liveCvEnabled: false } });
    const parsed = await parseNativeWorklogPayload(new Request("https://example.invalid/own", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ operationKey: "a".repeat(32),
        title: "ICC own release", summary: "Own temporary SQL release evidence only.", outcome: "", type: "FIELD_UPDATE", projectId: "", projectVersion: "" }) }));
    const d = decideNativeDeclaredWorklog(parsed, "2026-09-01T12:00:00.000Z", {
      priorDuplicates: 0, rewardedInDay: tq ? 0 : 3, trustedInWindow: 0 });
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
    await tx.terraqoBuilderContribution.create({ data: { userId: user.id, type: "FIRST_WORKLOG",
      sourceKey: `first-worklog:${user.id}`, title: "Own manual FIRST reserve", detail: `native-first-worklog-v1:${id}`,
      requestedPoints: 25, approvedPoints: 0, status: "IN_REVIEW", createdAt: stamp } });
    const oldStamp = new Date("2026-08-01T12:00:00.000Z");
    const oldEntry = await tx.terraqoWorklogEntry.create({ data: { authorId: user.id, professionalProfileId: profile.id,
      workspaceId, title: "Own manual legacy earned", summary: "Own legacy accounting state only.",
      visibility: "PRIVATE", createdAt: oldStamp, tqPointsAwarded: 3 } });
    const old = await tx.terraqoBuilderContribution.create({ data: { userId: user.id, workspaceId, type: "BETA_PARTICIPATION",
      sourceKey: `worklog:${oldEntry.id}`, title: "Own manual legacy pending", detail: "Manual earned state",
      approvedPoints: 3, createdAt: oldStamp, availableAt: new Date("2026-08-08T12:00:00.000Z") } });
    await tx.terraqoBuilderContribution.create({ data: { userId: user.id, type: "BUG_REPORT", title: "Own future retained",
      detail: "Manual future retained", approvedPoints: 2, availableAt: new Date("2099-01-01T00:00:00.000Z") } });
    const account = await tx.terraqoBuilderAccount.create({ data: { userId: user.id, pendingPoints: 5 } });
    const run = () => inspectNativeLegacyWorklogInventoryInTransaction(tx, id);
    async function unchangedReads() {
      const before = { account: await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } }),
        contributions: await tx.terraqoBuilderContribution.findMany({ where: { userId: user.id }, orderBy: { id: "asc" } }),
        ledger: await tx.terraqoBuilderLedger.findMany({ where: { accountId: account.id }, orderBy: { id: "asc" } }) };
      const result = await run();
      assert.deepEqual(await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } }), before.account);
      assert.deepEqual(await tx.terraqoBuilderContribution.findMany({ where: { userId: user.id }, orderBy: { id: "asc" } }), before.contributions);
      assert.deepEqual(await tx.terraqoBuilderLedger.findMany({ where: { accountId: account.id }, orderBy: { id: "asc" } }), before.ledger);
      assert.equal(result.completionAuthorized, false); assert.equal(result.outboxState, "PENDING");
      assert.ok(!JSON.stringify(result).includes(user.id)); assert.ok(!JSON.stringify(result).includes(old.id));
      return result;
    }
    const normal = await unchangedReads(); assert.equal(normal.inspected, 2); assert.equal(normal.due, 1); assert.equal(normal.unsupported, 1);
    async function isolated(runCase: () => Promise<void>) {
      await tx.$executeRawUnsafe("SAVEPOINT own_inventory_case");
      try { await runCase(); } finally {
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_inventory_case");
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_inventory_case");
      }
      assert.deepEqual(await unchangedReads(), normal);
    }
    await isolated(async () => {
      await tx.terraqoBuilderAccount.update({ where: { id: account.id }, data: { rewardsFrozenUntil: new Date("2099-01-01T00:00:00.000Z") } });
      assert.equal((await unchangedReads()).frozen, 1);
    });
    await isolated(async () => {
      await tx.terraqoBuilderContribution.update({ where: { id: old.id }, data: { availableAt: new Date("2099-01-01T00:00:00.000Z") } });
      assert.equal((await unchangedReads()).future, 1);
    });
    await isolated(async () => {
      await tx.terraqoWorklogEntry.delete({ where: { id: oldEntry.id } });
      assert.equal((await unchangedReads()).missingReference, 1);
    });
    await isolated(async () => {
      await tx.terraqoBuilderLedger.create({ data: { accountId: account.id, contributionId: old.id, type: "REVERSAL",
        pointsDelta: -1, scoreDelta: -1, balanceAfter: 0, description: "Own inventory reversal", idempotencyKey: `own-inventory:${marker}` } });
      assert.equal((await unchangedReads()).ambiguous, 1);
    });
    await isolated(async () => {
      await tx.terraqoBuilderContribution.create({ data: { userId: user.id, workspaceId, type: "BETA_PARTICIPATION",
        sourceKey: `worklog:${entry.id}`, title: "Own native contribution", detail: "Manual classification only" } });
      await tx.terraqoWorklogEntry.delete({ where: { id: entry.id } });
      assert.equal((await unchangedReads()).native, 1);
    });
    assert.deepEqual(await tx.terraqoNativeWorklogDecision.findUniqueOrThrow({ where: { operationId: id } }), snapshot);
    await tx.terraqoBuilderLedger.deleteMany({ where: { accountId: account.id } });
    await tx.terraqoBuilderContribution.deleteMany({ where: { userId: user.id } });
    await tx.terraqoBuilderAccount.delete({ where: { id: account.id } });
    await tx.terraqoNativeWorklogDecision.delete({ where: { operationId: id } });
    await tx.terraqoNativeWorklogAccounting.delete({ where: { operationId: id } });
    await tx.terraqoNativeWorklogOperation.delete({ where: { id } });
    await tx.user.delete({ where: { id: user.id } });
    assert.equal(await tx.user.count({ where: { id: user.id } }), 0);
    assert.equal(await tx.terraqoBuilderContribution.count({ where: { userId: user.id } }), 0);
    assert.equal(await tx.terraqoBuilderAccount.count({ where: { userId: user.id } }), 0);
    assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 0);
  }
}
