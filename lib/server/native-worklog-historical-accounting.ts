import "server-only";
import { Prisma } from "@prisma/client";
import { NativeWorklogBudget } from "./native-worklog-budget";
import { inspectNativeWorkerEligibilityInTransaction } from "./native-worklog-worker-eligibility";
import { applyNativeWorklogAccountingPhasesInTransaction } from "./native-worklog-accounting-phases";
import { inspectNativeLegacyWorklogInventoryInTransaction } from "./native-worklog-legacy-inventory";

/** Directed internal settlement preparation from saved creation authority.
 * Caller owns the transaction and MUST roll back every phase on any exception,
 * including the final budget check. No expired session reconstruction, grants,
 * global selection, retry persistence or APPLIED write. Inspect the whole bounded
 * legacy family before credits: omitted broken references or ambiguous history must
 * not be hidden by an explicit selection. Inspection is not exhaustive settlement.
 */
export async function applyHistoricalNativeAccountingInTransaction(tx: Prisma.TransactionClient,
  operationId: string, budget: NativeWorklogBudget, legacyContributionIds: readonly string[] = []) {
  const eligibility = await inspectNativeWorkerEligibilityInTransaction(tx, operationId, budget);
  if (eligibility.disposition !== "INSPECT_PHASES")
    return Object.freeze({ outcome: "deferred" as const, disposition: eligibility.disposition,
      completionAuthorized: false as const });
  const legacyInspection = await inspectNativeLegacyWorklogInventoryInTransaction(tx, operationId);
  budget.require();
  if (legacyInspection.unsupported || legacyInspection.missingReference || legacyInspection.ambiguous ||
      legacyInspection.rejected || legacyInspection.unfunded)
    return Object.freeze({ outcome: "review-required" as const, legacyInspection,
      completionAuthorized: false as const });
  const phases = await applyNativeWorklogAccountingPhasesInTransaction(tx, operationId, legacyContributionIds);
  budget.require();
  return Object.freeze({ outcome: "pending" as const, phases, legacyInspection, completionAuthorized: false as const });
}
