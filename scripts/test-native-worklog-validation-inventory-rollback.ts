import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { parseNativeWorklogPayload } from "../lib/server/native-worklog-payload";
import { nativeWorklogContentKey } from "../lib/server/native-worklog-content-key";
import { decideNativeDeclaredWorklog } from "../lib/server/native-worklog-base-decision";
import { inspectNativeLegacyWorklogInventoryInTransaction } from "../lib/server/native-worklog-legacy-inventory";
import { applyHistoricalNativeAccountingInTransaction } from "../lib/server/native-worklog-historical-accounting";
import { quarantineNativeAccountingReviewInTransaction } from "../lib/server/native-worklog-accounting-review";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";
import { chooseNativeFirstWorklogInTransaction, saveNativeFirstWorklogDecision } from "../lib/server/native-worklog-first-decision";
import { NativeWorklogBudget } from "../lib/server/native-worklog-budget";

/** Only the pinned checker's outer rollback; no standalone or existing-user mode. */
export async function nativeValidationInventoryRollback(tx: Prisma.TransactionClient, workspaceId: string, reward: 5 | 20, phasesOnly: boolean, reviewOnly = false) {
  for (const points of [reward]) {
    const marker = randomUUID();
    const validator = await tx.user.create({ data: { role: "CUSTOMER", name: `ICC validation rollback ${marker}`,
      email: `validation-${marker}@example.invalid` } });
    const author = await tx.user.create({ data: { role: "CUSTOMER", name: `ICC author rollback ${marker}`,
      email: `author-${marker}@example.invalid` } });
    const profiles = await Promise.all([validator, author].map(user => tx.terraqoProfessionalProfile.create({
      data: { userId: user.id, visibility: "PRIVATE", liveCvEnabled: false } })));
    const entry = await tx.terraqoWorklogEntry.create({ data: { authorId: author.id, professionalProfileId: profiles[1].id,
      workspaceId, title: "ICC own validation history", summary: "Manual private history for rollback proof only.",
      visibility: "PRIVATE", createdAt: new Date("2026-07-30T00:00:00.000Z") } });
    const validation = await tx.terraqoWorklogValidation.create({ data: { workspaceId, worklogId: entry.id,
      requestedByUserId: author.id, validatorUserId: validator.id, status: "APPROVED", credentialId: `own-${marker}`,
      requestedAt: new Date("2026-07-31T00:00:00.000Z"), createdAt: new Date("2026-07-31T00:00:00.001Z"),
      resolvedAt: new Date("2026-08-01T00:00:00.000Z") } });
    const contribution = await tx.terraqoBuilderContribution.create({ data: { userId: validator.id,
      type: "EXPERIENCE_VALIDATION", sourceKey: `worklog-validation:${validation.id}`,
      title: "ICC own earned validation", detail: "Manual saved reward, never current pair counters.",
      status: "VALIDATED", requestedPoints: points, approvedPoints: points,
      createdAt: new Date("2026-08-01T00:00:01.000Z"), reviewedAt: new Date("2026-08-01T00:00:02.000Z") } });
    const account = await tx.terraqoBuilderAccount.create({ data: { userId: validator.id,
      pendingPoints: 2, availablePoints: points, lifetimeEarned: points, contributionScore: points, trustScore: 4 } });
    const credit = await tx.terraqoBuilderLedger.create({ data: { accountId: account.id, contributionId: contribution.id,
      type: "CREDIT", pointsDelta: points, scoreDelta: points, balanceAfter: points,
      description: "ICC own manual legacy credit", idempotencyKey: `contribution:${contribution.id}:${points}`,
      createdAt: new Date("2026-08-01T00:00:01.999Z") } });
    const operationId = createHash("sha256").update(marker).digest("hex");
    const parsed = await parseNativeWorklogPayload(new Request("https://example.invalid/own", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ operationKey: "a".repeat(32),
        title: "ICC own native validation inventory", summary: "Own manual SQL accounting proof, rollback only.",
        outcome: "", type: "FIELD_UPDATE", projectId: "", projectVersion: "" }) }));
    const decision = decideNativeDeclaredWorklog(parsed, "2026-09-01T12:00:00.000Z", {
      priorDuplicates: 0, rewardedInDay: 0, trustedInWindow: 0 });
    const stamp = new Date(decision.createdAt), contentKey = nativeWorklogContentKey(parsed.payload);
    const firstChoice = await chooseNativeFirstWorklogInTransaction(tx, validator.id, operationId, stamp);
    assert.equal(firstChoice.disposition, "RESERVED");
    const nativeEntry = await tx.terraqoWorklogEntry.create({ data: { authorId: validator.id,
      professionalProfileId: profiles[0].id, workspaceId, title: parsed.payload.title, summary: parsed.payload.summary,
      visibility: "PRIVATE", contentFingerprint: contentKey, createdAt: stamp, updatedAt: stamp } });
    await tx.terraqoNativeWorklogOperation.create({ data: { id: operationId, actorId: validator.id, workspaceId,
      professionalProfileId: profiles[0].id, operationKey: parsed.payload.operationKey, fingerprint: decision.fingerprint,
      targetWorklogId: nativeEntry.id, worklogId: nativeEntry.id, createdAt: stamp, resultVersion: stamp } });
    await saveNativeFirstWorklogDecision(tx, operationId, firstChoice);
    await tx.terraqoNativeWorklogAccounting.create({ data: { operationId } });
    await tx.terraqoNativeWorklogDecision.create({ data: { operationId, contentKey,
      policyVersion: decision.policyVersion, fingerprint: decision.fingerprint, priorDuplicates: 0, rewardedInDay: 0,
      trustedInWindow: 0, tqPoints: decision.tqPoints, trustScore: decision.trustScore, qualityScore: decision.qualityScore,
      moderationStatus: decision.moderationStatus, riskScore: decision.riskScore, createdAt: stamp,
      dayStart: new Date(decision.dayStart), dayEndExclusive: new Date(decision.dayEndExclusive),
      trustStartInclusive: new Date(decision.trustStartInclusive), trustEndInclusive: new Date(decision.trustEndInclusive),
      availableAt: new Date(decision.availableAt) } });
    // Synthetic expired-now history, not a JWT/live grant or core-capture proof.
    await tx.terraqoNativeWorklogAuthority.create({ data: { operationId, actorId: validator.id, workspaceId,
      professionalProfileId: profiles[0].id, fingerprint: decision.fingerprint, createdAt: stamp,
      policyVersion: "native-creation-authority-v1", grantHash: "c".repeat(64), tokenIssuedAt: stamp,
      tokenExpiresAt: new Date("2026-09-02T12:00:00.000Z"), grantExpiresAt: new Date("2026-09-02T12:00:00.000Z"),
      role: "PROFESSIONAL", modules: ["LIVE_CV", "PROFESSIONAL_NETWORK"], paidThrough: null } });
    await tx.terraqoBuilderContribution.create({ data: { userId: validator.id, type: "BUG_REPORT",
      title: "ICC own retained future", detail: "Own future floor", approvedPoints: 2,
      availableAt: new Date("2099-01-01T00:00:00.000Z") } });
    const own = [validator.id, author.id];
    async function state() {
      const [snapshot] = await tx.$queryRaw<unknown[]>(Prisma.sql`SELECT jsonb_build_object(
        'users', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."User" r WHERE r.id IN (${Prisma.join(own)})),
        'profiles', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoProfessionalProfile" r WHERE r."userId" IN (${Prisma.join(own)})),
        'entries', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoWorklogEntry" r WHERE r."authorId" IN (${Prisma.join(own)})),
        'validations', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoWorklogValidation" r WHERE r.id=${validation.id}),
        'contributions', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderContribution" r WHERE r."userId" IN (${Prisma.join(own)})),
        'accounts', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderAccount" r WHERE r."userId" IN (${Prisma.join(own)})),
        'receipt', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogOperation" r WHERE r.id=${operationId}),
        'firstDecision', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogFirstDecision" r WHERE r."operationId"=${operationId}),
        'decision', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogDecision" r WHERE r."operationId"=${operationId}),
        'authority', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogAuthority" r WHERE r."operationId"=${operationId}),
        'outbox', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogAccounting" r WHERE r."operationId"=${operationId}),
        'ledger', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderLedger" r WHERE r."accountId"=${account.id})
      ) AS snapshot`);
      return snapshot;
    }
    const inspect = () => inspectNativeLegacyWorklogInventoryInTransaction(tx, operationId);
    const run = () => applyHistoricalNativeAccountingInTransaction(tx, operationId, new NativeWorklogBudget(), []);
    const firstBefore = await tx.terraqoNativeWorklogFirstDecision.findUniqueOrThrow({ where: { operationId } });
    const contributionBefore = await tx.terraqoBuilderContribution.findUniqueOrThrow({ where: { id: contribution.id } });
    if (reviewOnly) {
      const baseline = await state();
      const clean = await quarantineNativeAccountingReviewInTransaction(tx, operationId, new NativeWorklogBudget());
      assert.deepEqual(clean, { outcome: "inspection-only", completionAuthorized: false });
      assert.deepEqual(await state(), baseline);
      // Two independent invalid histories; each savepoint preserves earned state.
      for (const change of [
        () => tx.terraqoWorklogValidation.delete({ where: { id: validation.id } }),
        () => tx.terraqoBuilderLedger.update({ where: { id: credit.id }, data: { type: "REVERSAL", pointsDelta: -points, scoreDelta: -points } }),
      ]) {
        await tx.$executeRawUnsafe("SAVEPOINT own_durable_review");
        try {
          await change(); const prepared = await state();
          let clock = 0;
          const budget = new NativeWorklogBudget(() => clock);
          const proxy = new Proxy(tx, { get(target, key) {
            if (key !== "terraqoNativeWorklogAccounting") return Reflect.get(target, key);
            return new Proxy(target.terraqoNativeWorklogAccounting, { get(model, field) {
              if (field !== "updateMany") return Reflect.get(model, field);
              return async (args: Prisma.TerraqoNativeWorklogAccountingUpdateManyArgs) => {
                const changed = await model.updateMany(args);
                assert.equal(changed.count, 1);
                assert.equal((await model.findUniqueOrThrow({ where: { operationId } })).state, "QUARANTINED");
                clock = 48000; return changed;
              };
            } });
          } });
          await tx.$executeRawUnsafe("SAVEPOINT own_review_budget");
          await assert.rejects(() => quarantineNativeAccountingReviewInTransaction(proxy, operationId, budget),
            error => error instanceof NativeWorklogOperationError && error.status === 503);
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_review_budget");
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_review_budget");
          assert.deepEqual(await state(), prepared);
          const quarantined = await quarantineNativeAccountingReviewInTransaction(tx, operationId, new NativeWorklogBudget());
          assert.deepEqual(quarantined, { outcome: "quarantined", completionAuthorized: false });
          const saved = await state();
          // Every business object remains exact; only outbox.state may change.
          const expected = JSON.parse(JSON.stringify(prepared));
          expected.snapshot.outbox.state = "QUARANTINED";
          assert.deepEqual(saved, expected);
          assert.deepEqual(await quarantineNativeAccountingReviewInTransaction(tx, operationId, new NativeWorklogBudget()),
            { outcome: "unchanged", completionAuthorized: false });
          assert.deepEqual(await state(), saved);
        } finally {
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_durable_review");
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_durable_review");
        }
        assert.deepEqual(await state(), baseline);
      }
    } else if (!phasesOnly) {
      const baseline = await state();
      for (let repeat = 0; repeat < 2; repeat++) {
        const result = await inspect();
        assert.equal(result.historical, 1); assert.equal(result.nativeFirst, 1); assert.equal(result.unsupported, 0);
        assert.equal(result.completionAuthorized, false); assert.ok(Object.isFrozen(result));
        assert.ok(!JSON.stringify(result).includes(validation.id)); assert.deepEqual(await state(), baseline);
      }
      for (const change of [
        () => tx.terraqoWorklogValidation.delete({ where: { id: validation.id } }),
        () => tx.terraqoBuilderLedger.update({ where: { id: credit.id }, data: { type: "REVERSAL", pointsDelta: -points, scoreDelta: -points } }),
        () => tx.terraqoWorklogValidation.update({ where: { id: validation.id }, data: { status: "REQUESTED" } }),
      ]) {
        await tx.$executeRawUnsafe("SAVEPOINT own_validation_inventory_case");
        try {
          await change(); const before = await state();
          const result = await run(); // Omit ALL legacy IDs; bad history still blocks before writes.
          assert.equal(result.outcome, "review-required");
          if (result.outcome !== "review-required") assert.fail("Review required before phases");
          assert.equal(result.legacyInspection.unsupported, 1); assert.equal(result.completionAuthorized, false);
          assert.deepEqual(await state(), before);
        } finally {
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_validation_inventory_case");
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_validation_inventory_case");
        }
        assert.deepEqual(await state(), baseline);
      }
    } else {
      const result = await run();
      assert.equal(result.outcome, "pending"); if (result.outcome !== "pending") assert.fail("Phases pending");
      assert.deepEqual(result.phases, { outcome: "pending", base: "allocated", first: "credited", release: "released", legacy: [] });
      assert.equal(result.legacyInspection.historical, 1); assert.equal(result.completionAuthorized, false);
      const saved = await state(); const replay = await run();
      assert.equal(replay.outcome, "pending"); if (replay.outcome !== "pending") assert.fail("Historical phases pending");
      assert.deepEqual(replay.phases, { outcome: "pending", base: "released-history", first: "historical", release: "historical", legacy: [] });
      assert.deepEqual(await state(), saved);
      const currentAccount = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } });
      assert.equal(currentAccount.pendingPoints, 2); assert.equal(currentAccount.availablePoints, points + 26);
      assert.equal(currentAccount.lifetimeEarned, points + 26); assert.equal(currentAccount.contributionScore, points + 26);
      assert.equal(currentAccount.trustScore, 5);
      assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 3);
      assert.equal((await tx.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId } })).state, "PENDING");
    }
    assert.deepEqual(await tx.terraqoNativeWorklogFirstDecision.findUniqueOrThrow({ where: { operationId } }), firstBefore);
    assert.deepEqual(await tx.terraqoBuilderContribution.findUniqueOrThrow({ where: { id: contribution.id } }), contributionBefore);
    assert.deepEqual(await tx.terraqoBuilderLedger.findUniqueOrThrow({ where: { id: credit.id } }), credit);
    assert.equal(await tx.terraqoBuilderLedger.count({ where: { contributionId: contribution.id } }), 1);
    await tx.terraqoBuilderLedger.deleteMany({ where: { accountId: account.id } });
    await tx.terraqoNativeWorklogFirstDecision.delete({ where: { operationId } });
    await tx.terraqoBuilderContribution.deleteMany({ where: { userId: validator.id } });
    await tx.terraqoBuilderAccount.delete({ where: { id: account.id } });
    await tx.terraqoWorklogValidation.delete({ where: { id: validation.id } });
    await tx.terraqoNativeWorklogAuthority.delete({ where: { operationId } });
    await tx.terraqoNativeWorklogDecision.delete({ where: { operationId } });
    await tx.terraqoNativeWorklogAccounting.delete({ where: { operationId } });
    await tx.terraqoNativeWorklogOperation.delete({ where: { id: operationId } });
    await tx.user.delete({ where: { id: validator.id } }); await tx.user.delete({ where: { id: author.id } });
    assert.equal(await tx.terraqoNativeWorklogOperation.count({ where: { id: operationId } }), 0);
    assert.equal(await tx.terraqoNativeWorklogFirstDecision.count({ where: { operationId } }), 0);
    assert.equal(await tx.user.count({ where: { id: { in: own } } }), 0);
    assert.equal(await tx.terraqoProfessionalProfile.count({ where: { userId: { in: own } } }), 0);
    assert.equal(await tx.terraqoWorklogEntry.count({ where: { authorId: { in: own } } }), 0);
    assert.equal(await tx.terraqoWorklogValidation.count({ where: { id: validation.id } }), 0);
    assert.equal(await tx.terraqoBuilderAccount.count({ where: { userId: { in: own } } }), 0);
    assert.equal(await tx.terraqoBuilderContribution.count({ where: { userId: { in: own } } }), 0);
    assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 0);
  }
}
