import assert from "node:assert/strict";
import { createRequire } from "node:module";

// HTTP adapters only; authorization and rollback are covered by the real-PG suites.
async function main() {
  const require = createRequire(__filename), saved = new Map<string, NodeModule | undefined>();
  const replace = (specifier: string, exports: unknown) => {
    const id = require.resolve(specifier); saved.set(id, require.cache[id]);
    require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule;
  };
  class DiscoveryNeedsError extends Error { constructor(public status: number) { super("Denied"); } }
  class TerraqoMessagingError extends Error { constructor(public status: number) { super("Denied"); } }
  let denied = 401, calls = 0;
  replace("server-only", {});
  replace("../lib/prisma", { prisma: {} });
  replace("../lib/terraqo/discovery-needs", { DiscoveryNeedsError });
  replace("../lib/terraqo/messaging", { TerraqoMessagingError });
  replace("../lib/server/discovery-needs-auth", { requireDiscoveryWorkspaceActor: async () => { throw new DiscoveryNeedsError(denied); } });
  const mutation = async () => { calls++; throw new Error("Unauthenticated mutation reached"); };
  replace("../lib/terraqo/closure", { saveClosureDraft: mutation, submitClosure: mutation });
  replace("../lib/terraqo/collaboration", { reviseCollaborationProposal: mutation });
  const old = { closure: process.env.TERRAQO_CLOSURE_V1, collaboration: process.env.TERRAQO_COLLABORATION_V1 };
  try {
    process.env.TERRAQO_CLOSURE_V1 = "true";
    process.env.TERRAQO_COLLABORATION_V1 = "true";
    const routes = [await import("../app/api/v1/collaborations/[id]/closures/route"),
      await import("../app/api/v1/collaborations/[id]/closures/submit/route"),
      await import("../app/api/v1/collaborations/[id]/proposals/route")];
    for (denied of [401, 403]) for (const route of routes) {
      const response = await route.POST(new Request("https://example.test/private", { method: "POST", body: "not-json" }),
        { params: Promise.resolve({ id: "synthetic" }) });
      assert.equal(response.status, denied);
      assert.equal((await response.json()).error.code, denied === 401 ? "AUTH_REQUIRED" : "FORBIDDEN");
    }
    assert.equal(calls, 0);
    console.log("PASS closure/save/submit/proposal auth adapters: 401/403 before parsing or mutations (doubles)");
  } finally {
    for (const [key, value] of [["TERRAQO_CLOSURE_V1", old.closure], ["TERRAQO_COLLABORATION_V1", old.collaboration]])
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    for (const [id, value] of saved) { if (value) require.cache[id] = value; else delete require.cache[id]; }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
