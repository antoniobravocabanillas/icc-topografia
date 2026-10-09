import "server-only";
import { Prisma } from "@prisma/client";
import { NativeWorklogBudget } from "./native-worklog-budget";
import { NativeWorklogOperationError } from "./native-worklog-http";
import { inspectNativeWorkerEligibilityInTransaction } from "./native-worklog-worker-eligibility";

/** An unknown acknowledgement is never proof of rollback. Lock and observe durable
 * state with historical creation proofs before doing anything. APPLIED is retained;
 * PENDING is quarantined without replaying phases, charging attempts or touching
 * earned balances. Caller must roll back this whole transaction on any exception.
 */
export async function reconcileNativeAccountingAcknowledgementInTransaction(
  tx: Prisma.TransactionClient, operationId: string, budget: NativeWorklogBudget) {
  await inspectNativeWorkerEligibilityInTransaction(tx, operationId, budget);
  const current = await tx.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId } });
  if (current.state !== "PENDING") {
    budget.require();
    return Object.freeze({ outcome: current.state === "APPLIED" ? "applied-history" as const : "quarantined" as const,
      replayAuthorized: false as const });
  }
  budget.require();
  const changed = await tx.terraqoNativeWorklogAccounting.updateMany({ where: {
    operationId, state: "PENDING", attempts: current.attempts,
    nextAttemptAt: current.nextAttemptAt, completedAt: null }, data: { state: "QUARANTINED" } });
  if (changed.count !== 1) throw new NativeWorklogOperationError(503);
  budget.require();
  return Object.freeze({ outcome: "quarantined" as const, replayAuthorized: false as const });
}
