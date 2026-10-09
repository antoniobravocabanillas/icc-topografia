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
  return applySelected(tx, operationId, budget, false);
}

/** Directed settlement only. Completion and all credits share the caller transaction.
 * Deferred phases retain earned balances and are scheduled without consuming attempts.
 * No global worker, retry on exceptions or inference about uncertain commits.
 */
export async function settleSelectedNativeAccountingInTransaction(tx: Prisma.TransactionClient,
  operationId: string, budget: NativeWorklogBudget) {
  return applySelected(tx, operationId, budget, true);
}

async function applySelected(tx: Prisma.TransactionClient, operationId: string,
  budget: NativeWorklogBudget, settle: boolean) {
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
  if (settle) {
    const current = await tx.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId } });
    const complete = after.due === 0 && after.future === 0 && after.frozen === 0 &&
      (phases.first === "credited" || phases.first === "historical" || phases.first === "ineligible") &&
      (phases.release === "released" || phases.release === "historical");
    // FIRST's ineligible outcome requires the locked, durable creation decision;
    // a missing allocation or proof fails closed before this completion write.
    const now = new Date();
    const nextAttemptAt = new Date(Math.max(current.nextAttemptAt.getTime(), now.getTime() + 60000));
    budget.require();
    const changed = await tx.terraqoNativeWorklogAccounting.updateMany({ where: {
      operationId, state: "PENDING", attempts: current.attempts,
      nextAttemptAt: current.nextAttemptAt, completedAt: null },
      data: complete ? { state: "APPLIED", completedAt: now } : { nextAttemptAt } });
    if (changed.count !== 1) throw new NativeWorklogOperationError(503);
    // Failure here MUST roll back completion, every credit and all earlier phases.
    budget.require();
    if (complete) return Object.freeze({ outcome: "applied" as const, completionAuthorized: true as const });
  }
  budget.require();
  return Object.freeze({ outcome: "pending" as const, selected: selected.contributionIds.length,
    remainingDue: after.due, future: after.future, frozen: after.frozen,
    completionAuthorized: false as const });
}
