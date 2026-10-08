import "server-only";
import { Prisma } from "@prisma/client";
import { NativeWorklogOperationError } from "./native-worklog-http";
import { requireNativeWorklogDecision } from "./native-worklog-decision";
import { planNativeAccountingRetry, type NativeAccountingRetrySnapshot,
  type NativeAccountingRetryEvent } from "./native-worklog-accounting-retry-policy";

function fail(): never { throw new NativeWorklogOperationError(503); }

/** Internal directed outbox transition only; no worker, authorization or points.
 * Caller MUST first establish that its failed accounting transaction rolled back.
 * Unknown commits require reconciliation, not an assumed rollback or another award.
 * The expected snapshot identifies one observed failure; replay after persistence
 * is stale and cannot consume another attempt. Caller owns this entire transaction.
 */
export async function persistNativeAccountingRetryInTransaction(tx: Prisma.TransactionClient,
  operationId: string, expected: NativeAccountingRetrySnapshot, event: NativeAccountingRetryEvent) {
  if (!/^[a-f0-9]{64}$/.test(operationId)) fail();
  // Validate internal inputs without SQL side effects; plan again after waiting for locks.
  planNativeAccountingRetry(expected, event, new Date().toISOString());
  const identity = await tx.terraqoNativeWorklogOperation.findUnique({ where: { id: operationId } });
  if (!identity) fail();
  const [owner] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile"
    WHERE id=${identity.professionalProfileId} AND "userId"=${identity.actorId} FOR UPDATE`);
  if (!owner) fail();
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoNativeWorklogOperation" WHERE id=${operationId} FOR SHARE`);
  const receipt = await tx.terraqoNativeWorklogOperation.findUniqueOrThrow({ where: { id: operationId } });
  if (receipt.actorId !== identity.actorId || receipt.professionalProfileId !== owner.id) fail();
  await tx.$queryRaw(Prisma.sql`SELECT "operationId" FROM icc."TerraqoNativeWorklogAccounting"
    WHERE "operationId"=${operationId} FOR UPDATE`);
  const current = await tx.terraqoNativeWorklogAccounting.findUnique({ where: { operationId },
    select: { state: true, attempts: true, nextAttemptAt: true, completedAt: true } });
  if (!current) fail();
  await tx.$queryRaw(Prisma.sql`SELECT "operationId" FROM icc."TerraqoNativeWorklogDecision"
    WHERE "operationId"=${operationId} FOR SHARE`);
  await requireNativeWorklogDecision(tx, receipt);
  const snapshot: NativeAccountingRetrySnapshot = { state: current.state as NativeAccountingRetrySnapshot["state"],
    attempts: current.attempts, nextAttemptAt: current.nextAttemptAt.toISOString(),
    completedAt: current.completedAt?.toISOString() ?? null };
  const plan = planNativeAccountingRetry(snapshot, event, new Date().toISOString());
  if (snapshot.state !== expected.state || snapshot.attempts !== expected.attempts ||
      snapshot.nextAttemptAt !== expected.nextAttemptAt || snapshot.completedAt !== expected.completedAt)
    return Object.freeze({ outcome: "stale" as const, completionAuthorized: false as const });
  if (plan.action === "UNCHANGED") return Object.freeze({ outcome: "unchanged" as const, plan });
  // Defense in depth: this transition can never write APPLIED or completedAt.
  const changed = await tx.terraqoNativeWorklogAccounting.updateMany({ where: { operationId, state: "PENDING",
    attempts: current.attempts, nextAttemptAt: current.nextAttemptAt, completedAt: null },
    data: { state: plan.state, attempts: plan.attempts, nextAttemptAt: new Date(plan.nextAttemptAt) } });
  if (changed.count !== 1) fail();
  return Object.freeze({ outcome: "persisted" as const, plan });
}
