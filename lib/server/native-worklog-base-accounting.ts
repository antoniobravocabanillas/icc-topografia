import "server-only";
import { Prisma } from "@prisma/client";
import { NativeWorklogOperationError } from "./native-worklog-http";
import { requireNativeWorklogDecision } from "./native-worklog-decision";

function fail(): never { throw new NativeWorklogOperationError(503); }
const integer = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;

/** Directed phase only, within the caller's transaction. No auth/worker, FIRST bonus,
 * release credit or APPLIED transition. The saved decision is never recalculated.
 */
export async function applyNativeWorklogBaseInTransaction(tx: Prisma.TransactionClient, operationId: string) {
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
  await tx.$queryRaw(Prisma.sql`SELECT "operationId" FROM icc."TerraqoNativeWorklogDecision" WHERE "operationId"=${operationId} FOR SHARE`);
  await requireNativeWorklogDecision(tx, receipt);
  const d = await tx.terraqoNativeWorklogDecision.findUniqueOrThrow({ where: { operationId } });
  if (!receipt.worklogId) return "deferred" as const;
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoWorklogEntry" WHERE id=${receipt.worklogId} FOR UPDATE`);
  const entry = await tx.terraqoWorklogEntry.findUnique({ where: { id: receipt.worklogId } });
  if (!entry || entry.deletedAt) return "deferred" as const;
  if (entry.id !== receipt.targetWorklogId || entry.authorId !== receipt.actorId || entry.professionalProfileId !== owner.id ||
      entry.workspaceId !== receipt.workspaceId || entry.contentFingerprint !== d.contentKey ||
      entry.createdAt.getTime() !== d.createdAt.getTime() || ![0, 1].includes(d.tqPoints) || ![0, 1].includes(d.trustScore)) fail();
  const sourceKey = `worklog:${entry.id}`;
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoBuilderContribution" WHERE "sourceKey"=${sourceKey} FOR UPDATE`);
  const prior = await tx.terraqoBuilderContribution.findUnique({ where: { sourceKey } });
  if (prior) {
    if (prior.userId !== receipt.actorId || prior.workspaceId !== receipt.workspaceId || prior.type !== "BETA_PARTICIPATION" ||
        prior.status !== "IN_REVIEW" || prior.requestedPoints !== d.tqPoints || prior.approvedPoints !== d.tqPoints ||
        prior.riskScore !== d.riskScore || prior.createdAt.getTime() !== d.createdAt.getTime() ||
        prior.availableAt?.getTime() !== d.availableAt.getTime() || prior.releasedAt ||
        entry.tqPointsAwarded !== d.tqPoints || entry.trustScoreAwarded !== d.trustScore ||
        entry.qualityScore !== d.qualityScore || entry.moderationStatus !== d.moderationStatus) fail();
    if (await tx.terraqoBuilderLedger.count({ where: { contributionId: prior.id } })) fail();
  }
  if (!prior && (entry.tqPointsAwarded !== 0 || entry.trustScoreAwarded !== 0)) fail();
  const ready = prior ? await tx.terraqoBuilderAccount.findUnique({ where: { userId: receipt.actorId } }) :
    await tx.terraqoBuilderAccount.upsert({ where: { userId: receipt.actorId }, update: {}, create: { userId: receipt.actorId } });
  if (!ready) fail();
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoBuilderAccount" WHERE id=${ready.id} FOR UPDATE`);
  const account = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: ready.id } });
  if (![account.pendingPoints, account.availablePoints, account.lifetimeEarned, account.contributionScore, account.trustScore,
    account.pendingPoints + (prior ? 0 : d.tqPoints), account.trustScore + (prior ? 0 : d.trustScore)].every(integer)) fail();
  // Preserve all retained earned pending balances, including future releases. Ambiguity
  // is investigated rather than repaired by subtracting or inventing points.
  const retained = await tx.terraqoBuilderContribution.findMany({ where: { userId: receipt.actorId,
    releasedAt: null, availableAt: { not: null }, status: { not: "REJECTED" } }, take: 201, orderBy: { id: "asc" },
    include: { ledgerEntries: { take: 201, orderBy: { id: "asc" } } } });
  if (retained.length > 200) fail();
  let floor = 0;
  for (const item of retained) {
    if (!integer(item.approvedPoints) || item.ledgerEntries.length > 200 || item.ledgerEntries.some(row => row.accountId !== account.id ||
      row.redemptionId !== null || row.type !== "CREDIT" || !integer(row.pointsDelta) || row.scoreDelta !== row.pointsDelta)) fail();
    const credited = item.ledgerEntries.reduce((sum, row) => sum + row.pointsDelta, 0);
    if (!integer(credited) || credited > item.approvedPoints) fail();
    floor += item.approvedPoints - credited;
  }
  if (!integer(floor) || account.pendingPoints < floor) fail();
  if (prior) return "historical" as const;
  await tx.terraqoBuilderAccount.update({ where: { id: account.id }, data: {
    pendingPoints: { increment: d.tqPoints }, trustScore: { increment: d.trustScore } } });
  await tx.terraqoBuilderContribution.create({ data: { userId: receipt.actorId, workspaceId: receipt.workspaceId,
    sourceKey, type: "BETA_PARTICIPATION", status: "IN_REVIEW", title: "Bitácora profesional documentada",
    detail: "Asignación de una bitácora declarada; puntos sujetos a su período de disponibilidad.",
    requestedPoints: d.tqPoints, approvedPoints: d.tqPoints, riskScore: d.riskScore, availableAt: d.availableAt, createdAt: d.createdAt } });
  await tx.terraqoWorklogEntry.update({ where: { id: entry.id }, data: { tqPointsAwarded: d.tqPoints,
    trustScoreAwarded: d.trustScore, qualityScore: d.qualityScore, moderationStatus: d.moderationStatus } });
  return "allocated" as const;
}
