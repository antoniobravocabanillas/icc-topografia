import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { NativeWorklogBudget } from "../lib/server/native-worklog-budget";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";
import { inspectNativeWorkerEligibilityInTransaction } from "../lib/server/native-worklog-worker-eligibility";

// Controlled read ports only: no SQL, JWT validation, transaction or credit proof.
function fixture() {
  const createdAt = new Date("2026-09-01T00:00:00.000Z"), now = new Date("2026-10-08T23:00:00.000Z");
  const receipt = { id: "a".repeat(64), actorId: "own", workspaceId: "workspace", professionalProfileId: "profile",
    fingerprint: "b".repeat(64), createdAt, worklogId: "entry" as string | null };
  const proof = { operationId: receipt.id, ...receipt, policyVersion: "native-creation-authority-v1", grantHash: "c".repeat(64),
    tokenIssuedAt: createdAt, tokenExpiresAt: new Date("2026-09-02T00:00:00.000Z"),
    grantExpiresAt: new Date("2026-09-02T00:00:00.000Z"), paidThrough: new Date("2026-09-03T00:00:00.000Z") as Date | null,
    role: "PROFESSIONAL", modules: ["LIVE_CV", "PROFESSIONAL_NETWORK"] };
  const decision = { fingerprint: receipt.fingerprint, createdAt, policyVersion: "native-declared-lima-v1", contentKey: "d".repeat(64) };
  const first = { ...receipt, policyVersion: "native-first-decision-v1", disposition: "INELIGIBLE",
    contributionId: null, priorReceipts: 0, priorEntries: 1 };
  const outbox = { state: "PENDING", attempts: 0, nextAttemptAt: createdAt, completedAt: null as Date | null };
  const calls: string[] = [];
  let owner = true, missingProof = false, missingDecision = false, missingOutbox = false, reads = 0, changedBinding = false;
  const port = {
    terraqoBuilderContribution: { findUnique: async () => null },
    terraqoNativeWorklogOperation: { findUnique: async () => {
      reads++; return reads > 1 && changedBinding ? { ...receipt, workspaceId: "other" } : receipt;
    } },
    terraqoNativeWorklogDecision: { findUnique: async () => missingDecision ? null : decision },
    $queryRaw: async (sql: Prisma.Sql) => {
      const query = sql.strings.join("?");
      if (query.includes("TerraqoProfessionalProfile")) { calls.push("owner"); return owner ? [{ id: "profile" }] : []; }
      if (query.includes("TerraqoNativeWorklogAccounting")) { calls.push("outbox"); return missingOutbox ? [] : [outbox]; }
      if (query.includes("TerraqoNativeWorklogAuthority")) { calls.push("authority"); return missingProof ? [] : [proof]; }
      if (query.includes("TerraqoNativeWorklogDecision")) { calls.push("decision"); return []; }
      if (query.includes("TerraqoNativeWorklogFirstDecision")) { calls.push("first"); return [first]; }
      if (query.includes("TerraqoBuilderContribution")) { calls.push("allocation"); return []; }
      if (query.includes("TerraqoNativeWorklogOperation")) { calls.push("receipt"); return []; }
      throw Error("Unexpected query: no current grants, membership, balances or writes permitted");
    },
  } as unknown as Prisma.TransactionClient;
  const run = (budget = new NativeWorklogBudget(), clock: () => Date = () => now) =>
    inspectNativeWorkerEligibilityInTransaction(port, receipt.id, budget, clock);
  return { receipt, proof, decision, outbox, calls, now, run,
    noOwner: () => { owner = false; }, noProof: () => { missingProof = true; }, noDecision: () => { missingDecision = true; },
    noOutbox: () => { missingOutbox = true; }, changeBinding: () => { changedBinding = true; } };
}
const rejected = (error: unknown) => error instanceof NativeWorklogOperationError && error.status === 503;
async function main() {
  const f = fixture(), snapshot = JSON.stringify({ receipt: f.receipt, proof: f.proof, decision: f.decision, outbox: f.outbox });
  const result = await f.run(); // Token/grant/paidThrough expired now, valid at creation.
  assert.deepEqual(result, { disposition: "INSPECT_PHASES", completionAuthorized: false, ownerAccessAuthorized: false });
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(f.calls, ["owner", "receipt", "outbox", "authority", "decision", "owner", "receipt", "first", "allocation"]);
  assert.equal(JSON.stringify({ receipt: f.receipt, proof: f.proof, decision: f.decision, outbox: f.outbox }), snapshot);
  assert.deepEqual(await f.run(), result);
  for (const state of ["APPLIED", "QUARANTINED"]) {
    const c = fixture(); c.outbox.state = state; c.outbox.completedAt = state === "APPLIED" ? c.now : null;
    assert.equal((await c.run()).disposition, "TERMINAL");
  }
  const future = fixture(); future.outbox.nextAttemptAt = new Date("2099-01-01T00:00:00.000Z");
  assert.equal((await future.run()).disposition, "NOT_DUE");
  const cap = fixture(); cap.outbox.attempts = 8; assert.equal((await cap.run()).disposition, "REVIEW_REQUIRED");
  const missing = fixture(); missing.receipt.worklogId = null; assert.equal((await missing.run()).disposition, "TARGET_MISSING");
  for (const mutation of [
    (c: ReturnType<typeof fixture>) => c.noOwner(), (c: ReturnType<typeof fixture>) => c.noProof(),
    (c: ReturnType<typeof fixture>) => c.noDecision(), (c: ReturnType<typeof fixture>) => c.noOutbox(),
    (c: ReturnType<typeof fixture>) => c.changeBinding(),
    (c: ReturnType<typeof fixture>) => { c.proof.grantExpiresAt = c.receipt.createdAt; },
    (c: ReturnType<typeof fixture>) => { c.proof.tokenExpiresAt = c.receipt.createdAt; },
    (c: ReturnType<typeof fixture>) => { c.proof.role = "CLIENT"; },
    (c: ReturnType<typeof fixture>) => { c.proof.modules.reverse(); },
    (c: ReturnType<typeof fixture>) => { c.decision.fingerprint = "e".repeat(64); },
    (c: ReturnType<typeof fixture>) => { c.outbox.attempts = -1; },
    (c: ReturnType<typeof fixture>) => { c.outbox.completedAt = c.now; },
    (c: ReturnType<typeof fixture>) => { c.outbox.state = "APPLIED"; },
    (c: ReturnType<typeof fixture>) => { c.receipt.createdAt = new Date("2099-01-01T00:00:00.000Z"); },
  ]) { const c = fixture(); mutation(c); await assert.rejects(() => c.run(), rejected); }
  let clock = 0; const budget = new NativeWorklogBudget(() => clock); clock = 48000;
  await assert.rejects(() => fixture().run(budget), rejected);
  const late = fixture(); let checks = 0;
  const lateBudget = new NativeWorklogBudget(() => ++checks >= 3 ? 48000 : 0);
  await assert.rejects(() => late.run(lateBudget), rejected);
  assert.deepEqual(late.calls, ["owner", "receipt", "outbox", "authority", "decision", "owner", "receipt", "first", "allocation"]);
  await assert.rejects(() => fixture().run(undefined, () => new Date(NaN)), rejected);
  const invalidId = fixture(); invalidId.receipt.id = "invalid";
  await assert.rejects(() => invalidId.run(), rejected); assert.deepEqual(invalidId.calls, []);
  console.log("PASS native worker eligibility controlled read ports; no SQL or completion proof");
}
void main();
