import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { parseNativeWorklogPayload } from "../lib/server/native-worklog-payload";
import { nativeWorklogContentKey } from "../lib/server/native-worklog-content-key";
import { decideNativeDeclaredWorklog } from "../lib/server/native-worklog-base-decision";
import { applyNativeWorklogAccountingPhasesInTransaction } from "../lib/server/native-worklog-accounting-phases";
import { releaseNativeWorklogBaseInTransaction } from "../lib/server/native-worklog-base-release";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";
import { NativeWorklogBudget } from "../lib/server/native-worklog-budget";
import { applyHistoricalNativeAccountingInTransaction } from "../lib/server/native-worklog-historical-accounting";

/** Only inside the pinned checker's outer DDL rollback, never standalone. */
export async function nativeAccountingPhasesRollback(tx: Prisma.TransactionClient, workspaceId: string, historical = false) {
  for (const tq of [1]) {
    const marker = randomUUID(), id = createHash("sha256").update(marker).digest("hex");
    const user = await tx.user.create({ data: { name: `ICC accounting-phases rollback ${marker}`,
      email: `native-phases-${marker}@example.invalid`, role: "CUSTOMER" } });
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
    if (historical) await tx.terraqoNativeWorklogAuthority.create({ data: { operationId: id, actorId: user.id,
      workspaceId, professionalProfileId: profile.id, createdAt: stamp, fingerprint: d.fingerprint,
      policyVersion: "native-creation-authority-v1", grantHash: "c".repeat(64), tokenIssuedAt: stamp,
      tokenExpiresAt: new Date("2026-09-02T12:00:00.000Z"), grantExpiresAt: new Date("2026-09-02T12:00:00.000Z"),
      paidThrough: null, role: "PROFESSIONAL", modules: ["LIVE_CV", "PROFESSIONAL_NETWORK"] } });
    const first = await tx.terraqoBuilderContribution.create({ data: { userId: user.id, type: "FIRST_WORKLOG",
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
    const runWith = async (port: Prisma.TransactionClient, ids: readonly string[], budget = new NativeWorklogBudget()) => {
      if (!historical) return applyNativeWorklogAccountingPhasesInTransaction(port, id, ids);
      const result = await applyHistoricalNativeAccountingInTransaction(port, id, budget, ids);
      assert.equal(result.completionAuthorized, false);
      return result.outcome === "pending" ? result.phases : { outcome: "deferred" } as const;
    };
    const run = () => runWith(tx, [old.id]);
    const reject = (e: unknown) => e instanceof NativeWorklogOperationError && e.status === 503;
    await assert.rejects(() => runWith(tx, [old.id, old.id]), reject);
    await assert.rejects(() => runWith(tx, Array.from({ length: 6 }, (_, i) => `${i}`.padStart(25, "a"))), reject);
    if (historical) {
      await tx.$executeRawUnsafe("SAVEPOINT own_historical_no_authority");
      await tx.terraqoNativeWorklogAuthority.delete({ where: { operationId: id } });
      await assert.rejects(run, reject);
      assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 0);
      assert.equal((await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } })).pendingPoints, 5);
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_historical_no_authority");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_historical_no_authority");
    }
    await tx.$executeRawUnsafe("SAVEPOINT own_phases_fault");
    const faulty = new Proxy(tx, { get(target, property) {
      if (property === "terraqoBuilderLedger") return new Proxy(target.terraqoBuilderLedger, { get(ledger, method) {
        if (method === "create") return async (args: Prisma.TerraqoBuilderLedgerCreateArgs) => {
          if (args.data.idempotencyKey?.startsWith("release:")) {
            const a = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } });
            assert.equal(a.availablePoints, 29); assert.equal(a.pendingPoints, 2); assert.equal(a.trustScore, 1);
            assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 2);
            throw new Error("CONTROLLED_OWN_LAST_PHASE_LEDGER_FAULT");
          }
          return ledger.create(args);
        };
        const value = Reflect.get(ledger, method); return typeof value === "function" ? value.bind(ledger) : value;
      } });
      return Reflect.get(target, property);
    } });
    await assert.rejects(() => runWith(faulty, [old.id]), /CONTROLLED_OWN_LAST_PHASE_LEDGER_FAULT/);
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_phases_fault");
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_phases_fault");
    const original = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } });
    assert.equal(original.pendingPoints, 5); assert.equal(original.availablePoints, 0); assert.equal(original.trustScore, 0);
    assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 0);
    assert.equal(await tx.terraqoBuilderContribution.count({ where: { sourceKey: `worklog:${entry.id}` } }), 0);
    assert.equal((await tx.terraqoBuilderContribution.findUniqueOrThrow({ where: { id: first.id } })).approvedPoints, 0);
    assert.equal((await tx.terraqoBuilderContribution.findUniqueOrThrow({ where: { id: old.id } })).releasedAt, null);
    if (historical) {
      await tx.$executeRawUnsafe("SAVEPOINT own_historical_final_budget");
      let elapsed = 0;
      const budget = new NativeWorklogBudget(() => elapsed);
      const late = new Proxy(tx, { get(target, field) {
        if (field === "terraqoBuilderLedger") return new Proxy(target.terraqoBuilderLedger, { get(ledger, method) {
          if (method === "create") return async (args: Prisma.TerraqoBuilderLedgerCreateArgs) => {
            const result = await ledger.create(args);
            if (args.data.idempotencyKey?.startsWith("release:")) {
              assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 3);
              assert.equal((await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } })).availablePoints, 29);
              elapsed = 48000;
            }
            return result;
          };
          const value = Reflect.get(ledger, method); return typeof value === "function" ? value.bind(ledger) : value;
        } });
        return Reflect.get(target, field);
      } });
      await assert.rejects(() => runWith(late, [old.id], budget), reject);
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_historical_final_budget");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_historical_final_budget");
      assert.deepEqual(await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } }), original);
      assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 0);
      assert.equal(await tx.terraqoBuilderContribution.count({ where: { sourceKey: `worklog:${entry.id}` } }), 0);
      assert.equal((await tx.terraqoBuilderContribution.findUniqueOrThrow({ where: { id: first.id } })).approvedPoints, 0);
      assert.equal((await tx.terraqoBuilderContribution.findUniqueOrThrow({ where: { id: old.id } })).releasedAt, null);
    }
    assert.deepEqual(await run(), { outcome: "pending", base: "allocated", first: "credited", release: "released", legacy: ["released"] });
    const saved = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } });
    assert.deepEqual(await run(), { outcome: "pending", base: "released-history", first: "historical", release: "historical", legacy: ["historical"] });
    assert.deepEqual(await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } }), saved);
    assert.equal(saved.pendingPoints, 2); assert.equal(saved.availablePoints, 29); assert.equal(saved.lifetimeEarned, 29);
    assert.equal(saved.contributionScore, 29); assert.equal(saved.trustScore, 1);
    assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 3);
    await tx.$executeRawUnsafe("SAVEPOINT own_phases_history_floor");
    await tx.terraqoBuilderAccount.update({ where: { id: account.id }, data: { pendingPoints: 1 } });
    await assert.rejects(run, reject);
    await assert.rejects(() => releaseNativeWorklogBaseInTransaction(tx, id), reject);
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_phases_history_floor");
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_phases_history_floor");
    await tx.$executeRawUnsafe("SAVEPOINT own_phases_missing");
    await tx.terraqoWorklogEntry.update({ where: { id: entry.id }, data: { deletedAt: new Date() } });
    assert.deepEqual(await run(), { outcome: "deferred" });
    assert.deepEqual(await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } }), saved);
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_phases_missing");
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_phases_missing");
    assert.deepEqual(await tx.terraqoNativeWorklogDecision.findUniqueOrThrow({ where: { operationId: id } }), snapshot);
    assert.equal((await tx.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId: id } })).state, "PENDING");
    await tx.terraqoBuilderLedger.deleteMany({ where: { accountId: account.id } });
    await tx.terraqoBuilderContribution.deleteMany({ where: { userId: user.id } });
    await tx.terraqoBuilderAccount.delete({ where: { id: account.id } });
    if (historical) await tx.terraqoNativeWorklogAuthority.delete({ where: { operationId: id } });
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
