import assert from "node:assert/strict";
import { freezeWebCvCommand, readWebCvPage, WebCvPublicationApi, WebCvRequestError } from "../lib/terraqo/cv-publication-client";

async function main() {
  const version = "2026-10-07T01:00:00.000Z", later = "2026-10-07T01:00:01.000Z", operationKey = "a".repeat(32);
  const initial = { schemaVersion: 1, workspaceSlug: "icc-topografia", current: { version, username: "fixture-cv", published: false, url: null }, receipt: null };
  assert.ok(Object.isFrozen(readWebCvPage(initial, "icc-topografia").current));
  for (const bad of [
    { ...initial, bank: "private" }, { ...initial, workspaceSlug: "foreign" },
    { ...initial, current: { ...initial.current, identity: "private" } },
    { ...initial, current: { ...initial.current, version: "2026-02-30T01:00:00.000Z" } },
    { ...initial, current: { ...initial.current, version: version.replace(".000", "") } },
    { ...initial, current: { ...initial.current, url: "https://untrusted.example/cv" } },
  ]) assert.throws(() => readWebCvPage(bad, "icc-topografia"));
  const command = freezeWebCvCommand({ action: "PUBLISH", version, operationKey, consent: true }); assert.ok(Object.isFrozen(command));
  for (const bad of [{ ...command, consent: false }, { ...command, accountId: "foreign" }, { action: "WITHDRAW", version, operationKey, consent: true }])
    assert.throws(() => freezeWebCvCommand(bad));
  const history = { ...initial, current: { ...initial.current, version: later }, receipt: { action: "PUBLISH", published: true, operationKey,
    version: later, username: "fixture-cv", confirmedAt: later } };
  assert.equal(readWebCvPage(history, "icc-topografia", operationKey).current.published, false);
  assert.throws(() => readWebCvPage(history, "icc-topografia", "b".repeat(32)));
  assert.throws(() => readWebCvPage({ ...history, receipt: { ...history.receipt, published: false } }, "icc-topografia", operationKey));
  assert.throws(() => readWebCvPage({ ...history, current: initial.current }, "icc-topografia", operationKey));
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let data: unknown = initial;
  const fetcher: typeof fetch = async (url, init) => { calls.push({ url: String(url), init }); return Response.json({ data }); };
  const api = new WebCvPublicationApi("icc-topografia", "fixture-owner", fetcher);
  await api.load(); await api.reconcile(operationKey);
  assert.ok(calls.every(call => call.init?.method === "GET" && !call.init.body));
  assert.ok(calls.every(call => new Headers(call.init?.headers).get("x-terraqo-cv-owner") === "fixture-owner"));
  assert.ok(calls[1].url.endsWith(`&operationKey=${operationKey}`));
  data = history; await api.submit(command); await api.submit(command);
  assert.equal(calls[2].init?.body, calls[3].init?.body);
  assert.ok(calls.every(call => call.init?.redirect === "error" && call.init.credentials === "same-origin" && call.init.cache === "no-store"));
  data = initial;
  await assert.rejects(api.submit(command), error => error instanceof WebCvRequestError && error.kind === "uncertain");
  for (const [status, kind] of [[401, "credentials"], [403, "forbidden"], [409, "conflict"], [422, "validation"], [500, "uncertain"]] as const) {
    let count = 0;
    const failed = new WebCvPublicationApi("icc-topografia", "fixture-owner", async () => { count++; return new Response("private diagnostics", { status }); });
    await assert.rejects(failed.submit(command), error => error instanceof WebCvRequestError && error.kind === kind); assert.equal(count, 1);
  }
  const oversized = new WebCvPublicationApi("icc-topografia", "fixture-owner", async () => new Response("x".repeat(16385), { headers: { "content-type": "application/json" } }));
  await assert.rejects(oversized.load(), error => error instanceof WebCvRequestError && error.kind === "uncertain");
  const malformed = new WebCvPublicationApi("icc-topografia", "fixture-owner", async () => new Response(new Uint8Array([255]), { headers: { "content-type": "application/json" } }));
  await assert.rejects(malformed.load(), error => error instanceof WebCvRequestError && error.kind === "uncertain");
  let timeoutCalls = 0;
  const timed = new WebCvPublicationApi("icc-topografia", "fixture-owner", async () => { timeoutCalls++; return new Promise<Response>(() => undefined); }, 5);
  await assert.rejects(timed.submit(command), error => error instanceof WebCvRequestError && error.kind === "uncertain"); assert.equal(timeoutCalls, 1);
  console.log("PASS web CV client: strict private DTO/URL/version/receipt, frozen consent payload, bounded JSON/UTF-8, cookie-only GET/POST, exact explicit resend, timeout and no redirects/retries.");
}
main().catch(() => { console.error("Web CV client verification failed; diagnostics suppressed."); process.exitCode = 1; });
