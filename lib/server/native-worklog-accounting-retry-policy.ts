import "server-only";
import { NativeWorklogOperationError } from "./native-worklog-http";

type State = "PENDING" | "APPLIED" | "QUARANTINED";
export type NativeAccountingRetrySnapshot = Readonly<{
  state: State;
  attempts: number;
  nextAttemptAt: string;
  completedAt: string | null;
}>;
export type NativeAccountingRetryEvent =
  | Readonly<{ kind: "TRANSIENT_FAILURE" }>
  | Readonly<{ kind: "REVIEW_REQUIRED" }>
  | Readonly<{ kind: "ACKNOWLEDGEMENT_UNKNOWN" }>
  | Readonly<{ kind: "DEFERRED"; resumeAt: string }>;

function fail(): never { throw new NativeWorklogOperationError(503); }
function timestamp(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) fail();
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) fail();
  return time;
}
function iso(time: number): string {
  if (!Number.isSafeInteger(time)) fail();
  const result = new Date(time);
  if (!Number.isFinite(result.getTime()) || result.getUTCFullYear() > 9999) fail();
  return result.toISOString();
}

/** Pure internal policy; never classifies raw errors or authorizes completion/points.
 * The future worker must confirm rollback, lock/reread outbox and persist the plan
 * in a separate transaction. An uncertain commit requires reconciliation first.
 * Deferred authority/frozen/future outcomes are not failed attempts. Neither this
 * plan nor elapsed time establishes authorization, store settlement, or SQL rollback.
 */
export function planNativeAccountingRetry(snapshot: NativeAccountingRetrySnapshot,
  event: NativeAccountingRetryEvent, now: string) {
  const current = timestamp(now);
  const due = timestamp(snapshot.nextAttemptAt);
  if (!["PENDING", "APPLIED", "QUARANTINED"].includes(snapshot.state) ||
      !Number.isSafeInteger(snapshot.attempts) || snapshot.attempts < 0 || snapshot.attempts > 2147483647 ||
      (snapshot.state === "APPLIED") !== (snapshot.completedAt !== null)) fail();
  if (snapshot.completedAt !== null && timestamp(snapshot.completedAt) > current) fail();
  if (!["TRANSIENT_FAILURE", "REVIEW_REQUIRED", "ACKNOWLEDGEMENT_UNKNOWN", "DEFERRED"].includes(event.kind)) fail();
  const resume = event.kind === "DEFERRED" ? timestamp(event.resumeAt) : null;
  const result = (action: "UNCHANGED" | "RETRY" | "QUARANTINE", state: State,
    attempts: number, nextAttemptAt: string) => Object.freeze({ action, state, attempts, nextAttemptAt,
      completedAt: snapshot.completedAt, completionAuthorized: false as const });
  // No automatic unquarantine or changes to completed historical accounting.
  if (snapshot.state !== "PENDING") return result("UNCHANGED", snapshot.state, snapshot.attempts, snapshot.nextAttemptAt);
  if (event.kind === "REVIEW_REQUIRED" || event.kind === "ACKNOWLEDGEMENT_UNKNOWN" || snapshot.attempts >= 8)
    return result("QUARANTINE", "QUARANTINED", snapshot.attempts, snapshot.nextAttemptAt);
  if (event.kind === "DEFERRED")
    return result("RETRY", "PENDING", snapshot.attempts, iso(Math.max(due, current + 60000, resume!)));
  const attempts = snapshot.attempts + 1;
  if (attempts >= 8) return result("QUARANTINE", "QUARANTINED", attempts, snapshot.nextAttemptAt);
  // Retry spacing: 1, 2, 4, 8, 16, 32, 60 minutes; never pull an existing due date forward.
  const delay = Math.min(60, 2 ** (attempts - 1)) * 60000;
  return result("RETRY", "PENDING", attempts, iso(Math.max(due, current + delay)));
}
