import assert from "node:assert/strict";
import { handleNativeAccountingOperations } from "../lib/server/native-worklog-accounting-operations";
import { NativeWorklogBudget } from "../lib/server/native-worklog-budget";

async function main() {
  const secret = "x".repeat(40); // Controlled fixture; never an environment credential.
  const id = "a".repeat(64);
  let calls = 0;
  const operations = { secret, execute: async (operationId: string, budget: NativeWorklogBudget) => {
    assert.equal(operationId, id); assert.ok(budget instanceof NativeWorklogBudget); budget.require(); calls++;
    return { outcome: "applied" as const, retryAuthorized: false as const, ownerAccessAuthorized: false as const,
      operationId, balance: 123, marker: "private" };
  } };
  const request = (body = JSON.stringify({ action: "EXECUTE", operationId: id }), headers = {}, method = "POST", query = "") =>
    new Request(`https://example.invalid/internal${query}`, { method, headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", ...headers },
      ...(method === "POST" ? { body } : {}) });
  const check = async (req: Request, status: number, ports: Parameters<typeof handleNativeAccountingOperations>[1] = operations) => {
    const response = await handleNativeAccountingOperations(req, ports);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    return response;
  };
  const unread = request(); Object.defineProperty(unread, "body", { get() { throw Error("body touched before auth"); } });
  unread.headers.delete("authorization"); await check(unread, 401);
  await check(unread, 401, { ...operations, secret: undefined });
  await check(request("", {}, "GET"), 405);
  assert.equal((await check(request("", {}, "DELETE"), 405)).headers.get("allow"), "POST");
  const query = request("", {}, "POST", "?operationId=" + id);
  Object.defineProperty(query, "body", { get() { throw Error("body touched before query"); } }); await check(query, 422);
  for (const text of ["{}", "null", "[]", JSON.stringify({ action: "DISPATCH", operationId: id }),
    JSON.stringify({ action: "EXECUTE", operationId: id, owner: "ignored" }),
    `{"action":"EXECUTE","act\\u0069on":"EXECUTE"}`, `{"action":"EXECUTE","operationId":42}`,
    `{"action":"EXECUTE","operationId":"${id.toUpperCase()}"}`, `{"action":"EXECUTE","operationId":"${id.slice(1)}"}`,
    `{"action":"EXECUTE","operationId":"${id}","operationId":"${id}"}`,
    `{"action":"EXECUTE","operationId":"${id}"}\u00a0`]) await check(request(text), 422);
  await check(request(" ".repeat(1025), { "content-length": "1" }), 413);
  await check(request("{}", { "content-length": "1025" }), 413);
  await check(request("{}", { "content-length": "-1" }), 422);
  await check(request("{}", { "content-type": "text/plain" }), 415);
  const utf8 = new Request("https://example.invalid", { method: "POST", headers: request().headers, body: Uint8Array.of(255) });
  await check(utf8, 422);
  const abort = new AbortController(); abort.abort();
  await check(new Request("https://example.invalid", { method: "POST", headers: request().headers, body: "{}", signal: abort.signal }), 408);
  assert.equal(calls, 0);
  const valid = await check(request(`{"operationId":"${id}","act\\u0069on":"EXECUTE"}`), 200);
  assert.deepEqual(await valid.json(), { result: { outcome: "applied", retryAuthorized: false, ownerAccessAuthorized: false } });
  assert.equal(calls, 1);
  for (const outcome of ["applied-history", "quarantined", "pending", "not-due", "budget-deferred", "uncertain"] as const) {
    const response = await check(request(), outcome === "uncertain" || outcome === "budget-deferred" ? 503 : 200,
      { secret, execute: async () => ({ outcome, retryAuthorized: false, ownerAccessAuthorized: false }) });
    assert.deepEqual(await response.json(), { result: { outcome, retryAuthorized: false, ownerAccessAuthorized: false } });
  }
  const unknown = await check(request(), 503, { secret, execute: async () => { throw Error("private provider detail"); } });
  assert.deepEqual(await unknown.json(), { error: "ACCOUNTING_UNAVAILABLE" });
  await check(request(), 503, { secret, execute: async () => ({ outcome: "invalid", retryAuthorized: false, ownerAccessAuthorized: false }) as never });
  await check(request(), 503, { secret, execute: async () => ({ outcome: "applied", retryAuthorized: true, ownerAccessAuthorized: false }) as never });
  // Actual body deadline, including a cancellation promise that never settles.
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => {}), cancel: () => { cancelled = true; return new Promise(() => {}); } });
  const stalled = new Request("https://example.invalid", { method: "POST", headers: request().headers, body: stream, duplex: "half" } as RequestInit);
  const started = performance.now(); await check(stalled, 408);
  assert.ok(performance.now() - started >= 4900 && performance.now() - started < 6500); assert.equal(cancelled, true);
  const during = new AbortController();
  const interrupted = new Request("https://example.invalid", { method: "POST", headers: request().headers,
    body: new ReadableStream({ pull: () => new Promise(() => {}) }), duplex: "half", signal: during.signal } as RequestInit);
  const promise = check(interrupted, 408); during.abort(); await promise;
  console.log("PASS native accounting operations controlled ports; no route, SQL, credentials or global dispatch");
}
void main().catch(() => { console.error("FAIL native accounting operations controlled test"); process.exitCode = 1; });
