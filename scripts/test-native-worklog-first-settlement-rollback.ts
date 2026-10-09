import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { parseNativeWorklogPayload } from "../lib/server/native-worklog-payload";
import { planNativeWorklogDecision, saveNativeWorklogDecision } from "../lib/server/native-worklog-decision";
import { chooseNativeFirstWorklogInTransaction, saveNativeFirstWorklogDecision } from "../lib/server/native-worklog-first-decision";
import { NativeWorklogBudget } from "../lib/server/native-worklog-budget";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";
import { settleSelectedNativeAccountingInTransaction } from "../lib/server/native-worklog-selected-accounting";

/** Own historical fixture only: authority metadata is synthetic, not JWT/core capture.
 * The real server choice observes the prior entry BEFORE inserting the new receipt.
 * Settlement, credits and completion must roll back together on ANY final failure.
 */
export async function nativeFirstSettlementRollback(tx: Prisma.TransactionClient, workspaceId: string) {
  const marker = randomUUID(), id = createHash("sha256").update(marker).digest("hex");
  const user = await tx.user.create({ data: { role: "CUSTOMER", name: `ICC FIRST settlement own ${marker}`,
    email: `first-settlement-${marker}@example.invalid` } });
  const profile = await tx.terraqoProfessionalProfile.create({ data: { userId: user.id, visibility: "PRIVATE", liveCvEnabled: false } });
  const previous = await tx.terraqoWorklogEntry.create({ data: { authorId: user.id, workspaceId, professionalProfileId: profile.id,
    title: "Own earlier unrewarded entry", summary: "Own previous entry proving FIRST ineligibility.", visibility: "PRIVATE",
    createdAt: new Date("2026-08-01T12:00:00.000Z") } });
  const parsed = await parseNativeWorklogPayload(new Request("https://example.invalid/own", { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ operationKey: "a".repeat(32),
      title: "ICC own FIRST settlement", summary: "Own temporary historical settlement with durable FIRST decision.",
      outcome: "", type: "FIELD_UPDATE", projectId: "", projectVersion: "" }) }));
  const stamp = new Date("2026-09-01T12:00:00.000Z");
  const plan = await planNativeWorklogDecision(tx, user.id, parsed, stamp);
  const first = await chooseNativeFirstWorklogInTransaction(tx, user.id, id, stamp);
  assert.equal(first.disposition, "INELIGIBLE"); assert.equal(first.priorEntries, 1);
  const entry = await tx.terraqoWorklogEntry.create({ data: { authorId: user.id, workspaceId, professionalProfileId: profile.id,
    title: parsed.payload.title, summary: parsed.payload.summary, visibility: "PRIVATE",
    contentFingerprint: plan.contentKey, createdAt: stamp, updatedAt: stamp } });
  await tx.terraqoNativeWorklogOperation.create({ data: { id, actorId: user.id, workspaceId, professionalProfileId: profile.id,
    operationKey: parsed.payload.operationKey, fingerprint: parsed.fingerprint, targetWorklogId: entry.id, worklogId: entry.id,
    createdAt: stamp, resultVersion: stamp } });
  await saveNativeWorklogDecision(tx, id, plan);
  await saveNativeFirstWorklogDecision(tx, id, first);
  await tx.terraqoNativeWorklogAuthority.create({ data: { operationId: id, actorId: user.id, workspaceId,
    professionalProfileId: profile.id, createdAt: stamp, fingerprint: parsed.fingerprint,
    policyVersion: "native-creation-authority-v1", grantHash: "c".repeat(64), tokenIssuedAt: stamp,
    tokenExpiresAt: new Date("2026-09-02T12:00:00.000Z"), grantExpiresAt: new Date("2026-09-02T12:00:00.000Z"),
    paidThrough: null, role: "PROFESSIONAL", modules: ["LIVE_CV", "PROFESSIONAL_NETWORK"] } });
  await tx.terraqoNativeWorklogAccounting.create({ data: { operationId: id, createdAt: stamp, nextAttemptAt: stamp } });
  const account = await tx.terraqoBuilderAccount.create({ data: { userId: user.id, pendingPoints: 2,
    availablePoints: 2, lifetimeEarned: 2, contributionScore: 2, trustScore: 4 } });
  await tx.terraqoBuilderContribution.create({ data: { userId: user.id, type: "BUG_REPORT", title: "Own future retained",
    detail: "Own floor fixture only", approvedPoints: 2, availableAt: new Date("2099-01-01T00:00:00.000Z") } });
  // Deleting the prior physical entry must never recompute the saved choice.
  await tx.terraqoWorklogEntry.delete({ where: { id: previous.id } });
  const state = async () => (await tx.$queryRaw<Array<{ snapshot: unknown }>>(Prisma.sql`SELECT jsonb_build_object(
    'account',(SELECT to_jsonb(r) FROM icc."TerraqoBuilderAccount" r WHERE r.id=${account.id}),
    'contributions',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderContribution" r WHERE r."userId"=${user.id}),
    'ledger',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderLedger" r WHERE r."accountId"=${account.id}),
    'entry',(SELECT to_jsonb(r) FROM icc."TerraqoWorklogEntry" r WHERE r.id=${entry.id}),
    'receipt',(SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogOperation" r WHERE r.id=${id}),
    'decision',(SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogDecision" r WHERE r."operationId"=${id}),
    'first',(SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogFirstDecision" r WHERE r."operationId"=${id}),
    'authority',(SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogAuthority" r WHERE r."operationId"=${id}),
    'outbox',(SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogAccounting" r WHERE r."operationId"=${id})) AS snapshot`))[0].snapshot;
  const reject = (e: unknown) => e instanceof NativeWorklogOperationError && e.status === 503;
  async function isolated(action: () => Promise<void>) {
    const before = await state();
    await tx.$executeRawUnsafe("SAVEPOINT own_first_settlement");
    try { await action(); } finally {
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_first_settlement");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_first_settlement");
    }
    assert.deepEqual(await state(), before);
  }
  await isolated(async () => {
    await tx.terraqoNativeWorklogFirstDecision.delete({ where: { operationId: id } });
    await assert.rejects(() => settleSelectedNativeAccountingInTransaction(tx, id, new NativeWorklogBudget()), reject);
  });
  await isolated(async () => {
    let clock = 0;
    const port = new Proxy(tx, { get(target, field) {
      if (field === "terraqoNativeWorklogAccounting") return new Proxy(target.terraqoNativeWorklogAccounting, { get(delegate, method) {
        if (method === "updateMany") return async (args: Prisma.TerraqoNativeWorklogAccountingUpdateManyArgs) => {
          const result = await delegate.updateMany(args);
          assert.equal((await delegate.findUniqueOrThrow({ where: { operationId: id } })).state, "APPLIED");
          assert.equal((await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } })).availablePoints, 3);
          assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 1);
          clock = 48000; return result;
        };
        return Reflect.get(delegate, method);
      } });
      return Reflect.get(target, field);
    } });
    await assert.rejects(() => settleSelectedNativeAccountingInTransaction(port, id, new NativeWorklogBudget(() => clock)), reject);
  });
  assert.deepEqual(await settleSelectedNativeAccountingInTransaction(tx, id, new NativeWorklogBudget()),
    { outcome: "applied", completionAuthorized: true });
  const balance = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } });
  assert.deepEqual([balance.pendingPoints, balance.availablePoints, balance.lifetimeEarned, balance.contributionScore, balance.trustScore], [2,3,3,3,5]);
  assert.equal(await tx.terraqoBuilderContribution.count({ where: { userId: user.id, type: "FIRST_WORKLOG" } }), 0);
  assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 1);
  const applied = await state();
  assert.deepEqual(await settleSelectedNativeAccountingInTransaction(tx, id, new NativeWorklogBudget()),
    { outcome: "deferred", completionAuthorized: false });
  assert.deepEqual(await state(), applied);
  await tx.terraqoBuilderLedger.deleteMany({ where: { accountId: account.id } });
  await tx.terraqoNativeWorklogFirstDecision.delete({ where: { operationId: id } });
  await tx.terraqoBuilderContribution.deleteMany({ where: { userId: user.id } });
  await tx.terraqoBuilderAccount.delete({ where: { id: account.id } });
  await tx.terraqoNativeWorklogAuthority.delete({ where: { operationId: id } });
  await tx.terraqoNativeWorklogDecision.delete({ where: { operationId: id } });
  await tx.terraqoNativeWorklogAccounting.delete({ where: { operationId: id } });
  await tx.terraqoNativeWorklogOperation.delete({ where: { id } });
  await tx.user.delete({ where: { id: user.id } });
  assert.equal(await tx.user.count({ where: { id: user.id } }), 0);
  assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 0);
  assert.equal(await tx.terraqoBuilderContribution.count({ where: { userId: user.id } }), 0);
  assert.equal(await tx.terraqoNativeWorklogFirstDecision.count({ where: { operationId: id } }), 0);
}
