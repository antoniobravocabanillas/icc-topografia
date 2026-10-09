import assert from "node:assert/strict";
import { inspectLegacyFirstWorklogHistory } from "../lib/server/native-worklog-legacy-first-policy";

// Controlled snapshots only. No SQL, grants, payment, or creation eligibility proof.
function fixture() {
  return { actorId: "own", accountId: "account" as string | null, firstNativeCreatedAt: "2026-09-01T00:00:00.000Z",
    observedAt: "2026-10-09T00:00:00.000Z", contribution: {
      id: "contribution", userId: "own", sourceKey: "first-worklog:own", type: "FIRST_WORKLOG",
      status: "VALIDATED", requestedPoints: 25, approvedPoints: 25, detail: "Own legacy first award",
      createdAt: "2026-08-01T00:00:00.000Z", reviewedAt: "2026-08-01T00:00:01.000Z",
      availableAt: null as string | null, releasedAt: null as string | null,
    }, ledger: [{ contributionId: "contribution", accountId: "account", redemptionId: null as string | null,
      type: "CREDIT", pointsDelta: 25, scoreDelta: 25, idempotencyKey: "contribution:contribution:25",
      createdAt: "2026-08-01T00:00:00.999Z" }] };
}
const original = fixture(), baseline = JSON.stringify(original);
const history = inspectLegacyFirstWorklogHistory(original);
assert.equal(history.disposition, "CREDIT_HISTORY_OBSERVED");
assert.equal(history.creditAuthorized, false); assert.equal(history.completionAuthorized, false);
assert.ok(Object.isFrozen(history)); assert.equal(JSON.stringify(original), baseline);
assert.deepEqual(Object.keys(history).sort(), ["completionAuthorized", "creditAuthorized", "disposition"]);
const implemented = fixture(); implemented.contribution.status = "IMPLEMENTED";
assert.equal(inspectLegacyFirstWorklogHistory(implemented).disposition, "CREDIT_HISTORY_OBSERVED");
const rejected: ((f: ReturnType<typeof fixture>) => void)[] = [
  f => { f.contribution.status = "IN_REVIEW"; }, f => { f.contribution.status = "REJECTED"; },
  f => { f.contribution.approvedPoints = 0; f.ledger = []; },
  f => { f.ledger = []; }, f => { f.ledger.push({ ...f.ledger[0] }); },
  f => { f.ledger[0].type = "REVERSAL"; f.ledger[0].pointsDelta = -25; },
  f => { f.ledger[0].pointsDelta = 24; }, f => { f.ledger[0].scoreDelta = 0; },
  f => { f.ledger[0].accountId = "other"; }, f => { f.ledger[0].contributionId = "other"; },
  f => { f.ledger[0].redemptionId = "redemption"; },
  f => { f.ledger[0].idempotencyKey = "native-first-worklog:contribution:25"; },
  f => { f.contribution.userId = "other"; }, f => { f.contribution.sourceKey = "first-worklog:other"; },
  f => { f.contribution.requestedPoints = 26; },
  f => { f.accountId = null; }, f => { f.contribution.type = "EXPERIENCE_VALIDATION"; },
  f => { f.contribution.approvedPoints = Number.NaN; },
  f => { f.contribution.detail = "native-first-worklog-v1:malformed"; },
  f => { f.contribution.availableAt = f.contribution.createdAt; },
  f => { f.contribution.createdAt = f.firstNativeCreatedAt; },
  f => { f.contribution.reviewedAt = "2026-07-01T00:00:00.000Z"; },
  f => { f.contribution.reviewedAt = "2099-01-01T00:00:00.000Z"; },
  f => { f.contribution.reviewedAt = f.firstNativeCreatedAt; },
  f => { f.contribution.createdAt = "2026-02-30T00:00:00.000Z"; },
  f => { f.observedAt = "invalid"; },
  f => { f.ledger[0].createdAt = "2026-08-01T00:00:01.001Z"; },
  f => { f.contribution.releasedAt = "2099-01-01T00:00:00.000Z"; },
];
for (const prepare of rejected) {
  const f = fixture(); prepare(f); const before = JSON.stringify(f);
  const result = inspectLegacyFirstWorklogHistory(f);
  assert.equal(result.disposition, "REVIEW_REQUIRED");
  assert.equal(result.creditAuthorized, false); assert.equal(result.completionAuthorized, false);
  assert.equal(JSON.stringify(f), before);
}
console.log("legacy FIRST history policy controlled PASS; no SQL or credit authorization");
