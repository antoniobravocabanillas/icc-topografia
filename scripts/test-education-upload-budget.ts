import assert from "node:assert/strict";
import { EducationUploadBudget, EDUCATION_UPLOAD_TRANSACTION } from "../lib/server/education-upload-budget";

async function main() {
  let now = 100;
  const budget = new EducationUploadBudget(() => now);
  assert.deepEqual(EDUCATION_UPLOAD_TRANSACTION, { maxWait: 1000, timeout: 7000 });
  budget.beforeParse(); now += 10_000; budget.beforeReserve();
  now += 8000; budget.beforeStore(); now += 5000; budget.beforeCommit();
  now += 8000; assert.equal(budget.canFence(), true);
  now += 8000; budget.afterTransaction();
  now += 10_000; assert.throws(() => budget.afterTransaction());
  const expired = new EducationUploadBudget(() => now);
  now += 20_000; assert.throws(() => expired.beforeParse());
  now += 12_001; assert.throws(() => expired.beforeCommit());
  now += 9000; assert.equal(expired.canFence(), false);

  let finish!: () => void, commits = 0;
  const late = new Promise<void>(resolve => { finish = resolve; });
  const started = performance.now();
  await assert.rejects(async () => {
    await new EducationUploadBudget().store(() => late); commits++;
  }, /almacenamiento/);
  assert.ok(performance.now() - started < 7000);
  finish(); await late; await Promise.resolve(); assert.equal(commits, 0);
  await assert.rejects(new EducationUploadBudget().store(async () => { throw Error("STORE_REJECT"); }), /STORE_REJECT/);
  const elapsed = new EducationUploadBudget(() => now);
  await assert.rejects(elapsed.store(async () => { now += 40_000; }), /recibo/);
  console.log("PASS upload monotonic admission/short SQL envelopes/store never settles/late completion without commit/store rejection/exhaustion after provider acknowledgement. No driver cancellation claim.");
}
main().catch(() => { console.error("FAIL upload budget"); process.exitCode = 1; });
