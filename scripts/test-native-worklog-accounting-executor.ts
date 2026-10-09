import assert from "node:assert/strict";
import type { Prisma, PrismaClient } from "@prisma/client";
import { executeNativeAccounting } from "../lib/server/native-worklog-accounting-executor";
import { NativeWorklogBudget } from "../lib/server/native-worklog-budget";

// Bundle-only phase ports. No productive module can read this test global.
type Ports = { review: () => Promise<{ outcome: string }>; settle: () => Promise<{ outcome: string }>;
  ack: () => Promise<{ outcome: string }> };
const controlled = globalThis as typeof globalThis & { __nativeExecutorPorts: Ports };
async function main() {
  const id = "a".repeat(64);
  async function check(mode: string, expected: string) {
    let state = "PENDING", calls = 0, reviews = 0, phases = 0, ack = 0, clock = 0;
    const budget = new NativeWorklogBudget(() => clock);
    controlled.__nativeExecutorPorts = {
      review: async () => { reviews++; if (mode === "review") { state = "QUARANTINED"; return { outcome: "quarantined" }; }
        if (["terminal", "future", "quarantine"].includes(mode)) return { outcome: "unchanged" };
        return { outcome: "inspection-only" }; },
      settle: async () => { phases++; if (mode === "pending") return { outcome: "pending" };
        if (mode === "regression") return { outcome: "review-required" };
        if (mode === "callback-failure") throw new Error("CONTROLLED_SQL_FAILURE");
        state = "APPLIED"; return { outcome: "applied" }; },
      ack: async () => { ack++; assert.equal(calls, 2);
        if (state === "APPLIED") return { outcome: "applied-history" };
        state = "QUARANTINED"; return { outcome: "quarantined" }; },
    };
    if (mode === "terminal") state = "APPLIED";
    if (mode === "quarantine") state = "QUARANTINED";
    if (mode === "initial-budget") clock = 32000;
    const database = { $transaction: async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: unknown) => {
      calls++; assert.deepEqual(options, { maxWait: 1000, timeout: 7000 });
      if (calls === 1 && ["before-callback", "recovery-failure", "no-recovery-budget"].includes(mode)) {
        if (mode === "no-recovery-budget") clock = 40000;
        throw new Error("CONTROLLED_BEFORE_CALLBACK");
      }
      if (calls === 2 && mode === "recovery-failure") throw new Error("CONTROLLED_RECOVERY_UNAVAILABLE");
      const value = await callback({ terraqoNativeWorklogAccounting: { findUniqueOrThrow: async () => ({ state }) } } as unknown as Prisma.TransactionClient);
      if (calls === 1 && mode === "confirmed-reply-lost") throw new Error("CONTROLLED_AFTER_CALLBACK_SUCCESS");
      return value;
    } } as unknown as Pick<PrismaClient, "$transaction">;
    const output = await executeNativeAccounting(database, id, budget);
    assert.deepEqual(output, { outcome: expected, retryAuthorized: false, ownerAccessAuthorized: false });
    assert.equal(Object.isFrozen(output), true);
    assert.equal(phases <= 1, true); assert.equal(reviews <= 1, true); assert.equal(ack <= 1, true);
    assert.equal(calls, mode === "initial-budget" ? 0 : ["before-callback", "confirmed-reply-lost", "callback-failure", "regression", "recovery-failure"].includes(mode) ? 2 : 1);
    if (["terminal", "future", "quarantine", "review", "before-callback", "recovery-failure", "no-recovery-budget", "initial-budget"].includes(mode)) assert.equal(phases, 0);
    if (mode === "confirmed-reply-lost") assert.equal(state, "APPLIED");
  }
  for (const [mode, expected] of [["success", "applied"], ["pending", "pending"], ["review", "quarantined"],
    ["terminal", "applied-history"], ["future", "not-due"], ["quarantine", "quarantined"],
    ["before-callback", "quarantined"], ["confirmed-reply-lost", "applied-history"],
    ["callback-failure", "quarantined"], ["regression", "quarantined"], ["recovery-failure", "uncertain"],
    ["no-recovery-budget", "uncertain"], ["initial-budget", "budget-deferred"]]) await check(mode, expected);
  await assert.rejects(() => executeNativeAccounting({} as Pick<PrismaClient, "$transaction">, "invalid", new NativeWorklogBudget()));
  console.log("native-accounting-executor controlled orchestration PASS; no SQL rollback or transport proof");
}
main().catch(() => { console.error("native-accounting-executor controlled test failed"); process.exitCode = 1; });
