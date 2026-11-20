import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

// HTTP boundary test with explicit auth/service doubles. Transactional behavior
// is tested separately against the real, isolated PostgreSQL service.
async function main() {
  const require = createRequire(__filename);
  const saved = new Map<string, NodeModule | undefined>();
  const replace = (specifier: string, exports: unknown) => {
    const id = require.resolve(specifier);
    saved.set(id, require.cache[id]);
    require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule;
  };
  class DiscoveryNeedsError extends Error { constructor(message: string, public status: number) { super(message); } }
  class TerraqoEntitlementError extends Error { constructor(public code: string, message: string, public status: number) { super(message); } }
  class TerraqoMessagingError extends Error { constructor(message: string, public status: number) { super(message); } }
  let authStatus = 200, entitled = true, serviceStatus = 200, calls = 0, authCalls = 0;
  let received: unknown;
  const dto = { id: "collaboration", workspaceId: "authorized-workspace", status: "CANCELLED", version: 2,
    cancelledAt: "2026-11-20T00:00:00.000Z", cancellationReason: "Reason" };
  replace("server-only", {});
  replace("../lib/server/discovery-needs-auth", { requireDiscoveryWorkspaceActor: async () => {
    authCalls++;
    if (authStatus !== 200) throw new DiscoveryNeedsError("Denied", authStatus);
    return { session: { user: { id: "authorized-actor" } }, workspace: { id: "authorized-workspace" } };
  } });
  replace("../lib/terraqo/discovery-needs", { DiscoveryNeedsError });
  replace("../lib/terraqo/messaging", { TerraqoMessagingError });
  replace("../lib/terraqo/product-entitlements", { TerraqoEntitlementError, requireWorkspacePilotFeature: async (...args: unknown[]) => {
    assert.deepEqual(args, ["authorized-actor", "authorized-workspace", "collaboration_closure"]);
    if (!entitled) throw new TerraqoEntitlementError("FEATURE_NOT_ENTITLED", "Denied", 403);
  } });
  replace("../lib/terraqo/collaboration", { cancelCollaboration: async (input: unknown) => {
    calls++; received = input;
    if (serviceStatus !== 200) throw new TerraqoMessagingError("Service conflict", serviceStatus);
    return dto;
  } });
  const originalFlag = process.env.TERRAQO_COLLABORATION_V1;
  try {
    const { POST } = await import("../app/api/v1/collaborations/[id]/cancel/route");
    const operationKey = randomUUID();
    const send = (body: string | Uint8Array = JSON.stringify({ reason: "  Reason  ", expectedVersion: 1 }),
      headers: Record<string, string> = { "Idempotency-Key": operationKey }) => POST(
      new Request("https://example.test/api/v1/collaborations/collaboration/cancel", { method: "POST", headers, body: body as BodyInit }),
      { params: Promise.resolve({ id: "collaboration" }) });
    process.env.TERRAQO_COLLABORATION_V1 = "false";
    assert.equal((await send()).status, 404); assert.equal(authCalls, 0);
    process.env.TERRAQO_COLLABORATION_V1 = "true";
    for (const denied of [401, 403]) { authStatus = denied; assert.equal((await send()).status, denied); }
    authStatus = 200;
    const invalidHeaders: Record<string, string>[] = [{}, { "Idempotency-Key": "invalid" }];
    for (const headers of invalidHeaders) assert.equal((await send(undefined, headers)).status, 400);
    assert.equal((await send("{")).status, 400);
    assert.equal((await send(new Uint8Array([0xff]))).status, 400);
    assert.equal((await send(undefined, { "Idempotency-Key": operationKey, "Content-Length": "8193" })).status, 413);
    assert.equal((await send(JSON.stringify({ reason: "x", expectedVersion: 1, padding: "x".repeat(8192) }))).status, 413);
    // A lying small Content-Length cannot bypass the stream byte limit.
    assert.equal((await send("x".repeat(8193), { "Idempotency-Key": operationKey, "Content-Length": "1" })).status, 413);
    for (const body of [{ reason: " ", expectedVersion: 1 }, { reason: "x".repeat(1201), expectedVersion: 1 },
      { reason: "x" }, { expectedVersion: 1 }, { reason: "x", expectedVersion: 0 }])
      assert.equal((await send(JSON.stringify(body))).status, 422);
    entitled = false; assert.equal((await send()).status, 403); entitled = true;
    assert.equal(calls, 0, "Rejected requests must never reach cancellation service");
    const response = await send(JSON.stringify({ reason: " Reason ", expectedVersion: 1,
      userId: "forged", workspaceId: "forged", status: "CLOSED" }));
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { data: dto });
    assert.deepEqual(received, { userId: "authorized-actor", workspaceId: "authorized-workspace", collaborationId: "collaboration",
      operationKey, payload: { reason: "Reason", expectedVersion: 1 } });
    for (const status of [403, 404, 409]) { serviceStatus = status; assert.equal((await send()).status, status); }
    console.log("PASS cancellation HTTP boundary: flags/auth/pilot; key/schema; invalid UTF-8/JSON; declared and streamed 8KiB limit; actor/tenant from auth; 200 DTO and 403/404/409 mapping (auth/service doubles)");
  } finally {
    if (originalFlag === undefined) delete process.env.TERRAQO_COLLABORATION_V1;
    else process.env.TERRAQO_COLLABORATION_V1 = originalFlag;
    for (const [id, value] of saved) { if (value) require.cache[id] = value; else delete require.cache[id]; }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
