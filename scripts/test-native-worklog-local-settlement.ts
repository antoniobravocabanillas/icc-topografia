import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { blockedNativePair } from "./native-worklog-local-barrier";
import { parseNativeWorklogPayload } from "../lib/server/native-worklog-payload";
import { planNativeWorklogDecision, saveNativeWorklogDecision } from "../lib/server/native-worklog-decision";
import { chooseNativeFirstWorklogInTransaction, saveNativeFirstWorklogDecision } from "../lib/server/native-worklog-first-decision";
import { applyNativeWorklogBaseInTransaction } from "../lib/server/native-worklog-base-accounting";
import { releaseNativeWorklogBaseInTransaction } from "../lib/server/native-worklog-base-release";
import { settleSelectedNativeAccountingInTransaction } from "../lib/server/native-worklog-selected-accounting";
import { reconcileNativeAccountingAcknowledgementInTransaction } from "../lib/server/native-worklog-accounting-acknowledgement";
import { NativeWorklogBudget } from "../lib/server/native-worklog-budget";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";
import { executeNativeAccounting } from "../lib/server/native-worklog-accounting-executor";

/** LOCAL PG18 committed fixture, synthetic historical authority. Not JWT/core
 * capture, network loss or production-provider concurrency. No productive retry.
 */
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.pathname, "/terraqo_own_native_schema");
  assert.equal(url.username, "terraqo_own_schema");
  assert.match(process.env.TERRAQO_LOCAL_SCHEMA_MARKER ?? "", /^[a-f0-9]{32}$/);
  const a = new PrismaClient({ log: [], datasourceUrl: url.toString() });
  const b = new PrismaClient({ log: [], datasourceUrl: url.toString() });
  let userId: string | undefined, workspaceId: string | undefined, companyId: string | undefined;
  try {
    const [own] = await a.$queryRaw<{ marker: string }[]>`SELECT marker FROM public.terraqo_owned_schema_test`;
    assert.equal(own.marker, process.env.TERRAQO_LOCAL_SCHEMA_MARKER);
    const [settings] = await a.$queryRaw<{ timezone: string; isolation: string }[]>`
      SELECT current_setting('TimeZone') AS timezone,current_setting('default_transaction_isolation') AS isolation`;
    assert.equal(settings.timezone, "UTC"); assert.equal(settings.isolation, "read committed");
    assert.equal(await a.user.count(), 0); assert.equal(await a.terraqoWorkspace.count(), 0);
    const workspace = await a.terraqoWorkspace.create({ data: { slug: "icc-topografia", name: "ICC own LOCAL settlement" } });
    workspaceId = workspace.id;
    companyId = (await a.company.create({ data: { legalName: "ICC Topografia OWN LOCAL fixture",
      document: "20616116313", terraqoWorkspaceId: workspace.id } })).id;
    const user = await a.user.create({ data: { name: "ICC own LOCAL settlement", role: "CUSTOMER",
      email: `local-settlement-${randomUUID()}@example.invalid` } });
    userId = user.id;
    const operationId = createHash("sha256").update(randomUUID()).digest("hex");
    const parsed = await parseNativeWorklogPayload(new Request("https://example.invalid", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ operationKey: "d".repeat(32),
        title: "ICC own concurrent settlement", summary: "Own historical fixture for committed concurrent release and settlement.",
        outcome: "", type: "FIELD_UPDATE", projectId: "", projectVersion: "" }) }));
    // Fixture initialization is a single committed local transaction, not source backfill.
    await a.$transaction(async tx => {
      const profile = await tx.terraqoProfessionalProfile.create({ data: { userId: user.id, visibility: "PRIVATE", liveCvEnabled: false } });
      const oldStamp = new Date("2026-08-01T12:00:00.000Z");
      const oldEntry = await tx.terraqoWorklogEntry.create({ data: { authorId: user.id, workspaceId: workspace.id,
        professionalProfileId: profile.id, title: "Own previous earned legacy", summary: "Manual earned state only",
        visibility: "PRIVATE", createdAt: oldStamp, tqPointsAwarded: 3 } });
      await tx.terraqoBuilderContribution.create({ data: { userId: user.id, workspaceId: workspace.id,
        type: "BETA_PARTICIPATION", sourceKey: `worklog:${oldEntry.id}`, title: "Own retained legacy",
        detail: "Manual earned fixture", approvedPoints: 3, createdAt: oldStamp,
        availableAt: new Date("2026-08-08T12:00:00.000Z") } });
      const stamp = new Date("2026-09-01T12:00:00.000Z");
      const plan = await planNativeWorklogDecision(tx, user.id, parsed, stamp);
      const first = await chooseNativeFirstWorklogInTransaction(tx, user.id, operationId, stamp);
      assert.equal(first.disposition, "INELIGIBLE"); assert.equal(first.priorEntries, 1);
      assert.equal(plan.decision.tqPoints, 1); assert.equal(plan.decision.trustScore, 1);
      const entry = await tx.terraqoWorklogEntry.create({ data: { authorId: user.id, workspaceId: workspace.id,
        professionalProfileId: profile.id, title: parsed.payload.title, summary: parsed.payload.summary,
        visibility: "PRIVATE", contentFingerprint: plan.contentKey, createdAt: stamp, updatedAt: stamp } });
      await tx.terraqoNativeWorklogOperation.create({ data: { id: operationId, actorId: user.id, workspaceId: workspace.id,
        professionalProfileId: profile.id, operationKey: parsed.payload.operationKey, fingerprint: parsed.fingerprint,
        targetWorklogId: entry.id, worklogId: entry.id, createdAt: stamp, resultVersion: stamp } });
      await saveNativeWorklogDecision(tx, operationId, plan);
      await saveNativeFirstWorklogDecision(tx, operationId, first);
      await tx.terraqoNativeWorklogAuthority.create({ data: { operationId, actorId: user.id, workspaceId: workspace.id,
        professionalProfileId: profile.id, createdAt: stamp, fingerprint: parsed.fingerprint,
        policyVersion: "native-creation-authority-v1", grantHash: "c".repeat(64), tokenIssuedAt: stamp,
        tokenExpiresAt: new Date("2026-09-02T12:00:00.000Z"), grantExpiresAt: new Date("2026-09-02T12:00:00.000Z"),
        paidThrough: null, role: "PROFESSIONAL", modules: ["LIVE_CV", "PROFESSIONAL_NETWORK"] } });
      await tx.terraqoNativeWorklogAccounting.create({ data: { operationId, createdAt: stamp, nextAttemptAt: stamp } });
      await tx.terraqoBuilderAccount.create({ data: { userId: user.id, pendingPoints: 5,
        availablePoints: 2, lifetimeEarned: 2, contributionScore: 2, trustScore: 4 } });
      await tx.terraqoBuilderContribution.create({ data: { userId: user.id, type: "BUG_REPORT",
        title: "Own future retained", detail: "Unrelated earned floor", approvedPoints: 2,
        availableAt: new Date("2099-01-01T00:00:00.000Z") } });
    }, { maxWait: 1000, timeout: 7000 });
    const state = async (db: Pick<Prisma.TransactionClient, "$queryRaw">) =>
      (await db.$queryRaw<{ snapshot: unknown }[]>(Prisma.sql`SELECT jsonb_build_object(
        'account',(SELECT to_jsonb(r) FROM icc."TerraqoBuilderAccount" r WHERE r."userId"=${user.id}),
        'contributions',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderContribution" r WHERE r."userId"=${user.id}),
        'ledger',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderLedger" r JOIN icc."TerraqoBuilderAccount" ac ON ac.id=r."accountId" WHERE ac."userId"=${user.id}),
        'entries',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoWorklogEntry" r WHERE r."authorId"=${user.id}),
        'receipt',(SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogOperation" r WHERE r.id=${operationId}),
        'decision',(SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogDecision" r WHERE r."operationId"=${operationId}),
        'first',(SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogFirstDecision" r WHERE r."operationId"=${operationId}),
        'authority',(SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogAuthority" r WHERE r."operationId"=${operationId}),
        'outbox',(SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogAccounting" r WHERE r."operationId"=${operationId})) AS snapshot`))[0].snapshot;
    const before = await state(b);
    const executorMode = process.env.TERRAQO_LOCAL_EXECUTOR_MODE;
    if (executorMode) {
      assert.equal(["confirmed", "pending"].includes(executorMode), true);
      let primaryCalls = 0;
      const uncertainDatabase = new Proxy(a, { get(target, field) {
        if (field !== "$transaction") return Reflect.get(target, field);
        return async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { maxWait: number; timeout: number }) => {
          primaryCalls++;
          if (executorMode === "pending" && primaryCalls === 1) throw new Error("CONTROLLED_BEFORE_PRIMARY_CALLBACK");
          const value = await target.$transaction(callback, options);
          if (executorMode === "confirmed" && primaryCalls === 1) {
            assert.equal((await b.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId } })).state, "APPLIED");
            throw new Error("CONTROLLED_AFTER_PRIMARY_SQL_COMMITTED");
          }
          return value;
        };
      } });
      if (executorMode === "confirmed") {
        let clock = 0, casSeen = false, transactions = 0;
        const budgetFailure = new Proxy(a, { get(target, field) {
          if (field !== "$transaction") return Reflect.get(target, field);
          return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { maxWait: number; timeout: number }) => {
            transactions++;
            return target.$transaction(tx => callback(new Proxy(tx, { get(port, key) {
              if (key !== "terraqoNativeWorklogAccounting") return Reflect.get(port, key);
              return new Proxy(port.terraqoNativeWorklogAccounting, { get(delegate, method) {
                if (method !== "updateMany") return Reflect.get(delegate, method);
                return async (args: Prisma.TerraqoNativeWorklogAccountingUpdateManyArgs) => {
                  const changed = await delegate.updateMany(args);
                  assert.equal((await delegate.findUniqueOrThrow({ where: { operationId } })).state, "APPLIED");
                  const balance = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { userId: user.id } });
                  assert.equal(balance.availablePoints, 6);
                  assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: balance.id } }), 2);
                  casSeen = true; clock = 48000; return changed;
                };
              } });
            } })), options);
          };
        } });
        assert.deepEqual(await executeNativeAccounting(budgetFailure, operationId, new NativeWorklogBudget(() => clock)),
          { outcome: "uncertain", retryAuthorized: false, ownerAccessAuthorized: false });
        assert.equal(casSeen, true); assert.equal(transactions, 1);
        assert.deepEqual(await state(b), before);
      }
      const outcome = await executeNativeAccounting(uncertainDatabase, operationId, new NativeWorklogBudget());
      assert.deepEqual(outcome, { outcome: executorMode === "confirmed" ? "applied-history" : "quarantined",
        retryAuthorized: false, ownerAccessAuthorized: false });
      assert.equal(primaryCalls, 2);
      const current = await state(b);
      if (executorMode === "pending") {
        const original = structuredClone(before) as Record<string, unknown>;
        (original.outbox as Record<string, unknown>).state = "QUARANTINED";
        assert.deepEqual(current, original);
      } else {
        const account = await b.terraqoBuilderAccount.findUniqueOrThrow({ where: { userId: user.id } });
        assert.deepEqual([account.pendingPoints, account.availablePoints, account.trustScore], [2, 6, 5]);
        assert.equal(await b.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 2);
      }
      assert.deepEqual(await executeNativeAccounting(a, operationId, new NativeWorklogBudget()), outcome);
      assert.deepEqual(await state(b), current);
      console.log(JSON.stringify({ outcome: "passed", environment: "LOCAL_PG18_ONLY", executor_mode: executorMode,
        primary_rejected_reconciled: true, phases_replayed: 0, attempts_charged: 0,
        actual_transaction_rollback: executorMode === "confirmed", network_cut_proved: false }));
    } else {
    let clock = 0, observedCommittedCandidate = false;
    await assert.rejects(() => a.$transaction(async tx => {
      const fault = new Proxy(tx, { get(target, field) {
        if (field !== "terraqoNativeWorklogAccounting") return Reflect.get(target, field);
        return new Proxy(target.terraqoNativeWorklogAccounting, { get(delegate, method) {
          if (method !== "updateMany") return Reflect.get(delegate, method);
          return async (args: Prisma.TerraqoNativeWorklogAccountingUpdateManyArgs) => {
            const changed = await delegate.updateMany(args);
            assert.equal((await delegate.findUniqueOrThrow({ where: { operationId } })).state, "APPLIED");
            const account = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { userId: user.id } });
            assert.deepEqual([account.pendingPoints, account.availablePoints, account.trustScore], [2, 6, 5]);
            assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 2);
            observedCommittedCandidate = true; clock = 48000; return changed;
          };
        } });
      } });
      return settleSelectedNativeAccountingInTransaction(fault, operationId, new NativeWorklogBudget(() => clock));
    }, { maxWait: 1000, timeout: 7000 }),
    (error: unknown) => error instanceof NativeWorklogOperationError && error.status === 503);
    assert.equal(observedCommittedCandidate, true);
    // Separate connection observes actual completed SQL rollback, not a savepoint/mocked balance.
    assert.deepEqual(await state(b), before);
    assert.equal(await a.$transaction(tx => applyNativeWorklogBaseInTransaction(tx, operationId),
      { maxWait: 1000, timeout: 7000 }), "allocated");
    const release = await blockedNativePair(a, b, db => db.$transaction(async tx => {
      const outcome = await releaseNativeWorklogBaseInTransaction(tx, operationId);
      return { outcome, state: await state(tx) };
    }, { maxWait: 1000, timeout: 7000 }));
    assert.deepEqual(release.map(result => result.outcome), ["released", "historical"]);
    assert.deepEqual(release[1].state, release[0].state);
    const settled = await blockedNativePair(a, b, db => db.$transaction(async tx => {
      const outcome = await settleSelectedNativeAccountingInTransaction(tx, operationId, new NativeWorklogBudget());
      return { outcome, state: await state(tx) };
    }, { maxWait: 1000, timeout: 7000 }));
    assert.deepEqual(settled[0].outcome, { outcome: "applied", completionAuthorized: true });
    assert.deepEqual(settled[1].outcome, { outcome: "deferred", completionAuthorized: false });
    assert.deepEqual(settled[1].state, settled[0].state);
    const confirmed = await state(b);
    // Controlled caller exception AFTER independently confirmed SQL commit. No transport-cut claim.
    await assert.rejects(async () => {
      assert.equal((await b.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId } })).state, "APPLIED");
      throw new Error("CONTROLLED_AFTER_CONFIRMED_SQL");
    }, (error: unknown) => error instanceof Error && error.message === "CONTROLLED_AFTER_CONFIRMED_SQL");
    const ack = await blockedNativePair(a, b, db => db.$transaction(tx =>
      reconcileNativeAccountingAcknowledgementInTransaction(tx, operationId, new NativeWorklogBudget()),
    { maxWait: 1000, timeout: 7000 }));
    assert.deepEqual(ack, [{ outcome: "applied-history", replayAuthorized: false }, { outcome: "applied-history", replayAuthorized: false }]);
    assert.deepEqual(await state(b), confirmed);
    const account = await b.terraqoBuilderAccount.findUniqueOrThrow({ where: { userId: user.id } });
    assert.deepEqual([account.pendingPoints, account.availablePoints, account.lifetimeEarned, account.contributionScore, account.trustScore], [2, 6, 6, 6, 5]);
    assert.equal(await b.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 2);
    assert.equal(await b.terraqoBuilderContribution.count({ where: { userId: user.id, type: "FIRST_WORKLOG" } }), 0);
    console.log(JSON.stringify({ outcome: "passed", environment: "LOCAL_PG18_ONLY", blocked_pairs: 3,
      actual_transaction_rollback: true, native_release_ledgers: 1, legacy_release_ledgers: 1,
      applied_once: true, first_ineligible_no_credit: true, pending_retained: 2,
      confirmed_ack_exception: "CONTROLLED_CALLER_ONLY", network_cut_proved: false, cross_owner_proved: false }));
    }
  } finally {
    try {
      if (userId) {
        const account = await a.terraqoBuilderAccount.findUnique({ where: { userId } });
        if (account) await a.terraqoBuilderLedger.deleteMany({ where: { accountId: account.id } });
        await a.terraqoNativeWorklogFirstDecision.deleteMany({ where: { actorId: userId } });
        await a.terraqoBuilderContribution.deleteMany({ where: { userId } });
        await a.terraqoBuilderAccount.deleteMany({ where: { userId } });
        await a.terraqoNativeWorklogAuthority.deleteMany({ where: { actorId: userId } });
        await a.terraqoNativeWorklogDecision.deleteMany({ where: { operation: { actorId: userId } } });
        await a.terraqoNativeWorklogAccounting.deleteMany({ where: { operation: { actorId: userId } } });
        await a.terraqoNativeWorklogOperation.deleteMany({ where: { actorId: userId } });
        await a.user.delete({ where: { id: userId } });
      }
      if (companyId) await a.company.delete({ where: { id: companyId } });
      if (workspaceId) await a.terraqoWorkspace.delete({ where: { id: workspaceId } });
      for (const count of await Promise.all([a.user.count(), a.company.count(), a.terraqoWorkspace.count(),
        a.terraqoProfessionalProfile.count(), a.terraqoWorklogEntry.count(), a.terraqoBuilderAccount.count(),
        a.terraqoBuilderContribution.count(), a.terraqoBuilderLedger.count(), a.terraqoNativeWorklogOperation.count(),
        a.terraqoNativeWorklogFirstDecision.count(), a.terraqoNativeWorklogAccounting.count(), a.terraqoNativeWorklogDecision.count(),
        a.terraqoNativeWorklogAuthority.count()])) assert.equal(count, 0);
      console.log(JSON.stringify({ own_local_fixtures_absent: true }));
    } finally { await Promise.all([a.$disconnect(), b.$disconnect()]); }
  }
}
main().catch((error: unknown) => {
  const category = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error instanceof assert.AssertionError ? "assertion" : "unknown";
  const location = error instanceof Error ? error.stack?.match(/(?:test-native-worklog-local-settlement|native-worklog-local-barrier)\.ts:\d+:\d+/)?.[0] : undefined;
  console.error(JSON.stringify({ outcome: "failed", category, location })); process.exitCode = 1;
});
