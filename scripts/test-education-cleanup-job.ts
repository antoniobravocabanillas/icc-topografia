import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { queueEducationCleanup, runEducationCleanupWorker } from "../lib/terraqo/education-cleanup-job";

async function main() {
  const secret = randomBytes(32).toString("hex");
  const reports: Record<string, unknown>[] = [], calls: { url: string; init?: RequestInit }[] = [];
  const counters = { completed: 1, retained: 0, retry: 0, quarantined: 0, skipped: 0, pending: 0 };
  let reply: unknown = { selected: 2, processed: 1, deferred: 1, counts: counters, privateKey: "MUST_NOT_REPORT" };
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    assert.equal(init?.redirect, "error"); assert.ok(init?.signal);
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${secret}`);
    if (String(url).includes("/.netlify/functions/")) return new Response(null, { status: 202 });
    if (init?.method === "GET") return Response.json({ backlog: { pending: 0, overdue: 0, quarantined: 1, watchesDue: 0, orphaned: 0,
      identity: "MUST_NOT_REPORT" } });
    return Response.json(reply);
  }) as typeof fetch;
  const ports = { secret, fetch: fetcher, report: (value: Record<string, unknown>) => reports.push(value) };
  const request = (body: unknown, auth = true) => new Request("https://example.invalid/worker", { method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${secret}` } : {}) }, body: JSON.stringify(body) });
  await queueEducationCleanup(ports); assert.deepEqual(reports.pop(), { queued: 1 });
  assert.equal(calls.length, 1); assert.equal(calls[0].init?.body, JSON.stringify({ action: "DISPATCH" })); calls.length = 0;
  for (const body of [{}, { action: "DISPATCH", force: true }, { action: "RECOVER", attemptId: "../bad" }, { noise: "x".repeat(1100) }])
    await runEducationCleanupWorker(request(body), ports);
  await runEducationCleanupWorker(request({ action: "DISPATCH" }, false), ports); assert.equal(calls.length, 0);
  await runEducationCleanupWorker(request({ action: "DISPATCH" }), ports);
  assert.equal(calls.length, 2); assert.equal(reports[0].requiresInvestigation, true);
  assert.ok(!JSON.stringify(reports).includes("MUST_NOT_REPORT")); assert.ok(!JSON.stringify(reports).includes(secret));
  reply = { result: "completed", attemptId: "MUST_NOT_REPORT" }; calls.length = 0;
  await runEducationCleanupWorker(request({ action: "RECOVER", attemptId: "own_fixture" }), ports);
  assert.equal(calls.length, 2); assert.ok(!JSON.stringify(reports).includes("own_fixture"));
  reply = { selected: 6, processed: 1, deferred: 5, counts: counters };
  await assert.rejects(runEducationCleanupWorker(request({ action: "DISPATCH" }), ports), /JOB_RESULT_INVALID/);
  reply = { selected: 1, processed: 1, deferred: 0, counts: { ...counters, completed: 0 } };
  await assert.rejects(runEducationCleanupWorker(request({ action: "DISPATCH" }), ports), /JOB_RESULT_INVALID/);
  await assert.rejects(queueEducationCleanup({ ...ports, fetch: async () => new Response(null, { status: 200 }) }), /JOB_QUEUE_REJECTED/);
  const started = performance.now();
  await assert.rejects(queueEducationCleanup({ ...ports, fetch: async () => new Promise(() => undefined) }), /JOB_TRANSPORT_DEADLINE/);
  assert.ok(performance.now() - started < 12000);
  let cancelled = false;
  const stalled = new Request("https://example.invalid/worker", { method: "POST", headers: { "content-type": "application/json",
    authorization: `Bearer ${secret}` }, body: new ReadableStream({ pull: () => new Promise(() => undefined),
      cancel: () => { cancelled = true; return new Promise(() => undefined); } }), duplex: "half" } as RequestInit);
  await runEducationCleanupWorker(stalled, ports); assert.ok(cancelled);
  console.log("PASS controlled job ports: 10s short trigger/202 queue only, worker secret before I/O, strict bounded body, targeted and batch counters/backlog sanitized, invalid response rejected, no redirects/retries/global SQL.");
}
main().catch(() => { console.error("Education job test failed; private diagnostics suppressed."); process.exitCode = 1; });
