import "server-only";
import { Prisma } from "@prisma/client";
import { NativeWorklogBudget } from "./native-worklog-budget";
import { NativeWorklogOperationError } from "./native-worklog-http";
import { inspectNativeWorkerEligibilityInTransaction } from "./native-worklog-worker-eligibility";
import { inspectNativeLegacyWorklogInventoryInTransaction, selectNativeLegacyReleasesInTransaction } from "./native-worklog-legacy-inventory";
import { applyNativeWorklogAccountingPhasesInTransaction } from "./native-worklog-accounting-phases";

const requiresReview = (inspection: Awaited<ReturnType<typeof inspectNativeLegacyWorklogInventoryInTransaction>>) =>
  !!(inspection.unsupported || inspection.missingReference || inspection.ambiguous || inspection.rejected || inspection.unfunded);

/** One directed bounded batch, never a global dispatcher or completion proof.
 * Caller MUST roll back ALL phases on any exception including post-verification
 * and final budget exhaustion. Selection is derived only from the locked owner
 * inventory, never caller/request IDs. Due backlog, future/frozen awards and
 * incomplete FIRST/native phases retain PENDING; no APPLIED write exists here.
 */
export async function applySelectedNativeAccountingInTransaction(tx: Prisma.TransactionClient,
  operationId: string, budget: NativeWorklogBudget) {
  const eligibility = await inspectNativeWorkerEligibilityInTransaction(tx, operationId, budget);
  if (eligibility.disposition !== "INSPECT_PHASES")
    return Object.freeze({ outcome: "deferred" as const, completionAuthorized: false as const });
  const selected = await selectNativeLegacyReleasesInTransaction(tx, operationId);
  budget.require();
  if (requiresReview(selected.inspection))
    return Object.freeze({ outcome: "review-required" as const, completionAuthorized: false as const });
  const phases = await applyNativeWorklogAccountingPhasesInTransaction(tx, operationId, selected.contributionIds);
  budget.require();
  if (phases.outcome !== "pending")
    return Object.freeze({ outcome: "deferred" as const, completionAuthorized: false as const });
  // Reinspect the whole family after writes, not merely the selected IDs. A
  // deferred/changed release or newly visible due history cannot be hidden by a
  // successful earlier phase. Fail closed and let the caller roll back all writes.
  const after = await inspectNativeLegacyWorklogInventoryInTransaction(tx, operationId);
  if (requiresReview(after) || after.outboxState !== "PENDING" ||
      phases.legacy.length !== selected.contributionIds.length ||
      phases.legacy.some(outcome => outcome !== "released" && outcome !== "historical") ||
      after.due !== selected.inspection.due - selected.contributionIds.length ||
      after.future !== selected.inspection.future || after.frozen !== selected.inspection.frozen)
    throw new NativeWorklogOperationError(503);
  budget.require();
  return Object.freeze({ outcome: "pending" as const, selected: selected.contributionIds.length,
    remainingDue: after.due, future: after.future, frozen: after.frozen,
    completionAuthorized: false as const });
}
