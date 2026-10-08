import assert from "node:assert/strict";
import { planNativeAccountingRetry, type NativeAccountingRetrySnapshot } from "../lib/server/native-worklog-accounting-retry-policy";

const now = "2026-10-08T22:00:00.000Z";
const initial: NativeAccountingRetrySnapshot = Object.freeze({ state: "PENDING", attempts: 0,
  nextAttemptAt: now, completedAt: null });
const failure = Object.freeze({ kind: "TRANSIENT_FAILURE" as const });
const expected = [1, 2, 4, 8, 16, 32, 60];
for (let attempt = 0; attempt < 7; attempt++) {
  const plan = planNativeAccountingRetry({ ...initial, attempts: attempt }, failure, now);
  assert.equal(plan.action, "RETRY"); assert.equal(plan.state, "PENDING");
  assert.equal(plan.attempts, attempt + 1); assert.equal(plan.completionAuthorized, false);
  assert.equal(Date.parse(plan.nextAttemptAt) - Date.parse(now), expected[attempt] * 60000);
  assert.ok(Object.isFrozen(plan));
}
assert.equal(initial.attempts, 0);
const eighth = planNativeAccountingRetry({ ...initial, attempts: 7 }, failure, now);
assert.equal(eighth.action, "QUARANTINE"); assert.equal(eighth.attempts, 8); assert.equal(eighth.completedAt, null);
for (const kind of ["REVIEW_REQUIRED", "ACKNOWLEDGEMENT_UNKNOWN"] as const) {
  const plan = planNativeAccountingRetry(initial, { kind }, now);
  assert.equal(plan.state, "QUARANTINED"); assert.equal(plan.attempts, 0);
}
const later = "2026-10-09T22:00:00.000Z";
assert.equal(planNativeAccountingRetry({ ...initial, nextAttemptAt: later }, failure, now).nextAttemptAt, later);
assert.equal(planNativeAccountingRetry(initial, { kind: "DEFERRED", resumeAt: now }, now).nextAttemptAt, "2026-10-08T22:01:00.000Z");
const deferred = planNativeAccountingRetry(initial, { kind: "DEFERRED", resumeAt: later }, now);
assert.equal(deferred.attempts, 0); assert.equal(deferred.nextAttemptAt, later);
for (const attempts of [8, 9, 2147483647])
  assert.equal(planNativeAccountingRetry({ ...initial, attempts }, failure, now).state, "QUARANTINED");
for (const state of ["APPLIED", "QUARANTINED"] as const) {
  const snapshot = { ...initial, state, completedAt: state === "APPLIED" ? now : null };
  for (const event of [failure, { kind: "DEFERRED" as const, resumeAt: later }, { kind: "ACKNOWLEDGEMENT_UNKNOWN" as const }]) {
    const result = planNativeAccountingRetry(snapshot, event, now);
    assert.equal(result.action, "UNCHANGED"); assert.equal(result.state, state);
    assert.equal(result.nextAttemptAt, now); assert.equal(result.attempts, 0);
  }
}
const rejected = (snapshot: NativeAccountingRetrySnapshot) => assert.throws(() => planNativeAccountingRetry(snapshot, failure, now));
for (const attempts of [-1, 0.1, NaN, Infinity, 2147483648]) rejected({ ...initial, attempts });
rejected({ ...initial, state: "APPLIED" });
rejected({ ...initial, completedAt: now });
rejected({ ...initial, state: "APPLIED", completedAt: later });
rejected({ ...initial, nextAttemptAt: "bad" });
rejected({ ...initial, state: "UNKNOWN" as NativeAccountingRetrySnapshot["state"] });
assert.throws(() => planNativeAccountingRetry(initial, { kind: "APPLY" } as never, now));
assert.deepEqual(Object.keys(eighth).sort(), ["action", "attempts", "completedAt", "completionAuthorized", "nextAttemptAt", "state"]);
for (const value of ["2026-02-30T00:00:00.000Z", "2026-10-08T22:00:00Z", "2026-10-08T22:00:00.000+00:00", "", "bad"])
  assert.throws(() => planNativeAccountingRetry(initial, failure, value));
assert.throws(() => planNativeAccountingRetry(initial, { kind: "DEFERRED", resumeAt: "bad" }, now));
assert.throws(() => planNativeAccountingRetry(initial, failure, "9999-12-31T23:59:59.999Z"));
console.log("PASS accounting retry policy: bounded spacing, deferrals, uncertainty/quarantine, terminal preservation; no persistence/auth/rollback claim.");
