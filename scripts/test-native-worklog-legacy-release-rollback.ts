import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { reconcileNativeLegacyReleaseInTransaction } from "../lib/server/native-worklog-legacy-release";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";

/** Only called inside the pinned schema checker's outer DDL rollback. No global runner. */
export async function nativeLegacyReleaseRollback(tx: Prisma.TransactionClient, workspaceId: string) {
  const name = randomUUID();
  const actor = await tx.user.create({ data: { name: `ICC own-release rollback ${name}`, email: `own-release-${name}@example.invalid`, role: "CUSTOMER" } });
  const other = await tx.user.create({ data: { name: `ICC own-release other ${name}`, email: `own-release-other-${name}@example.invalid`, role: "CUSTOMER" } });
  const profile = await tx.terraqoProfessionalProfile.create({ data: { userId: actor.id, visibility: "PRIVATE", liveCvEnabled: false } });
  const createdAt = new Date(), old = new Date(createdAt.getTime() - 3600000), future = new Date(createdAt.getTime() + 3600000);
  const entryData = { authorId: actor.id, professionalProfileId: profile.id, workspaceId, title: "ICC own release",
    summary: "Temporary own ICC release verification only.", type: "FIELD_UPDATE" as const, visibility: "PRIVATE" as const, evidenceUrls: [], skills: [] };
  const legacy = await tx.terraqoWorklogEntry.create({ data: { ...entryData, tqPointsAwarded: 5, trustScoreAwarded: 4, createdAt: old } });
  const native = await tx.terraqoWorklogEntry.create({ data: { ...entryData, createdAt, updatedAt: createdAt } });
  const operationId = createHash("sha256").update(name).digest("hex");
  await tx.terraqoNativeWorklogOperation.create({ data: { id: operationId, actorId: actor.id, workspaceId,
    professionalProfileId: profile.id, operationKey: "a".repeat(32), fingerprint: "b".repeat(64),
    targetWorklogId: native.id, worklogId: native.id, createdAt, resultVersion: createdAt } });
  await tx.terraqoNativeWorklogAccounting.create({ data: { operationId } });
  const contribution = await tx.terraqoBuilderContribution.create({ data: { userId: actor.id, workspaceId,
    sourceKey: `worklog:${legacy.id}`, type: "BETA_PARTICIPATION", status: "IN_REVIEW", title: "Own retained release", detail: "Own temporary proof",
    requestedPoints: 5, approvedPoints: 5, availableAt: old, createdAt: old } });
  const retained = await tx.terraqoBuilderContribution.create({ data: { userId: actor.id, type: "BUG_REPORT", status: "VALIDATED",
    title: "Own other pending", detail: "Own retained floor", requestedPoints: 2, approvedPoints: 2, availableAt: future, createdAt: old } });
  const account = await tx.terraqoBuilderAccount.create({ data: { userId: actor.id, pendingPoints: 5,
    availablePoints: 2, lifetimeEarned: 2, contributionScore: 2, trustScore: 4 } });
  const prior = await tx.terraqoBuilderLedger.create({ data: { accountId: account.id, contributionId: contribution.id,
    type: "CREDIT", pointsDelta: 2, scoreDelta: 2, balanceAfter: 2, description: "Own prior partial credit",
    idempotencyKey: `release:${contribution.id}:2` } });
  const run = () => reconcileNativeLegacyReleaseInTransaction(tx, operationId, contribution.id);
  async function testCase(action: () => Promise<unknown>, expected: "deferred" | 503 | "controlled") {
    await tx.$executeRawUnsafe("SAVEPOINT own_release_case");
    try {
      if (expected === "deferred") assert.equal(await action(), expected);
      else {
        let caught: unknown;
        try { await action(); } catch (error) { caught = error; }
        assert.ok(caught);
        if (expected === 503) { assert.ok(caught instanceof NativeWorklogOperationError); assert.equal(caught.status, 503); }
        if (expected === "controlled") { assert.ok(caught instanceof Error); assert.equal(caught.message, "CONTROLLED_RELEASE_LEDGER_FAULT"); }
      }
    } finally { await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_release_case"); await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_release_case"); }
    assert.equal((await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } })).availablePoints, 2);
    assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 1);
    assert.equal((await tx.terraqoBuilderContribution.findUniqueOrThrow({ where: { id: contribution.id } })).releasedAt, null);
  }
  await testCase(async () => { await tx.terraqoBuilderAccount.update({ where: { id: account.id }, data: { pendingPoints: 4 } }); return run(); }, 503);
  await testCase(async () => { await tx.terraqoBuilderAccount.update({ where: { id: account.id }, data: { rewardsFrozenUntil: future } }); return run(); }, "deferred");
  await testCase(async () => { await tx.terraqoBuilderContribution.update({ where: { id: contribution.id }, data: { availableAt: future } }); return run(); }, "deferred");
  await testCase(async () => { await tx.terraqoBuilderContribution.update({ where: { id: contribution.id }, data: { status: "REJECTED" } }); return run(); }, "deferred");
  await testCase(async () => { await tx.terraqoBuilderContribution.update({ where: { id: contribution.id }, data: { userId: other.id } }); return run(); }, 503);
  await testCase(async () => { await tx.terraqoBuilderContribution.update({ where: { id: contribution.id }, data: { sourceKey: `worklog:${native.id}` } }); return run(); }, 503);
  await testCase(async () => { await tx.terraqoBuilderContribution.update({ where: { id: contribution.id }, data: { releasedAt: old } }); return run(); }, 503);
  await testCase(async () => { await tx.terraqoBuilderLedger.update({ where: { id: prior.id }, data: { type: "REVERSAL", pointsDelta: -2, scoreDelta: -2 } }); return run(); }, 503);
  // Controlled overflow ports verify bounded admission; no synthetic rows are persisted.
  await testCase(() => reconcileNativeLegacyReleaseInTransaction(new Proxy(tx, { get(target, property) {
    if (property === "terraqoBuilderLedger") return { ...target.terraqoBuilderLedger, findMany: async (args: { take: number }) => {
      assert.equal(args.take, 201); return Array.from({ length: 201 }, () => prior);
    } };
    return Reflect.get(target, property);
  } }), operationId, contribution.id), 503);
  await testCase(() => reconcileNativeLegacyReleaseInTransaction(new Proxy(tx, { get(target, property) {
    if (property === "terraqoBuilderContribution") return { ...target.terraqoBuilderContribution, findMany: async (args: { take: number; include: { ledgerEntries: { take: number } } }) => {
      assert.equal(args.take, 201); assert.equal(args.include.ledgerEntries.take, 201);
      return [{ ...contribution, ledgerEntries: Array.from({ length: 201 }, () => prior) }];
    } };
    return Reflect.get(target, property);
  } }), operationId, contribution.id), 503);
  await testCase(() => reconcileNativeLegacyReleaseInTransaction(new Proxy(tx, { get(target, property) {
    if (property === "terraqoBuilderLedger") return { ...target.terraqoBuilderLedger, create: async () => {
      const changed = await target.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } });
      assert.equal(changed.availablePoints, 5); assert.equal(changed.pendingPoints, 2);
      throw new Error("CONTROLLED_RELEASE_LEDGER_FAULT");
    } };
    return Reflect.get(target, property);
  } }), operationId, contribution.id), "controlled");
  assert.equal(await run(), "released");
  assert.equal(await run(), "historical");
  const updated = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } });
  assert.equal(updated.pendingPoints, 2); assert.equal(updated.availablePoints, 5);
  assert.equal(updated.lifetimeEarned, 5); assert.equal(updated.contributionScore, 5); assert.equal(updated.trustScore, 4);
  const ledger = await tx.terraqoBuilderLedger.findMany({ where: { accountId: account.id } });
  assert.equal(ledger.length, 2); assert.equal(ledger.reduce((sum, row) => sum + row.pointsDelta, 0), 5);
  assert.ok(ledger.some(row => row.idempotencyKey === `release:${contribution.id}:5` && row.pointsDelta === 3 && row.balanceAfter === 5));
  assert.equal((await tx.terraqoBuilderContribution.findUniqueOrThrow({ where: { id: retained.id } })).releasedAt, null);
  await tx.terraqoBuilderContribution.update({ where: { id: contribution.id }, data: { releasedAt: null } });
  assert.equal(await run(), "historical");
  assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 2);
  assert.equal((await tx.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId } })).state, "PENDING");
  assert.equal((await tx.terraqoWorklogEntry.findUniqueOrThrow({ where: { id: legacy.id } })).trustScoreAwarded, 4);
  assert.equal((await tx.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: profile.id } })).liveCvEnabled, false);
  await tx.terraqoBuilderLedger.deleteMany({ where: { accountId: account.id } });
  await tx.terraqoBuilderContribution.deleteMany({ where: { userId: actor.id } });
  await tx.terraqoBuilderAccount.delete({ where: { id: account.id } });
  await tx.terraqoNativeWorklogAccounting.delete({ where: { operationId } });
  await tx.terraqoNativeWorklogOperation.delete({ where: { id: operationId } });
  await tx.terraqoWorklogEntry.deleteMany({ where: { authorId: actor.id } });
  await tx.terraqoProfessionalProfile.delete({ where: { id: profile.id } });
  await tx.user.deleteMany({ where: { id: { in: [actor.id, other.id] } } });
  assert.equal(await tx.user.count({ where: { id: { in: [actor.id, other.id] } } }), 0);
  assert.equal(await tx.terraqoBuilderAccount.count({ where: { userId: actor.id } }), 0);
  assert.equal(await tx.terraqoBuilderContribution.count({ where: { userId: actor.id } }), 0);
  assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 0);
}
