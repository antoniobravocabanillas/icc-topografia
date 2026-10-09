import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { NativeWorklogBudget } from "../lib/server/native-worklog-budget";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";
import { quarantineNativeAccountingReviewInTransaction } from "../lib/server/native-worklog-accounting-review";

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
  const outbox = { state: "PENDING", attempts: 8, nextAttemptAt: createdAt, completedAt: null as Date | null };
  const calls: string[] = [];
  let count = 1;
  const updates: unknown[] = [];
  let owner = true, missingProof = false, missingDecision = false, missingOutbox = false, reads = 0, changedBinding = false;
  const port = {
    terraqoNativeWorklogOperation: { findUnique: async () => {
      reads++; return reads > 1 && changedBinding ? { ...receipt, workspaceId: "other" } : receipt;
    } },
    terraqoNativeWorklogAccounting: {
      findUnique: async () => missingOutbox ? null : { ...outbox },
      updateMany: async (args: unknown) => { updates.push(args); return { count }; },
    },
    terraqoNativeWorklogDecision: { findUnique: async () => missingDecision ? null : decision },
    $queryRaw: async (sql: Prisma.Sql) => {
      const query = sql.strings.join("?");
      if (query.includes("TerraqoProfessionalProfile")) { calls.push("owner"); return owner ? [{ id: "profile" }] : []; }
      if (query.includes("TerraqoNativeWorklogAccounting")) { calls.push("outbox"); return missingOutbox ? [] : [outbox]; }
      if (query.includes("TerraqoNativeWorklogAuthority")) { calls.push("authority"); return missingProof ? [] : [proof]; }
      if (query.includes("TerraqoNativeWorklogDecision")) { calls.push("decision"); return []; }
      if (query.includes("TerraqoNativeWorklogOperation")) { calls.push("receipt"); return []; }
      throw Error("Unexpected query: no current grants, membership, balances or writes permitted");
    },
  } as unknown as Prisma.TransactionClient;
  const run = (budget = new NativeWorklogBudget()) =>
    quarantineNativeAccountingReviewInTransaction(port, receipt.id, budget);
  return { receipt, proof, decision, outbox, calls, now, run, updates, zeroCount: () => { count = 0; },
    noOwner: () => { owner = false; }, noProof: () => { missingProof = true; }, noDecision: () => { missingDecision = true; },
    noOutbox: () => { missingOutbox = true; }, changeBinding: () => { changedBinding = true; } };
}
const rejected = (error: unknown) => error instanceof NativeWorklogOperationError && error.status === 503;
async function main() {
  const cap = fixture();
  const before = JSON.stringify({ receipt: cap.receipt, proof: cap.proof, decision: cap.decision, outbox: cap.outbox });
  assert.deepEqual(await cap.run(), { outcome: "quarantined", completionAuthorized: false });
  assert.deepEqual(cap.updates, [{ where: { operationId: cap.receipt.id, state: "PENDING", attempts: 8,
    nextAttemptAt: cap.outbox.nextAttemptAt, completedAt: null }, data: { state: "QUARANTINED" } }]);
  assert.equal(JSON.stringify({ receipt: cap.receipt, proof: cap.proof, decision: cap.decision, outbox: cap.outbox }), before);
  const target = fixture(); target.outbox.attempts = 2; target.receipt.worklogId = null;
  assert.equal((await target.run()).outcome, "quarantined");
  for (const state of ["APPLIED", "QUARANTINED"]) {
    const terminal = fixture(); terminal.outbox.state = state;
    terminal.outbox.completedAt = state === "APPLIED" ? terminal.now : null;
    assert.equal((await terminal.run()).outcome, "unchanged"); assert.deepEqual(terminal.updates, []);
  }
  const future = fixture(); future.outbox.attempts = 0; future.outbox.nextAttemptAt = new Date("2099-01-01T00:00:00.000Z");
  assert.equal((await future.run()).outcome, "unchanged"); assert.deepEqual(future.updates, []);
  for (const mutate of [(f: ReturnType<typeof fixture>) => f.noProof(),
    (f: ReturnType<typeof fixture>) => f.noDecision(), (f: ReturnType<typeof fixture>) => f.noOwner(),
    (f: ReturnType<typeof fixture>) => f.changeBinding(), (f: ReturnType<typeof fixture>) => f.noOutbox()]) {
    const f = fixture(); mutate(f); await assert.rejects(() => f.run(), rejected); assert.deepEqual(f.updates, []);
  }
  const cas = fixture(); cas.zeroCount(); await assert.rejects(() => cas.run(), rejected);
  const late = fixture(); let checks = 0;
  // Initial admission + eligibility final + review admission + post-write final.
  await assert.rejects(() => late.run(new NativeWorklogBudget(() => ++checks >= 5 ? 48000 : 0)), rejected);
  assert.equal(late.updates.length, 1); // Controlled port, not a SQL rollback proof.
  console.log("PASS directed accounting review controlled ports; no credit ports or completion authorization");
}
void main();
