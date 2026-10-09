import "server-only";
import { Prisma } from "@prisma/client";
import { NativeWorklogBudget } from "./native-worklog-budget";
import { inspectNativeWorkerEligibilityInTransaction } from "./native-worklog-worker-eligibility";
import { applyNativeWorklogAccountingPhasesInTransaction } from "./native-worklog-accounting-phases";

/** Directed internal settlement preparation from saved creation authority.
 * Caller owns the transaction and MUST roll back every phase on any exception,
 * including the final budget check. No expired session reconstruction, grants,
 * global selection, retry persistence or APPLIED write. Explicit legacy IDs are
 * only a bounded phase selection; they do not prove exhaustive reconciliation.
 */
export async function applyHistoricalNativeAccountingInTransaction(tx: Prisma.TransactionClient,
  operationId: string, budget: NativeWorklogBudget, legacyContributionIds: readonly string[] = []) {
  const eligibility = await inspectNativeWorkerEligibilityInTransaction(tx, operationId, budget);
  if (eligibility.disposition !== "INSPECT_PHASES")
    return Object.freeze({ outcome: "deferred" as const, disposition: eligibility.disposition,
      completionAuthorized: false as const });
  const phases = await applyNativeWorklogAccountingPhasesInTransaction(tx, operationId, legacyContributionIds);
  budget.require();
  return Object.freeze({ outcome: "pending" as const, phases, completionAuthorized: false as const });
}
