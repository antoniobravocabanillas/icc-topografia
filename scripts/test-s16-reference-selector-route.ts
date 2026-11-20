import assert from "node:assert/strict";
import { createRequire } from "node:module";

// HTTP adapter verification uses doubles; real authorization/transactions are
// exercised independently by test-s16-reference-selector-postgres.ts.
async function main() {
  const require = createRequire(__filename), saved = new Map<string, NodeModule | undefined>();
  const replace = (specifier: string, exports: unknown) => {
    const id = require.resolve(specifier); saved.set(id, require.cache[id]);
    require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule;
  };
  class DiscoveryNeedsError extends Error { constructor(public status: number) { super("Denied"); } }
  class TerraqoMessagingError extends Error { constructor(public status: number) { super("Denied"); } }
  let authStatus = 200, serviceStatus = 200, calls = 0;
  let received: Record<string, unknown> = {};
  const source = { worklogRevisionId: "cltestrevision0000000000001", accessKind: "PUBLIC_CV", accessReferenceId: "cltestworklog00000000000001" };
  const item = { source, revisionNo: 1, label: "Referencia autorizada", fields: { summary: "Allowed" }, media: [] };
  replace("server-only", {});
  replace("../lib/prisma", { prisma: {} });
  replace("../lib/terraqo/discovery-needs", { DiscoveryNeedsError });
  replace("../lib/terraqo/messaging", { TerraqoMessagingError });
  replace("../lib/server/discovery-needs-auth", { requireDiscoveryWorkspaceActor: async () => {
    if (authStatus !== 200) throw new DiscoveryNeedsError(authStatus);
    return { session: { user: { id: "admin" } }, workspace: { id: "workspace" } };
  } });
  replace("../lib/server/authz", { requireUser: async () => authStatus === 401
    ? { response: new Response(null, { status: 401 }) } : { session: { user: { id: "professional" } } } });
  replace("../lib/terraqo/closure-reference-access", {
    listClosureReferenceCandidates: async (_tx: unknown, input: Record<string, unknown>) => {
      calls++; received = input; if (serviceStatus !== 200) throw new TerraqoMessagingError(serviceStatus);
      return { items: [item], nextCursor: null };
    },
    getClosureReferenceDetail: async (_tx: unknown, input: Record<string, unknown>) => {
      calls++; received = input; if (serviceStatus !== 200) throw new TerraqoMessagingError(serviceStatus);
      return item;
    },
  });
  const flag = process.env.TERRAQO_CLOSURE_V1;
  try {
    const list = await import("../app/api/v1/collaborations/[id]/closure-references/route");
    const detail = await import("../app/api/v1/collaborations/[id]/closure-references/[revisionId]/route");
    const send = (query = "view=workspace") => list.GET(new Request("https://example.test/references?" + query), { params: Promise.resolve({ id: "collaboration" }) });
    const read = (query = "view=workspace&accessKind=PUBLIC_CV&accessReferenceId=" + source.accessReferenceId) => detail.GET(new Request("https://example.test/references/revision?" + query),
      { params: Promise.resolve({ id: "collaboration", revisionId: source.worklogRevisionId }) });
    const status = (response: Response, expected: number) => {
      assert.equal(response.status, expected); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    };
    process.env.TERRAQO_CLOSURE_V1 = "false";
    status(await send(), 404); status(await read(), 404); assert.equal(calls, 0);
    process.env.TERRAQO_CLOSURE_V1 = "true";
    for (const denied of [401, 403]) { authStatus = denied; status(await send(), denied === 403 ? 404 : 401); status(await read(), denied === 403 ? 404 : 401); }
    status(await send("view=workspace&limit=31"), 422);
    status(await send("view=workspace&workspaceId=forged"), 422);
    status(await read("view=professional&referenceId=cltestreference00000000001&accessKind=PUBLIC_CV"), 422);
    authStatus = 401; status(await send(""), 401); assert.equal(calls, 0);
    authStatus = 200;
    const response = await send(); status(response, 200);
    assert.deepEqual(await response.json(), { data: { items: [item], nextCursor: null } });
    assert.deepEqual({ ...received }, { userId: "admin", workspaceId: "workspace", collaborationId: "collaboration", limit: 20, cursor: undefined });
    status(await read(), 200); assert.deepEqual(received.source, source);
    status(await read("referenceId=cltestreference00000000001"), 200);
    assert.equal(received.userId, "professional"); assert.equal(received.workspaceId, undefined);
    for (const denied of [404, 409]) { serviceStatus = denied; status(await send(), denied); status(await read(), denied); }
    console.log("PASS reference HTTP adapters: flag/auth/schema, trusted actor, envelope, saved/candidate descriptor routing, no-store on success/failure (service doubles)");
  } finally {
    if (flag === undefined) delete process.env.TERRAQO_CLOSURE_V1; else process.env.TERRAQO_CLOSURE_V1 = flag;
    for (const [id, value] of saved) { if (value) require.cache[id] = value; else delete require.cache[id]; }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
