import assert from "node:assert/strict";

import {
  fieldVerificationRetryDelay,
  isRetryableFieldVerificationStatus,
} from "../lib/client/field-verification-recovery";

assert.equal(isRetryableFieldVerificationStatus(0), true);
assert.equal(isRetryableFieldVerificationStatus(408), true);
assert.equal(isRetryableFieldVerificationStatus(429), true);
assert.equal(isRetryableFieldVerificationStatus(503), true);
assert.equal(isRetryableFieldVerificationStatus(401), false);
assert.equal(isRetryableFieldVerificationStatus(403), false);
assert.equal(isRetryableFieldVerificationStatus(422), false);

assert.equal(fieldVerificationRetryDelay(-1), 2_000);
assert.equal(fieldVerificationRetryDelay(0), 2_000);
assert.equal(fieldVerificationRetryDelay(1), 5_000);
assert.equal(fieldVerificationRetryDelay(2), 15_000);
assert.equal(fieldVerificationRetryDelay(3), 30_000);
assert.equal(fieldVerificationRetryDelay(99), 30_000);

console.log("PASS: field verification retries transient failures with bounded backoff and fails closed for authorization errors.");
