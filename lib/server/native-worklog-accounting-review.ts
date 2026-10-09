import "server-only";
import { Prisma } from "@prisma/client";
import { NativeWorklogBudget } from "./native-worklog-budget";
import { NativeWorklogOperationError } from "./native-worklog-http";
import { inspectNativeWorkerEligibilityInTransaction } from "./native-worklog-worker-eligibility";
import { inspectNativeLegacyWorklogInventoryInTransaction } from "./native-worklog-legacy-inventory";

/** Directed review only: never executes credit phases or infers rollback of another
 * transaction. Caller MUST roll back this entire transaction on any exception,
 * including the final budget check after the quarantine write. Saved creation
 * authority is historical evidence, never renewed owner access. No auto-recovery.
 */
export async function quarantineNativeAccountingReviewInTransaction(tx: Prisma.TransactionClient,
  operationId: string, budget: NativeWorklogBudget) {
  const eligibility = await inspectNativeWorkerEligibilityInTransaction(tx, operationId, budget);
  if (eligibility.disposition === "TERMINAL" || eligibility.disposition === "NOT_DUE")
    return Object.freeze({ outcome: "unchanged" as const, completionAuthorized: false as const });
  let review = eligibility.disposition === "REVIEW_REQUIRED" || eligibility.disposition === "TARGET_MISSING";
  if (!review) {
    const inspection = await inspectNativeLegacyWorklogInventoryInTransaction(tx, operationId);
    review = !!(inspection.unsupported || inspection.missingReference || inspection.ambiguous ||
      inspection.rejected || inspection.unfunded);
  }
  budget.require();
  if (!review) return Object.freeze({ outcome: "inspection-only" as const, completionAuthorized: false as const });
  // Eligibility already owns the profile/outbox locks and validates both saved
  // proofs. CAS protects against accidental reuse outside that locked snapshot.
  const current = await tx.terraqoNativeWorklogAccounting.findUnique({ where: { operationId },
    select: { state: true, attempts: true, nextAttemptAt: true, completedAt: true } });
  if (!current || current.state !== "PENDING" || current.completedAt !== null)
    throw new NativeWorklogOperationError(503);
  const changed = await tx.terraqoNativeWorklogAccounting.updateMany({ where: { operationId,
    state: "PENDING", attempts: current.attempts, nextAttemptAt: current.nextAttemptAt, completedAt: null },
    data: { state: "QUARANTINED" } });
  if (changed.count !== 1) throw new NativeWorklogOperationError(503);
  budget.require();
  return Object.freeze({ outcome: "quarantined" as const, completionAuthorized: false as const });
}
