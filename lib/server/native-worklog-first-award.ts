import "server-only";
import { Prisma } from "@prisma/client";
import { NativeWorklogOperationError } from "./native-worklog-http";

function fail(): never { throw new NativeWorklogOperationError(503); }
const integer = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
const source = (actorId: string) => `first-worklog:${actorId}`;
const marker = (operationId: string) => `native-first-worklog-v1:${operationId}`;

/** Owner profile must already be locked. Reserve the unique first-award decision, never points.
 * Absence of an allocation is final once a native receipt exists: later creations cannot promote it.
 */
export async function reserveNativeFirstWorklog(tx: Prisma.TransactionClient,
  input: { actorId: string; operationId: string; createdAt: Date }) {
  const existing = await tx.terraqoBuilderContribution.findUnique({ where: { sourceKey: source(input.actorId) } });
  if (existing) {
    if (existing.userId !== input.actorId || existing.type !== "FIRST_WORKLOG") fail();
    return;
  }
  if (await tx.terraqoNativeWorklogOperation.count({ where: { actorId: input.actorId } }) ||
      await tx.terraqoWorklogEntry.count({ where: { authorId: input.actorId } })) return;
  await tx.terraqoBuilderContribution.create({ data: { userId: input.actorId, type: "FIRST_WORKLOG",
    sourceKey: source(input.actorId), title: "Primera bitácora útil", detail: marker(input.operationId),
    status: "IN_REVIEW", requestedPoints: 25, approvedPoints: 0, createdAt: input.createdAt } });
}

/** Internal transaction-only phase. No scheduler/auth bypass/API; does NOT mark Accounting APPLIED.
 * First bonus is independent of base reputation and reconciliation of older pending worklog releases.
 */
export async function applyNativeFirstWorklogInTransaction(tx: Prisma.TransactionClient, operationId: string) {
  if (!/^[a-f0-9]{64}$/.test(operationId)) fail();
  const identity = await tx.terraqoNativeWorklogOperation.findUnique({ where: { id: operationId } });
  if (!identity) fail();
  const [profile] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM icc."TerraqoProfessionalProfile" WHERE id=${identity.professionalProfileId}
    AND "userId"=${identity.actorId} FOR UPDATE`);
  if (!profile) fail();
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoNativeWorklogOperation" WHERE id=${operationId} FOR UPDATE`);
  const accounting = await tx.$queryRaw<{ state: string }[]>(Prisma.sql`
    SELECT state FROM icc."TerraqoNativeWorklogAccounting" WHERE "operationId"=${operationId} FOR UPDATE`);
  if (!accounting.length) fail();
  if (accounting[0].state !== "PENDING") return "deferred" as const;
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoBuilderContribution"
    WHERE "sourceKey"=${source(identity.actorId)} FOR UPDATE`);
  const contribution = await tx.terraqoBuilderContribution.findUnique({ where: { sourceKey: source(identity.actorId) },
    include: { ledgerEntries: { take: 2, orderBy: { id: "asc" } } } });
  if (!contribution) return "ineligible" as const;
  if (contribution.userId !== identity.actorId || contribution.type !== "FIRST_WORKLOG" ||
      contribution.requestedPoints !== 25 || ![0, 25].includes(contribution.approvedPoints)) fail();
  const initial = await tx.terraqoBuilderAccount.findUnique({ where: { userId: identity.actorId } });
  if (initial) await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoBuilderAccount" WHERE id=${initial.id} FOR UPDATE`);
  const account = initial ? await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: initial.id } }) : null;
  if (account && account.userId !== identity.actorId) fail();
  // A foreign or ambiguous ledger never authorizes a compensating/new credit.
  if (contribution.ledgerEntries.length > 1 || contribution.ledgerEntries.some(row => !account || row.accountId !== account.id ||
      row.redemptionId !== null || row.type !== "CREDIT" || row.pointsDelta !== 25 || row.scoreDelta !== 25)) fail();
  const credited = contribution.ledgerEntries.reduce((sum, row) => sum + row.pointsDelta, 0);
  if (credited !== contribution.approvedPoints || credited > 25) fail();
  if (credited === 25) {
    if (!account || contribution.status !== "VALIDATED" || !contribution.releasedAt || contribution.availableAt) fail();
    await assertFirstAccountFloor(tx, identity.actorId, account);
    return "historical" as const;
  }
  if (["REJECTED", "IN_REVIEW"].includes(contribution.status) &&
      !(contribution.status === "IN_REVIEW" && contribution.detail.startsWith("native-first-worklog-v1:")))
    return "deferred" as const;
  if (contribution.detail.startsWith("native-first-worklog-v1:")) {
    const originId = contribution.detail.slice("native-first-worklog-v1:".length);
    const origin = await tx.terraqoNativeWorklogOperation.findUnique({ where: { id: originId } });
    if (!origin || origin.actorId !== identity.actorId ||
        origin.createdAt.getTime() !== contribution.createdAt.getTime()) fail();
  }
  if (contribution.releasedAt || contribution.availableAt) fail();
  const ready = await tx.terraqoBuilderAccount.upsert({ where: { userId: identity.actorId }, update: {}, create: { userId: identity.actorId } });
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoBuilderAccount" WHERE id=${ready.id} FOR UPDATE`);
  const locked = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: ready.id } });
  if (locked.userId !== identity.actorId) fail();
  await assertFirstAccountFloor(tx, identity.actorId, locked);
  if (locked.rewardsFrozenUntil && locked.rewardsFrozenUntil > new Date()) return "deferred" as const;
  if (![locked.availablePoints + 25, locked.lifetimeEarned + 25, locked.contributionScore + 25].every(integer)) fail();
  const updated = await tx.terraqoBuilderAccount.update({ where: { id: locked.id }, data: {
    availablePoints: { increment: 25 }, lifetimeEarned: { increment: 25 }, contributionScore: { increment: 25 } } });
  await tx.terraqoBuilderLedger.create({ data: { accountId: ready.id, contributionId: contribution.id,
    type: "CREDIT", pointsDelta: 25, scoreDelta: 25, balanceAfter: updated.availablePoints,
    description: "Primera bitácora profesional", idempotencyKey: `native-first-worklog:${contribution.id}:25` } });
  await tx.terraqoBuilderContribution.update({ where: { id: contribution.id }, data: {
    approvedPoints: 25, status: "VALIDATED", reviewerId: "system", reviewedAt: new Date(), releasedAt: new Date() } });
  return "credited" as const;
}

/** Read under the account UPDATE lock. Retained earned balances must never be silently
 * repaired or consumed by FIRST; ambiguous/oversized history aborts the caller's TX.
 */
async function assertFirstAccountFloor(tx: Prisma.TransactionClient, actorId: string,
  account: { id: string; pendingPoints: number; availablePoints: number; lifetimeEarned: number;
    contributionScore: number; trustScore: number }) {
  if (![account.pendingPoints, account.availablePoints, account.lifetimeEarned,
    account.contributionScore, account.trustScore].every(integer)) fail();
  const retained = await tx.terraqoBuilderContribution.findMany({ where: { userId: actorId,
    releasedAt: null, availableAt: { not: null }, status: { not: "REJECTED" } },
    take: 201, orderBy: { id: "asc" }, include: { ledgerEntries: { take: 201, orderBy: { id: "asc" } } } });
  if (retained.length > 200) fail();
  let floor = 0;
  for (const item of retained) {
    if (!integer(item.approvedPoints) || item.ledgerEntries.length > 200 ||
      item.ledgerEntries.some(row => row.accountId !== account.id || row.redemptionId !== null ||
        row.type !== "CREDIT" || !integer(row.pointsDelta) || row.scoreDelta !== row.pointsDelta)) fail();
    const credited = item.ledgerEntries.reduce((sum, row) => sum + row.pointsDelta, 0);
    if (!integer(credited) || credited > item.approvedPoints) fail();
    floor += item.approvedPoints - credited;
  }
  if (!integer(floor) || account.pendingPoints < floor) fail();
}
