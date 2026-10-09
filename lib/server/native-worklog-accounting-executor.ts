import "server-only";
import type { PrismaClient } from "@prisma/client";
import { NativeWorklogBudget } from "./native-worklog-budget";
import { NativeWorklogOperationError } from "./native-worklog-http";
import { quarantineNativeAccountingReviewInTransaction } from "./native-worklog-accounting-review";
import { settleSelectedNativeAccountingInTransaction } from "./native-worklog-selected-accounting";
import { reconcileNativeAccountingAcknowledgementInTransaction } from "./native-worklog-accounting-acknowledgement";
import { assertNativeWorklogSchemaInTransaction } from "./native-worklog-schema-gate";

type Outcome = "applied" | "applied-history" | "quarantined" | "pending" | "not-due" | "budget-deferred" | "uncertain";
const result = (outcome: Outcome) => Object.freeze({ outcome, retryAuthorized: false as const,
  ownerAccessAuthorized: false as const });
const options = { maxWait: 1000, timeout: 7000 };

/** Internal directed executor; no route, scheduler, global selection or user token.
 * Budget must be created by the trusted caller BEFORE beginning this operation.
 * Primary review, credits and completion share one transaction.
 * Both transactions require the exact schema
 * before touching accounting state; there is no caller-supplied gate bypass.
 * A rejected primary remains acknowledgement uncertainty: reconcile in a new
 * transaction without replaying phases or charging an attempt. PENDING is then
 * quarantined for review; APPLIED is retained. Transient auto-retry is deliberately
 * unavailable until a separate protocol can positively establish prior rollback.
 */
export async function executeNativeAccounting(database: Pick<PrismaClient, "$transaction">,
  operationId: string, budget: NativeWorklogBudget) {
  if (!/^[a-f0-9]{64}$/.test(operationId)) throw new NativeWorklogOperationError(503);
  try { budget.require(16000); } catch { return result("budget-deferred"); }
  try {
    return await database.$transaction(async tx => {
      budget.require();
      await assertNativeWorklogSchemaInTransaction(tx, budget);
      const review = await quarantineNativeAccountingReviewInTransaction(tx, operationId, budget);
      if (review.outcome === "quarantined") return result("quarantined");
      if (review.outcome === "unchanged") {
        const current = await tx.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId } });
        budget.require();
        return result(current.state === "APPLIED" ? "applied-history" : current.state === "QUARANTINED" ? "quarantined" : "not-due");
      }
      const settled = await settleSelectedNativeAccountingInTransaction(tx, operationId, budget);
      budget.require();
      if (settled.outcome === "applied") return result("applied");
      if (settled.outcome === "pending") return result("pending");
      // Review/settlement retain the same owner locks. A changed invariant must
      // roll back every preceding phase, not be treated as successful deferral.
      throw new NativeWorklogOperationError(503);
    }, options);
  } catch {
    // No Promise.race around SQL: never leave an abandoned callback that may commit.
    // If transport stalls, maxWait/timeout are not claimed as a hard driver deadline.
    try { budget.require(8000); } catch { return result("uncertain"); }
    try {
      return await database.$transaction(async tx => {
        budget.require();
        // Recovery also fails closed on schema drift; never quarantine or infer
        // rollback using a catalog that no longer matches the accounting contract.
        await assertNativeWorklogSchemaInTransaction(tx, budget);
        const observed = await reconcileNativeAccountingAcknowledgementInTransaction(tx, operationId, budget);
        budget.require();
        return result(observed.outcome === "applied-history" ? "applied-history" : "quarantined");
      }, options);
    } catch { return result("uncertain"); }
  }
}
