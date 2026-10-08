import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { handleEducationEvidenceOperations } from "../lib/server/education-evidence-operations";

async function main() {
  const secret = randomBytes(32).toString("hex"); let health = 0, recovered = 0, dispatched = 0;
  const operations = { secret, health: async () => { health++; return { pending: 0 }; },
    recover: async (id: string) => { assert.equal(id, "own_fixture"); recovered++; return "completed"; },
    dispatch: async () => { dispatched++; return { selected: 0 }; } };
  const request = (body: unknown, authorized = true) => new Request("https://example.invalid/internal", { method: "POST",
    headers: { "content-type": "application/json", ...(authorized ? { authorization: `Bearer ${secret}` } : {}) }, body: JSON.stringify(body) });
  assert.equal((await handleEducationEvidenceOperations(request({ action: "DISPATCH" }, false), operations)).status, 401);
  for (const body of [null, [], {}, { action: "DISPATCH", attemptId: "own_fixture" }, { action: "RECOVER" },
    { action: "RECOVER", attemptId: "../other" }, { action: "RECOVER", attemptId: "own_fixture", force: true }])
    assert.equal((await handleEducationEvidenceOperations(request(body), operations)).status, 422);
  assert.equal((await handleEducationEvidenceOperations(request({ noise: "x".repeat(1100) }), operations)).status, 413);
  assert.equal(health + recovered + dispatched, 0);
  assert.equal((await handleEducationEvidenceOperations(request({ action: "RECOVER", attemptId: "own_fixture" }), operations)).status, 200);
  assert.equal(recovered, 1); assert.equal(dispatched, 0);
  assert.equal((await handleEducationEvidenceOperations(request({ action: "DISPATCH" }), operations)).status, 200);
  const read = await handleEducationEvidenceOperations(new Request("https://example.invalid/internal", {
    headers: { authorization: `Bearer ${secret}` } }), operations);
  assert.equal(read.headers.get("cache-control"), "private, no-store"); assert.equal(health, 1);
  assert.equal((await handleEducationEvidenceOperations(new Request("https://example.invalid/internal?attemptId=own_fixture", {
    headers: { authorization: `Bearer ${secret}` } }), operations)).status, 422);
  let cancelled = false;
  const stalled = new Request("https://example.invalid/internal", { method: "POST", headers: {
    authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: new ReadableStream({
      pull: () => new Promise(() => undefined), cancel: () => { cancelled = true; return new Promise(() => undefined); },
    }), duplex: "half" } as RequestInit);
  const start = performance.now(); assert.equal((await handleEducationEvidenceOperations(stalled, operations)).status, 422);
  assert.ok(cancelled && performance.now() - start < 7000); assert.equal(dispatched, 1);
  console.log("PASS operational boundary controlled ports: constant-time secret gate before reads, strict commands/queries/1KiB body, targeted recovery only, explicit batch, no-store health, 5s stalled-body deadline. No global SQL dispatch.");
}
main().catch(() => { console.error("Operational boundary test failed; private diagnostics suppressed."); process.exitCode = 1; });
