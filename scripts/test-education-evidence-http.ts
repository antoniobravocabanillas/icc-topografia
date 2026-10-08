import assert from "node:assert/strict";
import { handleEducationEvidenceRead } from "../lib/server/education-evidence-http";
import { EducationEvidenceReservationError } from "../lib/server/education-evidence-reservation";
import { PrivateEvidenceReadError } from "../lib/server/private-evidence-stream";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";

async function main() {
  let auth = 0, reads = 0, downloads = 0;
  let token: WorkspacePortalToken | null = { sub: "own", workspaceId: "workspace", workspaceSlug: "icc-topografia",
    role: "PROFESSIONAL", iat: 1, exp: 9999999999, jti: "own-grant" };
  let failure: Error | undefined;
  const params = { workspaceSlug: "icc-topografia", educationId: "own-education" };
  const request = (query = "") => new Request(`https://example.invalid/evidence${query}`);
  const ports = { authenticate: async () => { auth++; return token; },
    read: async () => { reads++; if (failure) throw failure; return { current: { educationId: "own-education",
      version: "2026-10-07T00:00:00.000Z", verificationStatus: "APPROVED" }, files: [], receipt: null }; },
    download: async () => { downloads++; if (failure) throw failure; return new Response(Uint8Array.from([1, 2, 3]), {
      headers: { "content-disposition": "attachment", "content-type": "image/png" } }); } };
  const handle = (query = "", download = false) => handleEducationEvidenceRead(request(query), {
    ...params, ...(download ? { evidenceId: "own-file" } : {}) }, ports);
  for (const query of ["?owner=own", "?storageKey=x", "?operationKey=", "?operationKey=bad",
    `?operationKey=${"a".repeat(32)}&operationKey=${"a".repeat(32)}`]) assert.equal((await handle(query)).status, 422);
  assert.equal((await handle("?operationKey=" + "a".repeat(32), true)).status, 422);
  assert.equal((await handleEducationEvidenceRead(request(), { ...params, workspaceSlug: "../bad" }, ports)).status, 404);
  assert.equal((await handleEducationEvidenceRead(request(), { ...params, educationId: "x".repeat(101) }, ports)).status, 404);
  assert.equal(auth + reads + downloads, 0);
  token = null; assert.equal((await handle()).status, 401); assert.equal(reads, 0);
  token = { sub: "own", workspaceId: "workspace", workspaceSlug: "icc-topografia", role: "PROFESSIONAL", iat: 1, exp: 9999999999 };
  assert.match((await (await handle()).json()).error.message, /iniciar tu sesión/); assert.equal(reads, 0);
  token.jti = "own-grant";
  const list = await handle("?operationKey=" + "a".repeat(32)); assert.equal(list.status, 200);
  assert.equal((await list.json()).data.receipt, null); assert.equal(downloads, 0);
  const file = await handle("", true); assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [1, 2, 3]);
  assert.equal(file.headers.get("content-disposition"), "attachment");
  for (const error of [new EducationEvidenceReservationError("Revocada", 401), new EducationEvidenceReservationError("Módulo denegado", 403),
    new PrivateEvidenceReadError("Referencia retirada", 404), new PrivateEvidenceReadError("Tiempo agotado", 504), Error("PRIVATE_PROVIDER_DETAILS")]) {
    failure = error;
    const response = await handle("", true);
    assert.equal(response.status, "status" in error ? error.status : 503);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.ok(!(await response.text()).includes("PRIVATE_PROVIDER_DETAILS"));
  }
  assert.equal((await handleEducationEvidenceRead(new Request("https://example.invalid", { method: "POST" }), params, ports)).status, 405);
  console.log("PASS controlled owner HTTP read boundary: strict params/query before I/O, authentication/legacy grant, null observation, protected read, bounded reader errors/private headers, no upload port or private diagnostics.");
}
main().catch(() => { console.error("Owner HTTP boundary test failed; private diagnostics suppressed."); process.exitCode = 1; });
