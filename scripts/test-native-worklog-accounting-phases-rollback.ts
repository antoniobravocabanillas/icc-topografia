import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { parseNativeWorklogPayload } from "../lib/server/native-worklog-payload";
import { nativeWorklogContentKey } from "../lib/server/native-worklog-content-key";
import { decideNativeDeclaredWorklog } from "../lib/server/native-worklog-base-decision";
import { applyNativeWorklogAccountingPhasesInTransaction } from "../lib/server/native-worklog-accounting-phases";
import { releaseNativeWorklogBaseInTransaction } from "../lib/server/native-worklog-base-release";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";
import { NativeWorklogBudget } from "../lib/server/native-worklog-budget";
import { applySelectedNativeAccountingInTransaction, settleSelectedNativeAccountingInTransaction } from "../lib/server/native-worklog-selected-accounting";
import { reconcileNativeAccountingAcknowledgementInTransaction } from "../lib/server/native-worklog-accounting-acknowledgement";
import { applyHistoricalNativeAccountingInTransaction } from "../lib/server/native-worklog-historical-accounting";
import { chooseNativeFirstWorklogInTransaction, saveNativeFirstWorklogDecision } from "../lib/server/native-worklog-first-decision";

/** Only inside the pinned checker's outer DDL rollback, never standalone. */
export async function nativeAccountingPhasesRollback(tx: Prisma.TransactionClient, workspaceId: string, historical = false, reviewOnly = false, legacyFirstOnly = false, selectionOnly = false, backlogOnly = false, settlementMode = "") {
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
    if (legacyFirstOnly) await tx.terraqoBuilderContribution.create({ data: {
      userId: user.id, type: "FIRST_WORKLOG", sourceKey: `first-worklog:${user.id}`,
      title: "Own credited legacy FIRST", detail: "Own credited legacy FIRST", requestedPoints: 25,
      approvedPoints: 25, status: "VALIDATED", createdAt: new Date("2026-08-01T12:00:00.000Z"),
      reviewedAt: new Date("2026-08-01T12:00:01.000Z"), releasedAt: null } });
    // Real durable choice; the later legacy/account/authority fixtures remain synthetic.
    const firstChoice = await chooseNativeFirstWorklogInTransaction(tx, user.id, id, stamp);
    assert.equal(firstChoice.disposition, legacyFirstOnly ? "EXISTING" : "RESERVED");
    const entry = await tx.terraqoWorklogEntry.create({ data: { authorId: user.id, professionalProfileId: profile.id,
      workspaceId, title: parsed.payload.title, summary: parsed.payload.summary, visibility: "PRIVATE",
      contentFingerprint: contentKey, createdAt: stamp, updatedAt: stamp } });
    await tx.terraqoNativeWorklogOperation.create({ data: { id, actorId: user.id, workspaceId, professionalProfileId: profile.id,
      operationKey: parsed.payload.operationKey, fingerprint: d.fingerprint, targetWorklogId: entry.id,
      worklogId: entry.id, resultVersion: stamp, createdAt: stamp } });
    await saveNativeFirstWorklogDecision(tx, id, firstChoice);
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
    const first = await tx.terraqoBuilderContribution.findUniqueOrThrow({ where: { sourceKey: `first-worklog:${user.id}` } });
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
    async function cleanup() {
      await tx.terraqoBuilderLedger.deleteMany({ where: { accountId: account.id } });
      await tx.terraqoNativeWorklogFirstDecision.delete({ where: { operationId: id } });
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
    const runWith = async (port: Prisma.TransactionClient, ids: readonly string[], budget = new NativeWorklogBudget()) => {
      if (!historical) return applyNativeWorklogAccountingPhasesInTransaction(port, id, ids);
      const result = await applyHistoricalNativeAccountingInTransaction(port, id, budget, ids);
      assert.equal(result.completionAuthorized, false);
      return result.outcome === "pending" ? result.phases : { outcome: "deferred" } as const;
    };
    const run = () => runWith(tx, [old.id]);
    const reject = (e: unknown) => e instanceof NativeWorklogOperationError && e.status === 503;
    if (settlementMode) {
      assert.equal(historical, true);
      const states = async () => {
        const [row] = await tx.$queryRaw<Array<{ snapshot: Record<string, unknown> }>>(Prisma.sql`SELECT jsonb_build_object(
          'account', (SELECT to_jsonb(r) FROM icc."TerraqoBuilderAccount" r WHERE r.id=${account.id}),
          'contributions', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderContribution" r WHERE r."userId"=${user.id}),
          'ledger', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderLedger" r WHERE r."accountId"=${account.id}),
          'entries', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoWorklogEntry" r WHERE r."authorId"=${user.id}),
          'receipt', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogOperation" r WHERE r.id=${id}),
          'firstDecision', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogFirstDecision" r WHERE r."operationId"=${id}),
          'decision', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogDecision" r WHERE r."operationId"=${id}),
          'authority', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogAuthority" r WHERE r."operationId"=${id}),
          'outbox', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogAccounting" r WHERE r."operationId"=${id})
        ) AS snapshot`);
        return row.snapshot;
      };
      if (settlementMode === "--worker-ack") {
        await tx.terraqoBuilderAccount.update({ where: { id: account.id }, data: {
          availablePoints: 2, lifetimeEarned: 2, contributionScore: 2, trustScore: 4 } });
        await tx.terraqoBuilderLedger.create({ data: { accountId: account.id, contributionId: old.id,
          type: "CREDIT", pointsDelta: 2, scoreDelta: 2, balanceAfter: 2,
          description: "Own uncertain acknowledgement retained credit", idempotencyKey: `own-ack:${id}` } });
      }
      if (settlementMode === "--worker-deferred") {
        await tx.terraqoBuilderAccount.update({ where: { id: account.id }, data: { rewardsFrozenUntil: new Date("2099-01-01T00:00:00.000Z") } });
        const result = await settleSelectedNativeAccountingInTransaction(tx, id, new NativeWorklogBudget());
        assert.equal(result.outcome, "pending"); assert.equal(result.completionAuthorized, false);
        const saved = await states();
        const outbox = saved.outbox as { state: string; attempts: number; nextAttemptAt: string; completedAt: null };
        assert.equal(outbox.state, "PENDING"); assert.equal(outbox.attempts, 0); assert.equal(outbox.completedAt, null);
        assert.ok(Date.parse(outbox.nextAttemptAt) > Date.now());
        const balance = saved.account as { pendingPoints: number; availablePoints: number; trustScore: number };
        assert.equal(balance.pendingPoints, 6); assert.equal(balance.availablePoints, 0); assert.equal(balance.trustScore, 1);
        assert.equal(saved.ledger, null);
        assert.deepEqual(await settleSelectedNativeAccountingInTransaction(tx, id, new NativeWorklogBudget()), { outcome: "deferred", completionAuthorized: false });
        assert.deepEqual(await states(), saved);
      } else {
        const before = await states(); let elapsed = 0, injected = false;
        const budget = new NativeWorklogBudget(() => elapsed);
        const proxy = new Proxy(tx, { get(target, key) {
          if (key !== "terraqoNativeWorklogAccounting") return Reflect.get(target, key);
          return new Proxy(target.terraqoNativeWorklogAccounting, { get(model, field) {
            if (field !== "updateMany") return Reflect.get(model, field);
            return async (args: Prisma.TerraqoNativeWorklogAccountingUpdateManyArgs) => {
              const result = await model.updateMany(args);
              assert.equal(result.count, 1);
              const outbox = await model.findUniqueOrThrow({ where: { operationId: id } });
              assert.equal(outbox.state, settlementMode === "--worker-ack" ? "QUARANTINED" : "APPLIED");
              if (settlementMode !== "--worker-ack") {
                assert.equal((await target.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } })).availablePoints, 29);
                assert.equal(await target.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 3);
              }
              injected = true; elapsed = 48000; return result;
            };
          } });
        } });
        const execute = (port: Prisma.TransactionClient, limit: NativeWorklogBudget) => settlementMode === "--worker-ack"
          ? reconcileNativeAccountingAcknowledgementInTransaction(port, id, limit)
          : settleSelectedNativeAccountingInTransaction(port, id, limit);
        await tx.$executeRawUnsafe("SAVEPOINT own_settlement_final_budget");
        await assert.rejects(() => execute(proxy, budget), reject); assert.equal(injected, true);
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_settlement_final_budget");
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_settlement_final_budget");
        assert.deepEqual(await states(), before);
        const result = await execute(tx, new NativeWorklogBudget());
        if (settlementMode === "--worker-ack") {
          assert.deepEqual(result, { outcome: "quarantined", replayAuthorized: false });
          const after = await states();
          assert.deepEqual(after, { ...before, outbox: { ...(before.outbox as object), state: "QUARANTINED" } });
          assert.deepEqual(await execute(tx, new NativeWorklogBudget()), result);
          assert.deepEqual(await states(), after);
        } else {
          assert.deepEqual(result, { outcome: "applied", completionAuthorized: true });
          const after = await states();
          const outbox = after.outbox as { state: string; attempts: number; completedAt: string };
          assert.equal(outbox.state, "APPLIED"); assert.equal(outbox.attempts, 0); assert.ok(outbox.completedAt);
          const balance = after.account as { pendingPoints: number; availablePoints: number; lifetimeEarned: number; contributionScore: number; trustScore: number };
          assert.equal(balance.pendingPoints, 2); assert.equal(balance.availablePoints, 29);
          assert.equal(balance.lifetimeEarned, 29); assert.equal(balance.contributionScore, 29); assert.equal(balance.trustScore, 1);
          assert.equal((after.ledger as unknown[]).length, 3);
          assert.deepEqual(await reconcileNativeAccountingAcknowledgementInTransaction(tx, id, new NativeWorklogBudget()), { outcome: "applied-history", replayAuthorized: false });
          assert.deepEqual(await execute(tx, new NativeWorklogBudget()), { outcome: "deferred", completionAuthorized: false });
          assert.deepEqual(await states(), after);
        }
      }
      await cleanup(); continue;
    }
    if (backlogOnly) {
      assert.equal(historical, true);
      const additions = Array.from({ length: 5 }, () => ({ entryId: `c${randomBytes(12).toString("hex")}`,
        contributionId: `c${randomBytes(12).toString("hex")}` }));
      await tx.terraqoWorklogEntry.createMany({ data: additions.map(row => ({ id: row.entryId,
        authorId: user.id, professionalProfileId: profile.id, workspaceId, title: "Own backlog earned",
        summary: "Own temporary backlog SQL accounting evidence.", visibility: "PRIVATE" as const,
        createdAt: oldStamp, tqPointsAwarded: 1 })) });
      await tx.terraqoBuilderContribution.createMany({ data: additions.map(row => ({ id: row.contributionId,
        userId: user.id, workspaceId, type: "BETA_PARTICIPATION" as const, sourceKey: `worklog:${row.entryId}`,
        title: "Own backlog pending", detail: "Manual earned state", approvedPoints: 1,
        createdAt: oldStamp, availableAt: new Date("2026-08-08T12:00:00.000Z") })) });
      await tx.terraqoBuilderAccount.update({ where: { id: account.id }, data: { pendingPoints: 10 } });
      const ordered = [{ id: old.id, points: 3 }, ...additions.map(row => ({ id: row.contributionId, points: 1 }))]
        .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const firstBatchPoints = ordered.slice(0, 5).reduce((sum, row) => sum + row.points, 0);
      const states = async () => {
        const [row] = await tx.$queryRaw<Array<{ snapshot: Record<string, unknown> }>>(Prisma.sql`SELECT jsonb_build_object(
          'account', (SELECT to_jsonb(r) FROM icc."TerraqoBuilderAccount" r WHERE r.id=${account.id}),
          'contributions', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderContribution" r WHERE r."userId"=${user.id}),
          'ledger', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderLedger" r WHERE r."accountId"=${account.id}),
          'entries', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoWorklogEntry" r WHERE r."authorId"=${user.id}),
          'receipt', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogOperation" r WHERE r.id=${id}),
          'firstDecision', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogFirstDecision" r WHERE r."operationId"=${id}),
          'decision', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogDecision" r WHERE r."operationId"=${id}),
          'authority', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogAuthority" r WHERE r."operationId"=${id}),
          'outbox', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogAccounting" r WHERE r."operationId"=${id})
        ) AS snapshot`);
        return row.snapshot;
      };
      const beforeBatches = await states();
      const firstProof = beforeBatches.firstDecision as { disposition: string };
      assert.equal(firstProof.disposition, "RESERVED");
      const batchOne = await applySelectedNativeAccountingInTransaction(tx, id, new NativeWorklogBudget());
      assert.deepEqual(batchOne, { outcome: "pending", selected: 5, remainingDue: 1, future: 0, frozen: 0, completionAuthorized: false });
      const afterOne = await states();
      const firstAccount = afterOne.account as { pendingPoints: number; availablePoints: number; lifetimeEarned: number; contributionScore: number; trustScore: number };
      assert.equal(firstAccount.pendingPoints, 10 - firstBatchPoints);
      for (const value of [firstAccount.availablePoints, firstAccount.lifetimeEarned, firstAccount.contributionScore])
        assert.equal(value, 26 + firstBatchPoints);
      assert.equal(firstAccount.trustScore, 1);
      const firstContributions = afterOne.contributions as Array<{ id: string; releasedAt: string | null }>;
      const firstLedger = afterOne.ledger as Array<{ contributionId: string }>;
      assert.equal(firstLedger.length, 7);
      for (const row of ordered.slice(0, 5)) assert.ok(firstContributions.find(c => c.id === row.id)?.releasedAt);
      assert.equal(firstContributions.find(c => c.id === ordered[5].id)?.releasedAt, null);
      // Two bounded calls in the same rollback transaction: this does not prove
      // transport acknowledgements, separately committed batches or concurrency.
      const batchTwo = await applySelectedNativeAccountingInTransaction(tx, id, new NativeWorklogBudget());
      assert.deepEqual(batchTwo, { outcome: "pending", selected: 1, remainingDue: 0, future: 0, frozen: 0, completionAuthorized: false });
      const afterTwo = await states();
      const finalAccount = afterTwo.account as typeof firstAccount;
      assert.equal(finalAccount.pendingPoints, 2); assert.equal(finalAccount.trustScore, 1);
      for (const value of [finalAccount.availablePoints, finalAccount.lifetimeEarned, finalAccount.contributionScore]) assert.equal(value, 34);
      const finalLedger = afterTwo.ledger as Array<{ contributionId: string }>;
      const finalContributions = afterTwo.contributions as typeof firstContributions;
      assert.equal(finalLedger.length, 8);
      for (const prior of firstLedger) assert.deepEqual(finalLedger.find(row => row.contributionId === prior.contributionId), prior);
      for (const prior of firstContributions.filter(row => row.id !== ordered[5].id))
        assert.deepEqual(finalContributions.find(row => row.id === prior.id), prior);
      for (const row of ordered) {
        assert.equal(finalLedger.filter(credit => credit.contributionId === row.id).length, 1);
        assert.ok(finalContributions.find(c => c.id === row.id)?.releasedAt);
      }
      assert.equal(finalLedger.filter(row => row.contributionId === first.id).length, 1);
      assert.equal(await tx.terraqoNativeWorklogFirstDecision.count({ where: { operationId: id } }), 1);
      for (const key of ["entries", "receipt", "firstDecision", "decision", "authority", "outbox"]) {
        assert.deepEqual(afterTwo[key], afterOne[key]);
        if (key !== "entries") assert.deepEqual(afterTwo[key], beforeBatches[key]);
      }
      assert.equal((afterTwo.outbox as { state: string }).state, "PENDING");
      assert.ok(!JSON.stringify([batchOne, batchTwo]).includes(user.id));
      await cleanup();
      assert.equal(await tx.terraqoProfessionalProfile.count({ where: { id: profile.id } }), 0);
      assert.equal(await tx.terraqoWorklogEntry.count({ where: { authorId: user.id } }), 0);
      assert.equal(await tx.terraqoNativeWorklogOperation.count({ where: { actorId: user.id } }), 0);
      assert.equal(await tx.terraqoNativeWorklogDecision.count({ where: { operationId: id } }), 0);
      assert.equal(await tx.terraqoNativeWorklogAuthority.count({ where: { operationId: id } }), 0);
      assert.equal(await tx.terraqoNativeWorklogAccounting.count({ where: { operationId: id } }), 0);
      assert.equal(await tx.terraqoNativeWorklogFirstDecision.count({ where: { operationId: id } }), 0);
      continue;
    }
    if (selectionOnly) {
      const states = async () => {
        const [row] = await tx.$queryRaw<unknown[]>(Prisma.sql`SELECT jsonb_build_object(
          'account', (SELECT to_jsonb(r) FROM icc."TerraqoBuilderAccount" r WHERE r.id=${account.id}),
          'contributions', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderContribution" r WHERE r."userId"=${user.id}),
          'ledger', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderLedger" r WHERE r."accountId"=${account.id}),
          'entries', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoWorklogEntry" r WHERE r."authorId"=${user.id}),
          'receipt', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogOperation" r WHERE r.id=${id}),
          'firstDecision', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogFirstDecision" r WHERE r."operationId"=${id}),
          'decision', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogDecision" r WHERE r."operationId"=${id}),
          'authority', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogAuthority" r WHERE r."operationId"=${id}),
          'outbox', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogAccounting" r WHERE r."operationId"=${id})
        ) AS snapshot`);
        return row;
      };
      const before = await states();
      const firstProof = await tx.terraqoNativeWorklogFirstDecision.findUniqueOrThrow({ where: { operationId: id } });
      assert.equal(firstProof.disposition, "RESERVED");
      let injected = false;
      const proxy = new Proxy(tx, { get(target, key) {
        if (key !== "terraqoBuilderLedger") return Reflect.get(target, key);
        return new Proxy(target.terraqoBuilderLedger, { get(model, field) {
          if (field !== "create") return Reflect.get(model, field);
          return async (args: Prisma.TerraqoBuilderLedgerCreateArgs) => {
            const row = await model.create(args);
            if (args.data.contributionId === old.id) {
              const current = await target.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } });
              assert.equal(current.availablePoints, 29); assert.equal(current.pendingPoints, 2);
              assert.equal(await model.count({ where: { accountId: account.id } }), 3);
              await target.terraqoWorklogEntry.update({ where: { id: oldEntry.id }, data: { tqPointsAwarded: 2 } });
              injected = true; // Own SQL inconsistency after all real credits, before post-verification.
            }
            return row;
          };
        } });
      } });
      await tx.$executeRawUnsafe("SAVEPOINT own_selection_postverify");
      await assert.rejects(() => applySelectedNativeAccountingInTransaction(proxy, id, new NativeWorklogBudget()), reject);
      assert.equal(injected, true);
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_selection_postverify");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_selection_postverify");
      assert.deepEqual(await states(), before);
      assert.deepEqual(await tx.terraqoNativeWorklogFirstDecision.findUniqueOrThrow({ where: { operationId: id } }), firstProof);
      const result = await applySelectedNativeAccountingInTransaction(tx, id, new NativeWorklogBudget());
      assert.deepEqual(result, { outcome: "pending", selected: 1, remainingDue: 0, future: 0, frozen: 0, completionAuthorized: false });
      assert.ok(!JSON.stringify(result).includes(old.id));
      const saved = await states();
      assert.deepEqual(await applySelectedNativeAccountingInTransaction(tx, id, new NativeWorklogBudget()),
        { outcome: "pending", selected: 0, remainingDue: 0, future: 0, frozen: 0, completionAuthorized: false });
      assert.deepEqual(await states(), saved);
      assert.equal((await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } })).availablePoints, 29);
      assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 3);
      assert.equal((await tx.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId: id } })).state, "PENDING");
      assert.deepEqual(await tx.terraqoNativeWorklogFirstDecision.findUniqueOrThrow({ where: { operationId: id } }), firstProof);
      await cleanup();
      assert.equal(await tx.terraqoProfessionalProfile.count({ where: { id: profile.id } }), 0);
      assert.equal(await tx.terraqoWorklogEntry.count({ where: { authorId: user.id } }), 0);
      assert.equal(await tx.terraqoNativeWorklogOperation.count({ where: { actorId: user.id } }), 0);
      assert.equal(await tx.terraqoNativeWorklogFirstDecision.count({ where: { operationId: id } }), 0);
      assert.equal(await tx.terraqoNativeWorklogAuthority.count({ where: { operationId: id } }), 0);
      assert.equal(await tx.terraqoNativeWorklogDecision.count({ where: { operationId: id } }), 0);
      assert.equal(await tx.terraqoNativeWorklogAccounting.count({ where: { operationId: id } }), 0);
      continue;
    }
    if (legacyFirstOnly) {
      await tx.terraqoBuilderAccount.update({ where: { id: account.id }, data: {
        availablePoints: 25, lifetimeEarned: 25, contributionScore: 25 } });
      const firstLedger = await tx.terraqoBuilderLedger.create({ data: {
        accountId: account.id, contributionId: first.id, type: "CREDIT", pointsDelta: 25, scoreDelta: 25,
        balanceAfter: 25, description: "Own manual credited legacy FIRST",
        idempotencyKey: `contribution:${first.id}:25`, createdAt: new Date("2026-08-01T12:00:00.999Z") } });
      const firstBefore = await tx.terraqoBuilderContribution.findUniqueOrThrow({ where: { id: first.id } });
      const firstSnapshot = await tx.terraqoNativeWorklogFirstDecision.findUniqueOrThrow({ where: { operationId: id } });
      const states = async () => {
        const [row] = await tx.$queryRaw<Array<{ snapshot: {
          account: { availablePoints: number; pendingPoints: number; lifetimeEarned: number; contributionScore: number; trustScore: number };
          ledger: unknown[]; outbox: { state: string };
        } }>>(Prisma.sql`SELECT jsonb_build_object(
          'account', (SELECT to_jsonb(r) FROM icc."TerraqoBuilderAccount" r WHERE r.id=${account.id}),
          'contributions', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderContribution" r WHERE r."userId"=${user.id}),
          'entries', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoWorklogEntry" r WHERE r."authorId"=${user.id}),
          'ledger', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderLedger" r WHERE r."accountId"=${account.id}),
          'receipt', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogOperation" r WHERE r.id=${id}),
          'firstDecision', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogFirstDecision" r WHERE r."operationId"=${id}),
          'decision', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogDecision" r WHERE r."operationId"=${id}),
          'authority', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogAuthority" r WHERE r."operationId"=${id}),
          'outbox', (SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogAccounting" r WHERE r."operationId"=${id})
        ) AS snapshot`);
        return row.snapshot;
      };
      for (const prepare of [
        () => tx.terraqoBuilderLedger.delete({ where: { id: firstLedger.id } }),
        () => tx.terraqoBuilderLedger.update({ where: { id: firstLedger.id }, data: { type: "REVERSAL", pointsDelta: -25, scoreDelta: -25 } }),
        () => tx.terraqoBuilderContribution.update({ where: { id: first.id }, data: { status: "IN_REVIEW" } }),
      ]) {
        await tx.$executeRawUnsafe("SAVEPOINT own_legacy_first_review");
        try {
          await prepare(); const before = await states();
          const result = await applyHistoricalNativeAccountingInTransaction(tx, id, new NativeWorklogBudget(), []);
          assert.equal(result.outcome, "review-required");
          if (result.outcome !== "review-required") assert.fail("Review required before credits");
          assert.equal(result.legacyInspection.unsupported, 1);
          assert.equal(result.completionAuthorized, false); assert.deepEqual(await states(), before);
        } finally {
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_legacy_first_review");
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_legacy_first_review");
        }
      }
      assert.deepEqual(await run(), { outcome: "pending", base: "allocated", first: "historical", release: "released", legacy: ["released"] });
      const saved = await states();
      assert.deepEqual(await run(), { outcome: "pending", base: "released-history", first: "historical", release: "historical", legacy: ["historical"] });
      assert.deepEqual(await states(), saved);
      assert.deepEqual(await tx.terraqoBuilderContribution.findUniqueOrThrow({ where: { id: first.id } }), firstBefore);
      assert.deepEqual(await tx.terraqoBuilderLedger.findUniqueOrThrow({ where: { id: firstLedger.id } }), firstLedger);
      assert.equal(saved.account.availablePoints, 29); assert.equal(saved.account.pendingPoints, 2);
      assert.equal(saved.account.lifetimeEarned, 29); assert.equal(saved.account.contributionScore, 29);
      assert.equal(saved.account.trustScore, 1); assert.equal(saved.ledger.length, 3);
      assert.equal(await tx.terraqoBuilderLedger.count({ where: { contributionId: first.id } }), 1);
      assert.deepEqual(await tx.terraqoNativeWorklogDecision.findUniqueOrThrow({ where: { operationId: id } }), snapshot);
      assert.equal(saved.outbox.state, "PENDING");
      assert.deepEqual(await tx.terraqoNativeWorklogFirstDecision.findUniqueOrThrow({ where: { operationId: id } }), firstSnapshot);
      await cleanup();
      assert.equal(await tx.terraqoNativeWorklogFirstDecision.count({ where: { operationId: id } }), 0);
      assert.equal(await tx.terraqoNativeWorklogOperation.count({ where: { id } }), 0);
      assert.equal(await tx.terraqoProfessionalProfile.count({ where: { userId: user.id } }), 0);
      assert.equal(await tx.terraqoWorklogEntry.count({ where: { authorId: user.id } }), 0);
      continue;
    }
    if (!historical || reviewOnly) {
      await assert.rejects(() => runWith(tx, [old.id, old.id]), reject);
      await assert.rejects(() => runWith(tx, Array.from({ length: 6 }, (_, i) => `${i}`.padStart(25, "a"))), reject);
    }
    if (historical && reviewOnly) {
      await tx.$executeRawUnsafe("SAVEPOINT own_historical_no_authority");
      await tx.terraqoNativeWorklogAuthority.delete({ where: { operationId: id } });
      await assert.rejects(run, reject);
      assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 0);
      assert.equal((await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } })).pendingPoints, 5);
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_historical_no_authority");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_historical_no_authority");
    }
    if (historical && reviewOnly) {
      async function ownStates() {
        return { account: await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } }),
          entries: await tx.terraqoWorklogEntry.findMany({ where: { authorId: user.id }, orderBy: { id: "asc" } }),
          contributions: await tx.terraqoBuilderContribution.findMany({ where: { userId: user.id }, orderBy: { id: "asc" } }),
          ledger: await tx.terraqoBuilderLedger.findMany({ where: { accountId: account.id }, orderBy: { id: "asc" } }),
          outbox: await tx.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId: id } }) };
      }
      async function reviewCase(prepare: () => Promise<unknown>, field: "missingReference" | "ambiguous" | "unsupported" | "rejected" | "unfunded") {
        await tx.$executeRawUnsafe("SAVEPOINT own_omitted_legacy_review");
        try {
          await prepare();
          const before = await ownStates();
          // Omit ALL legacy IDs: preflight must still see the entire relevant family.
          const result = await applyHistoricalNativeAccountingInTransaction(tx, id, new NativeWorklogBudget(), []);
          assert.equal(result.outcome, "review-required");
          if (result.outcome !== "review-required") assert.fail("Review disposition required");
          assert.equal(result.legacyInspection[field], 1); assert.equal(result.completionAuthorized, false);
          assert.ok(!JSON.stringify(result).includes(old.id)); assert.ok(!JSON.stringify(result).includes(user.id));
          assert.deepEqual(await ownStates(), before);
        } finally {
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_omitted_legacy_review");
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_omitted_legacy_review");
        }
      }
      await reviewCase(() => tx.terraqoWorklogEntry.delete({ where: { id: oldEntry.id } }), "missingReference");
      await reviewCase(() => tx.terraqoBuilderLedger.create({ data: { accountId: account.id, contributionId: old.id,
        type: "REVERSAL", pointsDelta: -1, scoreDelta: -1, balanceAfter: 0,
        description: "Own omitted legacy review proof", idempotencyKey: `own-preflight:${marker}` } }), "ambiguous");
      await reviewCase(() => tx.terraqoBuilderContribution.create({ data: { userId: user.id, type: "EXPERIENCE_VALIDATION",
        sourceKey: `worklog-validation:${oldEntry.id}`, title: "Own unsupported legacy validation",
        detail: "Manual review case", approvedPoints: 1, createdAt: oldStamp } }), "unsupported");
      await reviewCase(() => tx.terraqoBuilderContribution.update({ where: { id: first.id },
        data: { detail: "native-first-worklog-v1:malformed" } }), "unsupported");
      await reviewCase(() => tx.terraqoBuilderContribution.update({ where: { id: old.id }, data: { status: "REJECTED" } }), "rejected");
      await reviewCase(() => tx.terraqoBuilderContribution.update({ where: { id: old.id }, data: { availableAt: null } }), "unfunded");
    }
    if (reviewOnly) { await cleanup(); continue; }
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
    if (!historical) {
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
    }
    assert.deepEqual(await tx.terraqoNativeWorklogDecision.findUniqueOrThrow({ where: { operationId: id } }), snapshot);
    assert.equal((await tx.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId: id } })).state, "PENDING");
    await cleanup();
  }
}
