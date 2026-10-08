import assert from "node:assert/strict";
import { handleEducationWithdrawal } from "../lib/server/education-withdrawal-http";
import { EducationEvidenceReservationError } from "../lib/server/education-evidence-reservation";

async function main() {
  const params = { workspaceSlug: "icc-topografia", educationId: "own-education", evidenceId: "own-evidence" };
  const input = { version: "2026-10-08T02:00:00.000Z", operationKey: "a".repeat(32) };
  const token = { sub: "own-user", workspaceId: "own-workspace", workspaceSlug: params.workspaceSlug,
    role: "PROFESSIONAL" as const, jti: "own-grant", iat: 1, exp: 9999999999 };
  let writes = 0, reads = 0, auth = 0;
  const receipt = { id: "b".repeat(64), educationId: params.educationId, actorId: token.sub, ...input,
    fingerprint: "c".repeat(64), targetEvidenceId: params.evidenceId, uploadOperationId: "d".repeat(64), attemptId: "own-attempt",
    originalVersion: new Date(input.version), resultVersion: new Date("2026-10-08T02:00:00.001Z"), createdAt: new Date(input.version) };
  const ports = { authenticate: async () => { auth++; return token; },
    read: async () => { reads++; return { current: { educationId: params.educationId, version: input.version, verificationStatus: "APPROVED" }, receipt: null }; },
    withdraw: async () => { writes++; return { kind: "withdrawn" as const, receipt, currentVersion: receipt.resultVersion.toISOString() }; } };
  const request = (body = JSON.stringify(input), method = "POST", query = "") => new Request("https://api.terraqoglobal.com/own" + query,
    { method, headers: { "content-type": "application/json" }, ...(method === "POST" ? { body } : {}) });
  const check = (response: Response, status: number) => {
    assert.equal(response.status, status); assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  };
  const unauth = new Proxy(request(), { get(target, key) {
    if (key === "body") throw Error("UNAUTHORIZED_BODY_CONSUMPTION"); return Reflect.get(target, key, target);
  } });
  check(await handleEducationWithdrawal(unauth, params, { ...ports, authenticate: async () => null }), 401);
  check(await handleEducationWithdrawal(request(), params, { ...ports, authenticate: async () => ({ ...token, jti: undefined }) }), 401);
  assert.equal(writes, 0);
  const method = await handleEducationWithdrawal(request("", "GET"), params, ports); check(method, 405); assert.equal(method.headers.get("allow"), "POST");
  assert.equal(auth, 0);
  check(await handleEducationWithdrawal(request(), { ...params, evidenceId: "../bad" }, ports), 404);
  check(await handleEducationWithdrawal(request(undefined, "POST", "?owner=bad"), params, ports), 422);
  assert.equal(auth, 0);
  for (const body of ["{}", "null", "[]", JSON.stringify({ ...input, owner: "bad" }),
    `{"version":"${input.version}","version":"${input.version}","operationKey":"${input.operationKey}"}`,
    `{"version":"${input.version}","vers\\u0069on":"${input.version}"}`,
    JSON.stringify({ ...input, operationKey: 123 }), JSON.stringify({ ...input, operationKey: "bad" })])
    check(await handleEducationWithdrawal(request(body), params, ports), 422);
  check(await handleEducationWithdrawal(request(JSON.stringify({ ...input, version: "2026-02-31T02:00:00.000Z" })), params, ports), 409);
  check(await handleEducationWithdrawal(request(" ".repeat(1025)), params, ports), 413);
  assert.equal(writes, 0);
  const written = await handleEducationWithdrawal(request(), params, ports); check(written, 200);
  const dto = (await written.json()).data; assert.equal(dto.receipt.outcome, "WITHDRAWN"); assert.equal(writes, 1);
  for (const field of ["actorId", "attemptId", "storageKey", "fingerprint", "uploadOperationId", "identity", "bank", "notes"])
    assert.ok(!JSON.stringify(dto).includes(`"${field}"`));
  for (const status of [401, 403, 404, 409]) check(await handleEducationWithdrawal(request(), params, { ...ports,
    withdraw: async () => { throw new EducationEvidenceReservationError("Guard rejected", status); } }), status);
  const failed = await handleEducationWithdrawal(request(), params, { ...ports, withdraw: async () => { throw Error("PRIVATE_PROVIDER_DATA"); } });
  check(failed, 503); assert.ok(!(await failed.text()).includes("PRIVATE_PROVIDER_DATA"));
  const readParams = { workspaceSlug: params.workspaceSlug, educationId: params.educationId };
  check(await handleEducationWithdrawal(request("", "GET", `?operationKey=${input.operationKey}`), readParams, ports), 200);
  assert.equal(reads, 1);
  for (const query of ["", `?operationKey=${input.operationKey}&operationKey=${input.operationKey}`, `?operationKey=${input.operationKey}&owner=bad`])
    check(await handleEducationWithdrawal(request("", "GET", query), readParams, ports), 422);
  const abort = new AbortController(); abort.abort();
  check(await handleEducationWithdrawal(new Request("https://api.terraqoglobal.com/own", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(input), signal: abort.signal }), params, ports), 408);
  const started = performance.now();
  const stalled = new Request("https://api.terraqoglobal.com/own", { method: "POST", headers: { "content-type": "application/json" },
    body: new ReadableStream<Uint8Array>({ cancel: () => new Promise(() => undefined) }), duplex: "half" } as RequestInit);
  check(await handleEducationWithdrawal(stalled, params, ports), 408); assert.ok(performance.now() - started < 7000);
  console.log("PASS withdrawal HTTP controlled ports: auth before body, strict methods/IDs/query, unique two-string JSON fields, real1KiB/5s/abort/noncooperative cancel, canonical UTCms, private DTO/errors and independent null receipt. No SQL/store/HTTPS claimed.");
}
main().catch(() => { console.error("Withdrawal boundary test failed."); process.exitCode = 1; });
