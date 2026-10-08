import "server-only";
import { Prisma } from "@prisma/client";
import { NativeWorklogOperationError } from "./native-worklog-http";
import { requireNativeWorklogDecision } from "./native-worklog-decision";

function fail(): never { throw new NativeWorklogOperationError(503); }
const integer = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;

/** Directed phase only. Caller owns the transaction and must roll back every failure.
 * No grant policy, worker, FIRST award or APPLIED transition. Missing references remain
 * deferred for reconciliation; earned pending points are never discarded or recreated.
 */
export async function releaseNativeWorklogBaseInTransaction(tx: Prisma.TransactionClient, operationId: string) {
  if (!/^[a-f0-9]{64}$/.test(operationId)) fail();
  const receipt = await tx.terraqoNativeWorklogOperation.findUnique({ where: { id: operationId } });
  if (!receipt) fail();
  const [owner] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile"
    WHERE id=${receipt.professionalProfileId} AND "userId"=${receipt.actorId} FOR UPDATE`);
  if (!owner) fail();
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoNativeWorklogOperation" WHERE id=${operationId} FOR UPDATE`);
  const [outbox] = await tx.$queryRaw<{ state: string }[]>(Prisma.sql`SELECT state FROM icc."TerraqoNativeWorklogAccounting"
    WHERE "operationId"=${operationId} FOR UPDATE`);
  if (!outbox) fail();
  if (outbox.state !== "PENDING") return "deferred" as const;
  await tx.$queryRaw(Prisma.sql`SELECT "operationId" FROM icc."TerraqoNativeWorklogDecision"
    WHERE "operationId"=${operationId} FOR SHARE`);
  await requireNativeWorklogDecision(tx, receipt);
  const d = await tx.terraqoNativeWorklogDecision.findUniqueOrThrow({ where: { operationId } });
  if (!receipt.worklogId) return "deferred" as const;
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoWorklogEntry" WHERE id=${receipt.worklogId} FOR UPDATE`);
  const entry = await tx.terraqoWorklogEntry.findUnique({ where: { id: receipt.worklogId } });
  if (!entry || entry.deletedAt) return "deferred" as const;
  if (entry.id !== receipt.targetWorklogId || entry.authorId !== receipt.actorId ||
      entry.professionalProfileId !== owner.id || entry.workspaceId !== receipt.workspaceId ||
      entry.contentFingerprint !== d.contentKey || entry.createdAt.getTime() !== d.createdAt.getTime() ||
      entry.tqPointsAwarded !== d.tqPoints || entry.trustScoreAwarded !== d.trustScore ||
      entry.qualityScore !== d.qualityScore || entry.moderationStatus !== d.moderationStatus ||
      ![0, 1].includes(d.tqPoints) || ![0, 1].includes(d.trustScore) ||
      d.availableAt.getTime() !== d.createdAt.getTime() + 7 * 86400000) fail();
  const sourceKey = `worklog:${receipt.targetWorklogId}`;
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoBuilderContribution" WHERE "sourceKey"=${sourceKey} FOR UPDATE`);
  const c = await tx.terraqoBuilderContribution.findUnique({ where: { sourceKey } });
  if (!c) return "deferred" as const;
  if (c.userId !== receipt.actorId || c.workspaceId !== receipt.workspaceId || c.type !== "BETA_PARTICIPATION" ||
      c.status !== "IN_REVIEW" || c.requestedPoints !== d.tqPoints || c.approvedPoints !== d.tqPoints ||
      c.riskScore !== d.riskScore || c.createdAt.getTime() !== d.createdAt.getTime() ||
      c.availableAt?.getTime() !== d.availableAt.getTime()) fail();
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoBuilderAccount" WHERE "userId"=${receipt.actorId} FOR UPDATE`);
  const account = await tx.terraqoBuilderAccount.findUnique({ where: { userId: receipt.actorId } });
  if (!account || ![account.pendingPoints, account.availablePoints, account.lifetimeEarned,
    account.contributionScore, account.trustScore].every(integer)) fail();
  const key = `native-worklog-base:${operationId}:${d.tqPoints}`;
  const credits = await tx.terraqoBuilderLedger.findMany({ where: { contributionId: c.id }, take: 2, orderBy: { id: "asc" } });
  if (credits.length > 1 || credits.some(row => row.accountId !== account.id || row.contributionId !== c.id ||
      row.redemptionId !== null || row.type !== "CREDIT" || row.pointsDelta !== d.tqPoints ||
      row.pointsDelta === 0 || row.scoreDelta !== row.pointsDelta || row.idempotencyKey !== key)) fail();
  const credited = credits[0]?.pointsDelta ?? 0;
  if (c.releasedAt) {
    if (credited !== d.tqPoints) fail();
    return "historical" as const;
  }
  // A committed credit without its atomic releasedAt is ambiguous; do not credit again.
  if (credits.length) fail();
  const now = new Date();
  if (d.availableAt > now || (account.rewardsFrozenUntil && account.rewardsFrozenUntil > now)) return "deferred" as const;
  const retained = await tx.terraqoBuilderContribution.findMany({ where: { userId: receipt.actorId,
    releasedAt: null, availableAt: { not: null }, status: { not: "REJECTED" } }, take: 201, orderBy: { id: "asc" },
    include: { ledgerEntries: { take: 201, orderBy: { id: "asc" } } } });
  if (retained.length > 200) fail();
  let floor = 0;
  for (const item of retained) {
    if (!integer(item.approvedPoints) || item.ledgerEntries.length > 200 || item.ledgerEntries.some(row =>
      row.accountId !== account.id || row.redemptionId !== null || row.type !== "CREDIT" ||
      !integer(row.pointsDelta) || row.scoreDelta !== row.pointsDelta)) fail();
    const amount = item.ledgerEntries.reduce((sum, row) => sum + row.pointsDelta, 0);
    if (!integer(amount) || amount > item.approvedPoints) fail();
    floor += item.approvedPoints - amount;
  }
  if (!integer(floor) || account.pendingPoints < floor || account.pendingPoints < d.tqPoints ||
      ![account.availablePoints + d.tqPoints, account.lifetimeEarned + d.tqPoints,
        account.contributionScore + d.tqPoints].every(integer)) fail();
  if (d.tqPoints) {
    const updated = await tx.terraqoBuilderAccount.update({ where: { id: account.id }, data: {
      pendingPoints: { decrement: d.tqPoints }, availablePoints: { increment: d.tqPoints },
      lifetimeEarned: { increment: d.tqPoints }, contributionScore: { increment: d.tqPoints } } });
    await tx.terraqoBuilderLedger.create({ data: { accountId: account.id, contributionId: c.id, type: "CREDIT",
      pointsDelta: d.tqPoints, scoreDelta: d.tqPoints, balanceAfter: updated.availablePoints,
      description: "Puntos de bitácora liberados", idempotencyKey: key } });
  }
  await tx.terraqoBuilderContribution.update({ where: { id: c.id }, data: { releasedAt: now } });
  return "released" as const;
}
