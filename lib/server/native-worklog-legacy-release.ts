import "server-only";
import { Prisma } from "@prisma/client";
import { NativeWorklogOperationError } from "./native-worklog-http";

function fail(): never { throw new NativeWorklogOperationError(503); }
const integer = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 2147483647;

/** Targeted accounting phase only. Caller must commit/rollback the whole transaction and
 * retry serialization failures from a new transaction. No auth policy, scheduler or APPLIED transition.
 * Preserve earned legacy pending points; never infer a new award from worklog content.
 */
export async function reconcileNativeLegacyReleaseInTransaction(tx: Prisma.TransactionClient,
  operationId: string, contributionId: string) {
  if (!/^[a-f0-9]{64}$/.test(operationId) || !/^[a-z0-9]{25}$/.test(contributionId)) fail();
  const identity = await tx.terraqoNativeWorklogOperation.findUnique({ where: { id: operationId } });
  if (!identity) fail();
  const [owner] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile"
    WHERE id=${identity.professionalProfileId} AND "userId"=${identity.actorId} FOR UPDATE`);
  if (!owner) fail();
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoNativeWorklogOperation" WHERE id=${operationId} FOR UPDATE`);
  const [outbox] = await tx.$queryRaw<{ state: string }[]>(Prisma.sql`SELECT state FROM icc."TerraqoNativeWorklogAccounting"
    WHERE "operationId"=${operationId} FOR UPDATE`);
  if (!outbox) fail();
  if (outbox.state !== "PENDING") return "deferred" as const;
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoBuilderContribution" WHERE id=${contributionId}
    AND "userId"=${identity.actorId} FOR UPDATE`);
  const contribution = await tx.terraqoBuilderContribution.findUnique({ where: { id: contributionId } });
  if (!contribution || contribution.userId !== identity.actorId || contribution.type !== "BETA_PARTICIPATION" ||
      !contribution.sourceKey?.startsWith("worklog:")) fail();
  const worklogId = contribution.sourceKey.slice("worklog:".length);
  const [worklog] = await tx.$queryRaw<{ createdAt: Date; tqPointsAwarded: number }[]>(Prisma.sql`
    SELECT "createdAt", "tqPointsAwarded" FROM icc."TerraqoWorklogEntry" WHERE id=${worklogId}
    AND "authorId"=${identity.actorId} AND "professionalProfileId"=${owner.id} FOR SHARE`);
  const firstNative = await tx.terraqoNativeWorklogOperation.findFirst({ where: { actorId: identity.actorId }, orderBy: { createdAt: "asc" } });
  if (!worklog || !firstNative || worklog.createdAt > firstNative.createdAt || contribution.createdAt > firstNative.createdAt ||
      await tx.terraqoNativeWorklogOperation.count({ where: { targetWorklogId: worklogId } })) fail();
  // Rejected/unfunded decisions are preserved for investigation, never re-approved here.
  if (contribution.status === "REJECTED" || !contribution.availableAt) return "deferred" as const;
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoBuilderAccount" WHERE "userId"=${identity.actorId} FOR UPDATE`);
  const account = await tx.terraqoBuilderAccount.findUnique({ where: { userId: identity.actorId } });
  if (!account || !integer(account.pendingPoints) || !integer(account.availablePoints) ||
      !integer(account.lifetimeEarned) || !integer(account.contributionScore)) fail();
  const now = new Date();
  if (contribution.availableAt > now || (account.rewardsFrozenUntil && account.rewardsFrozenUntil > now)) return "deferred" as const;
  const credits = await tx.terraqoBuilderLedger.findMany({ where: { contributionId }, take: 201, orderBy: { id: "asc" } });
  if (credits.length > 200 || credits.some(row => row.accountId !== account.id || row.redemptionId !== null || row.type !== "CREDIT" ||
      !integer(row.pointsDelta) || row.pointsDelta === 0 || row.scoreDelta !== row.pointsDelta)) fail();
  const credited = credits.reduce((sum, row) => sum + row.pointsDelta, 0);
  if (!integer(contribution.approvedPoints) || !integer(credited) || credited > contribution.approvedPoints ||
      worklog.tqPointsAwarded !== contribution.approvedPoints) fail();
  if (contribution.releasedAt) {
    if (credited !== contribution.approvedPoints) fail();
    return "historical" as const;
  }
  const amount = contribution.approvedPoints - credited;
  // Account lock protects the balance. Bound inspection, fail closed on backlog/ambiguous floors.
  const retained = await tx.terraqoBuilderContribution.findMany({ where: { userId: identity.actorId,
    releasedAt: null, availableAt: { not: null }, status: { not: "REJECTED" } },
    include: { ledgerEntries: { take: 201, orderBy: { id: "asc" } } }, take: 201, orderBy: { id: "asc" } });
  if (retained.length > 200) fail();
  let floor = 0;
  for (const item of retained) {
    if (item.ledgerEntries.length > 200 || !integer(item.approvedPoints) || item.ledgerEntries.some(row => row.accountId !== account.id ||
        row.type !== "CREDIT" || row.redemptionId !== null || !integer(row.pointsDelta) || row.scoreDelta !== row.pointsDelta)) fail();
    const released = item.ledgerEntries.reduce((sum, row) => sum + row.pointsDelta, 0);
    if (!integer(released) || released > item.approvedPoints) fail();
    floor += item.approvedPoints - released;
  }
  if (!integer(floor) || account.pendingPoints < floor || account.pendingPoints < amount ||
      !integer(account.availablePoints + amount) || !integer(account.lifetimeEarned + amount) ||
      !integer(account.contributionScore + amount)) fail();
  if (amount) {
    const updated = await tx.terraqoBuilderAccount.update({ where: { id: account.id }, data: {
      pendingPoints: { decrement: amount }, availablePoints: { increment: amount },
      lifetimeEarned: { increment: amount }, contributionScore: { increment: amount } } });
    await tx.terraqoBuilderLedger.create({ data: { accountId: account.id, contributionId, type: "CREDIT",
      pointsDelta: amount, scoreDelta: amount, balanceAfter: updated.availablePoints,
      description: "Puntos de bitácora liberados", idempotencyKey: `release:${contributionId}:${contribution.approvedPoints}` } });
  }
  await tx.terraqoBuilderContribution.update({ where: { id: contributionId }, data: { releasedAt: now } });
  return amount ? "released" as const : "historical" as const;
}
