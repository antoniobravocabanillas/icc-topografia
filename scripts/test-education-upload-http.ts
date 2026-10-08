import assert from "node:assert/strict";
import { handleEducationUpload } from "../lib/server/education-upload-http";
import { parseNativeEducationEvidence, EducationPayloadError } from "../lib/server/native-education-evidence-payload";
import { EducationEvidenceReservationError } from "../lib/server/education-evidence-reservation";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";

async function main() {
  const params = { workspaceSlug: "icc-topografia", educationId: "own-education" };
  const token = { sub: "own", workspaceId: "workspace", workspaceSlug: params.workspaceSlug, role: "PROFESSIONAL",
    jti: "grant", iat: 1, exp: Math.floor(Date.now() / 1000) + 3600 } as WorkspacePortalToken;
  const request = (method = "POST", query = "") => new Request(`https://example.test/evidence${query}`, { method });
  let uploads = 0, auths = 0;
  const now = new Date("2026-10-07T00:00:00.000Z"), operationKey = "a".repeat(32);
  const ports = { authenticate: async () => { auths++; return token; }, upload: async () => {
    uploads++; return { kind: "committed" as const, cleanupAttemptId: null, currentVersion: now.toISOString(), receipt: {
      id: "receipt", actorId: "private-actor", educationId: params.educationId, operationKey, evidenceId: "file",
      fingerprint: "private-hash", fileName: "propio.png", contentType: "image/png", size: 8,
      originalVersion: now, resultVersion: now, createdAt: now } };
  } };
  const untouched = request(); Object.defineProperty(untouched, "body", { get() { throw Error("BODY_BEFORE_AUTH"); } });
  assert.equal((await handleEducationUpload(untouched, params, { ...ports, authenticate: async () => null })).status, 401);
  assert.equal((await handleEducationUpload(untouched, params, { ...ports, authenticate: async () => ({ ...token, jti: undefined }) })).status, 401);
  assert.equal((await handleEducationUpload(untouched, params, { ...ports, authenticate: async () => ({ ...token, exp: 1 }) })).status, 401);
  assert.equal(uploads, 0);
  assert.equal((await handleEducationUpload(request("PUT"), params, ports)).headers.get("allow"), "GET, POST");
  assert.equal((await handleEducationUpload(request(), { ...params, educationId: "../bad" }, ports)).status, 404);
  assert.equal((await handleEducationUpload(request("POST", "?owner=own"), params, ports)).status, 422);
  assert.equal(auths, 0);
  const response = await handleEducationUpload(request(), params, ports);
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const dto = await response.json(); assert.equal(dto.data.receipt.operationKey, operationKey);
  for (const key of ["actorId", "educationId", "fingerprint", "cleanupAttemptId", "id", "storageKey"])
    assert.ok(!Object.keys(dto.data.receipt).includes(key));
  for (const status of [401, 403, 404, 409, 429]) {
    assert.equal((await handleEducationUpload(request(), params, { ...ports, upload: async () => {
      throw new EducationEvidenceReservationError("private-safe", status);
    } })).status, status);
  }
  assert.equal((await handleEducationUpload(request(), params, { ...ports, upload: async () => { throw new EducationPayloadError("format", 415); } })).status, 415);
  const failure = await handleEducationUpload(request(), params, { ...ports, upload: async () => { throw Error("PRIVATE_PROVIDER_SECRET"); } });
  assert.equal(failure.status, 503); assert.ok(!(await failure.text()).includes("PRIVATE_PROVIDER_SECRET"));
  const invalid = new Request("https://example.test/evidence", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=own", "content-length": String(4 * 1024 * 1024 + 65537) }, body: "x" });
  assert.equal((await handleEducationUpload(invalid, params, { ...ports, upload: async input => {
    await parseNativeEducationEvidence(input); throw Error("INVALID_MUST_NOT_PASS");
  } })).status, 413);
  console.log("PASS upload HTTP boundary: auth before body/legacy/expiry, method/path/query before lookup, minimal receipt, private errors and parser size propagation. Controlled ports only.");
}
main().catch(() => { console.error("FAIL upload HTTP boundary"); process.exitCode = 1; });
