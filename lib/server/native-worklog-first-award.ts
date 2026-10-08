import "server-only";
import { Prisma } from "@prisma/client";
import { NativeWorklogOperationError } from "./native-worklog-http";

function fail(): never { throw new NativeWorklogOperationError(503); }
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
    include: { ledgerEntries: true } });
  if (!contribution) return "ineligible" as const;
  if (contribution.userId !== identity.actorId || contribution.type !== "FIRST_WORKLOG" ||
      contribution.requestedPoints !== 25 || ![0, 25].includes(contribution.approvedPoints)) fail();
  const account = await tx.terraqoBuilderAccount.findUnique({ where: { userId: identity.actorId } });
  // A foreign or ambiguous ledger never authorizes a compensating/new credit.
  if (contribution.ledgerEntries.some(row => !account || row.accountId !== account.id ||
      row.redemptionId !== null || row.type !== "CREDIT" || row.pointsDelta !== 25 || row.scoreDelta !== 25)) fail();
  const credited = contribution.ledgerEntries.reduce((sum, row) => sum + row.pointsDelta, 0);
  if (credited !== contribution.approvedPoints || credited > 25) fail();
  if (credited === 25) return "historical" as const;
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
  const updated = await tx.terraqoBuilderAccount.update({ where: { id: ready.id }, data: {
    availablePoints: { increment: 25 }, lifetimeEarned: { increment: 25 }, contributionScore: { increment: 25 } } });
  await tx.terraqoBuilderLedger.create({ data: { accountId: ready.id, contributionId: contribution.id,
    type: "CREDIT", pointsDelta: 25, scoreDelta: 25, balanceAfter: updated.availablePoints,
    description: "Primera bitácora profesional", idempotencyKey: `native-first-worklog:${contribution.id}:25` } });
  await tx.terraqoBuilderContribution.update({ where: { id: contribution.id }, data: {
    approvedPoints: 25, status: "VALIDATED", reviewerId: "system", reviewedAt: new Date(), releasedAt: new Date() } });
  return "credited" as const;
}
