import "server-only";
import { Prisma, type TerraqoNativeWorklogOperation } from "@prisma/client";
import type { parseNativeWorklogPayload } from "./native-worklog-payload";
import { decideNativeDeclaredWorklog } from "./native-worklog-base-decision";
import { nativeWorklogContentKey } from "./native-worklog-content-key";
import { NativeWorklogOperationError } from "./native-worklog-http";
type Parsed = Awaited<ReturnType<typeof parseNativeWorklogPayload>>;
const fail = (): never => { throw new NativeWorklogOperationError(503); };
/** Caller holds owner FOR UPDATE. All durable allocations count, including pending,
 * quarantined and deleted targets. No account, ledger or provider writes here. */
export async function planNativeWorklogDecision(tx: Prisma.TransactionClient, actorId: string, parsed: Parsed, stamp: Date) {
  const [broken] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT o.id FROM icc."TerraqoNativeWorklogOperation" o
    LEFT JOIN icc."TerraqoNativeWorklogDecision" d ON d."operationId"=o.id
    LEFT JOIN icc."TerraqoNativeWorklogAccounting" a ON a."operationId"=o.id
    LEFT JOIN icc."TerraqoNativeWorklogAuthority" proof ON proof."operationId"=o.id
    LEFT JOIN icc."TerraqoNativeWorklogFirstDecision" firstproof ON firstproof."operationId"=o.id
    WHERE o."actorId"=${actorId} AND (d."operationId" IS NULL OR a."operationId" IS NULL OR proof."operationId" IS NULL OR firstproof."operationId" IS NULL OR o."createdAt">${stamp}) LIMIT 1`);
  if (broken) fail();
  const contentKey = nativeWorklogContentKey(parsed.payload);
  const periods = decideNativeDeclaredWorklog(parsed, stamp.toISOString(), { priorDuplicates: 0, rewardedInDay: 0, trustedInWindow: 0 });
  const [counts] = await tx.$queryRaw<{ duplicate: bigint; daily: bigint; weekly: bigint }[]>(Prisma.sql`SELECT
    (SELECT count(*) FROM icc."TerraqoNativeWorklogDecision" d JOIN icc."TerraqoNativeWorklogOperation" o ON o.id=d."operationId"
     WHERE o."actorId"=${actorId} AND d."contentKey"=${contentKey}) +
    (SELECT count(*) FROM icc."TerraqoWorklogEntry" e WHERE e."authorId"=${actorId}
     AND e."contentFingerprint"=${contentKey} AND e."deletedAt" IS NULL
     AND NOT EXISTS (SELECT 1 FROM icc."TerraqoNativeWorklogOperation" o WHERE o."targetWorklogId"=e.id)) AS duplicate,
    (SELECT count(*) FROM icc."TerraqoNativeWorklogDecision" d JOIN icc."TerraqoNativeWorklogOperation" o ON o.id=d."operationId"
     WHERE o."actorId"=${actorId} AND d."createdAt">=${new Date(periods.dayStart)} AND d."createdAt"<${new Date(periods.dayEndExclusive)} AND d."tqPoints">0) +
    (SELECT count(*) FROM icc."TerraqoWorklogEntry" e WHERE e."authorId"=${actorId}
     AND e."createdAt">=${new Date(periods.dayStart)} AND e."createdAt"<${new Date(periods.dayEndExclusive)} AND e."tqPointsAwarded">0
     AND NOT EXISTS (SELECT 1 FROM icc."TerraqoNativeWorklogOperation" o WHERE o."targetWorklogId"=e.id)) AS daily,
    (SELECT count(*) FROM icc."TerraqoNativeWorklogDecision" d JOIN icc."TerraqoNativeWorklogOperation" o ON o.id=d."operationId"
     WHERE o."actorId"=${actorId} AND d."createdAt">=${new Date(periods.trustStartInclusive)} AND d."createdAt"<=${stamp} AND d."trustScore">0) +
    (SELECT count(*) FROM icc."TerraqoWorklogEntry" e WHERE e."authorId"=${actorId}
     AND e."createdAt">=${new Date(periods.trustStartInclusive)} AND e."createdAt"<=${stamp} AND e."trustScoreAwarded">0
     AND NOT EXISTS (SELECT 1 FROM icc."TerraqoNativeWorklogOperation" o WHERE o."targetWorklogId"=e.id)) AS weekly`);
  if (!counts) fail();
  return { contentKey, decision: decideNativeDeclaredWorklog(parsed, stamp.toISOString(), {
    priorDuplicates: Number(counts.duplicate), rewardedInDay: Number(counts.daily), trustedInWindow: Number(counts.weekly),
  }) };
}
export async function saveNativeWorklogDecision(tx: Prisma.TransactionClient, operationId: string,
  plan: Awaited<ReturnType<typeof planNativeWorklogDecision>>) {
  const d = plan.decision;
  await tx.terraqoNativeWorklogDecision.create({ data: {
    operationId, contentKey: plan.contentKey, policyVersion: d.policyVersion, fingerprint: d.fingerprint,
    createdAt: new Date(d.createdAt), dayStart: new Date(d.dayStart), dayEndExclusive: new Date(d.dayEndExclusive),
    trustStartInclusive: new Date(d.trustStartInclusive), trustEndInclusive: new Date(d.trustEndInclusive), availableAt: new Date(d.availableAt),
    priorDuplicates: d.priorDuplicates, rewardedInDay: d.rewardedInDay, trustedInWindow: d.trustedInWindow,
    tqPoints: d.tqPoints, trustScore: d.trustScore, qualityScore: d.qualityScore, moderationStatus: d.moderationStatus, riskScore: d.riskScore,
  } });
}
/** Replay/GET reads the saved decision; never re-evaluate counters or award. */
export async function requireNativeWorklogDecision(tx: Prisma.TransactionClient, receipt: TerraqoNativeWorklogOperation) {
  const d = await tx.terraqoNativeWorklogDecision.findUnique({ where: { operationId: receipt.id } });
  if (!d || d.fingerprint !== receipt.fingerprint || d.createdAt.getTime() !== receipt.createdAt.getTime() ||
      d.policyVersion !== "native-declared-lima-v1" || !/^[a-f0-9]{64}$/.test(d.contentKey)) fail();
}
