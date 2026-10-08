import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { parseNativeWorklogPayload } from "../lib/server/native-worklog-payload";
import { nativeWorklogContentKey } from "../lib/server/native-worklog-content-key";
import { decideNativeDeclaredWorklog } from "../lib/server/native-worklog-base-decision";
import { applyNativeWorklogBaseInTransaction } from "../lib/server/native-worklog-base-accounting";
import { releaseNativeWorklogBaseInTransaction } from "../lib/server/native-worklog-base-release";

/** Only inside the pinned checker's outer DDL rollback, never standalone. */
export async function nativeBaseReleaseRollback(tx: Prisma.TransactionClient, workspaceId: string) {
  for (const tq of [1, 0]) {
    const marker = randomUUID(), id = createHash("sha256").update(marker).digest("hex");
    const user = await tx.user.create({ data: { name: `ICC base-release rollback ${marker}`,
      email: `native-release-${marker}@example.invalid`, role: "CUSTOMER" } });
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
    assert.equal(await applyNativeWorklogBaseInTransaction(tx, id), "allocated");
    const account = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { userId: user.id } });
    const contribution = await tx.terraqoBuilderContribution.findUniqueOrThrow({ where: { sourceKey: `worklog:${entry.id}` } });
    await tx.terraqoBuilderContribution.create({ data: { userId: user.id, type: "BUG_REPORT", title: "Own future retained",
      detail: "Manual own future pending state", approvedPoints: 2, availableAt: new Date(Date.now() + 86400000) } });
    await tx.terraqoBuilderAccount.update({ where: { id: account.id }, data: { pendingPoints: tq + 2 } });
    if (tq) {
      await tx.$executeRawUnsafe("SAVEPOINT own_native_release_fault");
      const faulty = new Proxy(tx, { get(target, property) {
        if (property === "terraqoBuilderLedger") return { create: async () => {
          const a = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } });
          assert.equal(a.pendingPoints, 2); assert.equal(a.availablePoints, 1);
          throw new Error("CONTROLLED_OWN_RELEASE_LEDGER_FAULT");
        }, findMany: target.terraqoBuilderLedger.findMany.bind(target.terraqoBuilderLedger) };
        return Reflect.get(target, property);
      } });
      await assert.rejects(() => releaseNativeWorklogBaseInTransaction(faulty, id));
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_native_release_fault");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_native_release_fault");
      assert.equal((await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } })).pendingPoints, 3);
      assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 0);
      assert.equal((await tx.terraqoBuilderContribution.findUniqueOrThrow({ where: { id: contribution.id } })).releasedAt, null);
    }
    assert.equal(await releaseNativeWorklogBaseInTransaction(tx, id), "released");
    assert.equal(await releaseNativeWorklogBaseInTransaction(tx, id), "historical");
    const a = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } });
    assert.equal(a.pendingPoints, 2); assert.equal(a.availablePoints, tq); assert.equal(a.lifetimeEarned, tq);
    assert.equal(a.contributionScore, tq); assert.equal(a.trustScore, 1);
    assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), tq);
    assert.deepEqual(await tx.terraqoNativeWorklogDecision.findUniqueOrThrow({ where: { operationId: id } }), snapshot);
    assert.equal((await tx.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId: id } })).state, "PENDING");
    await tx.terraqoBuilderLedger.deleteMany({ where: { accountId: account.id } });
    await tx.terraqoBuilderContribution.deleteMany({ where: { userId: user.id } });
    await tx.terraqoBuilderAccount.delete({ where: { id: account.id } });
    await tx.terraqoNativeWorklogDecision.delete({ where: { operationId: id } });
    await tx.terraqoNativeWorklogAccounting.delete({ where: { operationId: id } });
    await tx.terraqoNativeWorklogOperation.delete({ where: { id } });
    await tx.user.delete({ where: { id: user.id } });
    assert.equal(await tx.user.count({ where: { id: user.id } }), 0);
    assert.equal(await tx.terraqoBuilderAccount.count({ where: { userId: user.id } }), 0);
  }
}
