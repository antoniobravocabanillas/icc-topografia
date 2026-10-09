import assert from "node:assert/strict";
import { inspectLegacyWorklogValidationHistory } from "../lib/server/native-worklog-legacy-validation-policy";

// Controlled snapshots only: no SQL, WebAuthn signature, account floor, or payment proof.
function fixture(points = 20) {
  return { actorId: "validator", accountId: "account" as string | null,
    firstNativeCreatedAt: "2026-09-01T00:00:00.000Z", observedAt: "2026-10-09T00:00:00.000Z",
    contribution: { id: "contribution", userId: "validator", sourceKey: "worklog-validation:validation" as string | null,
      type: "EXPERIENCE_VALIDATION", status: "VALIDATED", requestedPoints: points, approvedPoints: points,
      createdAt: "2026-08-01T00:00:01.000Z", reviewedAt: "2026-08-01T00:00:02.000Z",
      availableAt: null as string | null, releasedAt: null as string | null },
    validation: { id: "validation", worklogId: "worklog", workspaceId: "workspace", requestedByUserId: "author",
      validatorUserId: "validator", status: "APPROVED", credentialId: "credential" as string | null,
      createdAt: "2026-07-31T00:00:00.001Z", requestedAt: "2026-07-31T00:00:00.000Z",
      resolvedAt: "2026-08-01T00:00:00.000Z" as string | null },
    worklog: { id: "worklog", authorId: "author", workspaceId: "workspace",
      createdAt: "2026-07-30T00:00:00.000Z", nativeTarget: false, deletedAt: null as string | null },
    ledger: [{ contributionId: "contribution" as string | null, accountId: "account", redemptionId: null as string | null,
      type: "CREDIT", pointsDelta: points, scoreDelta: points, idempotencyKey: `contribution:contribution:${points}`,
      createdAt: "2026-08-01T00:00:01.999Z" }] };
}
for (const points of [5, 20]) {
  for (const status of ["VALIDATED", "IMPLEMENTED"]) {
    const f = fixture(points); f.contribution.status = status; const before = JSON.stringify(f);
    const result = inspectLegacyWorklogValidationHistory(f);
    assert.equal(result.disposition, "CREDIT_HISTORY_OBSERVED");
    assert.deepEqual(Object.keys(result).sort(), ["completionAuthorized", "creditAuthorized", "disposition"]);
    assert.equal(result.creditAuthorized, false); assert.equal(result.completionAuthorized, false);
    assert.ok(Object.isFrozen(result)); assert.equal(JSON.stringify(f), before);
  }
}
const negatives: ((f: ReturnType<typeof fixture>) => void)[] = [
  f => { f.actorId = "other"; }, f => { f.accountId = null; },
  f => { f.contribution.userId = "other"; }, f => { f.contribution.sourceKey = "worklog-validation:worklog"; },
  f => { f.contribution.type = "FIRST_WORKLOG"; }, f => { f.contribution.status = "IN_REVIEW"; },
  f => { f.contribution.status = "REJECTED"; }, f => { f.contribution.requestedPoints = 5; },
  f => { f.contribution.approvedPoints = 0; f.ledger = []; },
  f => { f.contribution.approvedPoints = Number.NaN; }, f => { f.contribution.approvedPoints = 25; },
  f => { f.contribution.availableAt = f.contribution.createdAt; },
  f => { f.contribution.releasedAt = f.contribution.reviewedAt; },
  f => { f.validation.status = "REQUESTED"; }, f => { f.validation.status = "REJECTED"; },
  f => { f.validation.validatorUserId = "other"; }, f => { f.validation.requestedByUserId = "validator"; },
  f => { f.validation.worklogId = "other"; }, f => { f.validation.workspaceId = "other"; },
  f => { f.validation.credentialId = null; }, f => { f.validation.credentialId = " "; },
  f => { f.validation.resolvedAt = null; }, f => { f.validation.resolvedAt = f.contribution.reviewedAt; },
  f => { f.worklog.authorId = "validator"; }, f => { f.worklog.nativeTarget = true; },
  f => { f.worklog.deletedAt = f.contribution.createdAt; },
  f => { f.validation.requestedAt = "2026-07-29T00:00:00.000Z"; },
  f => { f.validation.createdAt = "2026-07-30T00:00:00.000Z"; },
  f => { f.contribution.createdAt = f.firstNativeCreatedAt; },
  f => { f.contribution.reviewedAt = f.firstNativeCreatedAt; },
  f => { f.contribution.reviewedAt = "2026-08-01T00:00:00.000Z"; },
  f => { f.contribution.createdAt = "2026-02-30T00:00:00.000Z"; },
  f => { f.observedAt = "invalid"; }, f => { f.firstNativeCreatedAt = "2099-01-01T00:00:00.000Z"; },
  f => { f.ledger = []; }, f => { f.ledger.push({ ...f.ledger[0] }); },
  f => { f.ledger[0].type = "REVERSAL"; f.ledger[0].pointsDelta = -20; },
  f => { f.ledger[0].pointsDelta = 5; }, f => { f.ledger[0].scoreDelta = 0; },
  f => { f.ledger[0].accountId = "other"; }, f => { f.ledger[0].contributionId = "other"; },
  f => { f.ledger[0].redemptionId = "redemption"; },
  f => { f.ledger[0].idempotencyKey = "native-worklog-base:operation:20"; },
  f => { f.ledger[0].createdAt = "2026-08-01T00:00:02.001Z"; },
  f => { f.ledger[0].createdAt = "2026-08-01T00:00:00.999Z"; },
];
for (const prepare of negatives) {
  const f = fixture(); prepare(f); const before = JSON.stringify(f);
  assert.equal(inspectLegacyWorklogValidationHistory(f).disposition, "REVIEW_REQUIRED");
  assert.equal(JSON.stringify(f), before);
}
for (const field of ["validation", "worklog"] as const) {
  const f = fixture();
  assert.equal(inspectLegacyWorklogValidationHistory({ ...f, [field]: null }).disposition, "REVIEW_REQUIRED");
}
console.log("legacy validation history policy controlled PASS; saved 5/20 only, no SQL or credit authorization");
