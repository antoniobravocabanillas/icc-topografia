import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { applyNativeFirstWorklogInTransaction } from "../lib/server/native-worklog-first-award";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";

/** Only invoked by the pinned checker's outer DDL rollback. Manual own state, no auth/core claim. */
export async function nativeFirstAccountRollback(tx: Prisma.TransactionClient, workspaceId: string) {
  const marker = randomUUID(), id = createHash("sha256").update(marker).digest("hex");
  const user = await tx.user.create({ data: { name: `ICC FIRST account rollback ${marker}`,
    email: `native-first-account-${marker}@example.invalid`, role: "CUSTOMER" } });
  const profile = await tx.terraqoProfessionalProfile.create({ data: { userId: user.id, visibility: "PRIVATE", liveCvEnabled: false } });
  const stamp = new Date("2026-09-01T12:00:00.000Z");
  const entry = await tx.terraqoWorklogEntry.create({ data: { authorId: user.id, professionalProfileId: profile.id,
    workspaceId, title: "ICC own FIRST account", summary: "Own temporary account rollback evidence only.", visibility: "PRIVATE" } });
  await tx.terraqoNativeWorklogOperation.create({ data: { id, actorId: user.id, workspaceId, professionalProfileId: profile.id,
    operationKey: "a".repeat(32), fingerprint: "b".repeat(64), targetWorklogId: entry.id,
    worklogId: entry.id, resultVersion: stamp, createdAt: stamp } });
  await tx.terraqoNativeWorklogAccounting.create({ data: { operationId: id } });
  const first = await tx.terraqoBuilderContribution.create({ data: { userId: user.id, type: "FIRST_WORKLOG",
    sourceKey: `first-worklog:${user.id}`, title: "Own FIRST reserve", detail: `native-first-worklog-v1:${id}`,
    status: "IN_REVIEW", requestedPoints: 25, approvedPoints: 0, createdAt: stamp } });
  await tx.terraqoBuilderContribution.create({ data: { userId: user.id, type: "BUG_REPORT", title: "Own future retained",
    detail: "Manual own retained balance", approvedPoints: 2, availableAt: new Date("2099-01-01T00:00:00.000Z") } });
  const account = await tx.terraqoBuilderAccount.create({ data: { userId: user.id, pendingPoints: 2,
    availablePoints: 3, lifetimeEarned: 3, contributionScore: 3, trustScore: 4 } });
  async function isolated(run: () => Promise<void>) {
    await tx.$executeRawUnsafe("SAVEPOINT own_first_account_case");
    try { await run(); } finally {
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_first_account_case");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_first_account_case");
    }
  }
  const unavailable = (error: unknown) => error instanceof NativeWorklogOperationError && error.status === 503;
  for (const field of ["availablePoints", "lifetimeEarned", "contributionScore"] as const) await isolated(async () => {
    await tx.terraqoBuilderAccount.update({ where: { id: account.id }, data: { [field]: 2147483647 } });
    await assert.rejects(() => applyNativeFirstWorklogInTransaction(tx, id), unavailable);
    assert.equal((await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } }))[field], 2147483647);
    assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 0);
    assert.equal((await tx.terraqoBuilderContribution.findUniqueOrThrow({ where: { id: first.id } })).approvedPoints, 0);
  });
  await isolated(async () => {
    await tx.terraqoBuilderAccount.update({ where: { id: account.id }, data: { pendingPoints: 1 } });
    await assert.rejects(() => applyNativeFirstWorklogInTransaction(tx, id), unavailable);
    assert.equal((await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } })).availablePoints, 3);
  });
  await isolated(async () => {
    await tx.terraqoBuilderAccount.update({ where: { id: account.id }, data: { rewardsFrozenUntil: new Date("2099-01-01T00:00:00.000Z") } });
    assert.equal(await applyNativeFirstWorklogInTransaction(tx, id), "deferred");
    assert.equal((await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } })).availablePoints, 3);
    assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 0);
  });
  await isolated(async () => {
    const faulty = new Proxy(tx, { get(target, property) {
      if (property === "terraqoBuilderLedger") return { create: async () => {
        const a = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } });
        assert.equal(a.availablePoints, 28); assert.equal(a.pendingPoints, 2);
        throw new Error("CONTROLLED_OWN_FIRST_LEDGER_FAULT");
      } };
      return Reflect.get(target, property);
    } });
    await assert.rejects(() => applyNativeFirstWorklogInTransaction(faulty, id), /CONTROLLED_OWN_FIRST_LEDGER_FAULT/);
  });
  assert.equal((await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } })).availablePoints, 3);
  assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 0);
  assert.equal((await tx.terraqoBuilderContribution.findUniqueOrThrow({ where: { id: first.id } })).releasedAt, null);
  assert.equal(await applyNativeFirstWorklogInTransaction(tx, id), "credited");
  const saved = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } });
  assert.equal(await applyNativeFirstWorklogInTransaction(tx, id), "historical");
  assert.deepEqual(await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } }), saved);
  assert.equal(saved.pendingPoints, 2); assert.equal(saved.availablePoints, 28); assert.equal(saved.lifetimeEarned, 28);
  assert.equal(saved.contributionScore, 28); assert.equal(saved.trustScore, 4);
  const ledger = await tx.terraqoBuilderLedger.findMany({ where: { accountId: account.id } });
  assert.equal(ledger.length, 1); assert.equal(ledger[0].pointsDelta, 25);
  assert.equal(ledger[0].idempotencyKey, `native-first-worklog:${first.id}:25`);
  await isolated(async () => {
    await tx.terraqoBuilderAccount.update({ where: { id: account.id }, data: { pendingPoints: 1 } });
    await assert.rejects(() => applyNativeFirstWorklogInTransaction(tx, id), unavailable);
    assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 1);
  });
  await isolated(async () => {
    await tx.terraqoBuilderContribution.update({ where: { id: first.id }, data: { releasedAt: null } });
    await assert.rejects(() => applyNativeFirstWorklogInTransaction(tx, id), unavailable);
    assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 1);
  });
  assert.equal((await tx.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId: id } })).state, "PENDING");
  await tx.terraqoBuilderLedger.deleteMany({ where: { accountId: account.id } });
  await tx.terraqoBuilderContribution.deleteMany({ where: { userId: user.id } });
  await tx.terraqoBuilderAccount.delete({ where: { id: account.id } });
  await tx.terraqoNativeWorklogAccounting.delete({ where: { operationId: id } });
  await tx.terraqoNativeWorklogOperation.delete({ where: { id } });
  await tx.user.delete({ where: { id: user.id } });
  assert.equal(await tx.user.count({ where: { id: user.id } }), 0);
  assert.equal(await tx.terraqoBuilderAccount.count({ where: { userId: user.id } }), 0);
  assert.equal(await tx.terraqoBuilderContribution.count({ where: { userId: user.id } }), 0);
  assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 0);
}
