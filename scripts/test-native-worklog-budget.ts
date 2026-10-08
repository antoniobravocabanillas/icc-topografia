import assert from "node:assert/strict";
import { NativeWorklogBudget } from "../lib/server/native-worklog-budget";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";

let clock = 1000;
const budget = new NativeWorklogBudget(() => clock);
budget.require(13000);
clock += 34999; budget.require(13000);
clock += 1;
assert.throws(() => budget.require(13000), (error: unknown) => error instanceof NativeWorklogOperationError && error.status === 503);
clock = 1000 + 39999; budget.require(8000);
clock += 1; assert.throws(() => budget.require(8000), NativeWorklogOperationError);
clock = 1000 + 47999; budget.require();
clock += 1; assert.throws(() => budget.require(), NativeWorklogOperationError);
console.log("PASS native worklog monotonic admission: shared elapsed, phase allowance and response margin; no SQL cancellation claim.");
