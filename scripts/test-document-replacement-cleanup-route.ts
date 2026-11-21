import assert from "node:assert/strict";
import { createRequire } from "node:module";

async function main() {
  const require = createRequire(import.meta.url);
  const saved = new Map<string, NodeModule | undefined>();
  const mock = (name: string, exports: object) => {
    const id = require.resolve(name); saved.set(id, require.cache[id]);
    require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule;
  };
  let dispatches = 0, storage = 0, fail = false, isolated = true;
  const secret = "synthetic-only-secret-00000000000000";
  mock("../lib/server/document-replacement-cleanup.ts", { dispatchDocumentReplacementCleanup: async () => {
    dispatches++; if (fail) throw Error("private-key-must-not-leak");
    return { completed: 1, retained: 0, retry: 0, blocked: 0, skipped: 0, cleaned: 0, pending: 0, deferred: 0 };
  } });
  mock("../lib/server/media.ts", { getProfessionalDocumentStore: () => { storage++; return {}; } });
  mock("../lib/terraqo/scheduled-job-targets.ts", { resolveDocumentCleanupSecret: () => secret,
    resolveScheduledJobTargets: () => { if (!isolated) throw Error("PRIVATE_DEPLOYMENT_CONFIG"); return {}; } });
  const flag = process.env.TERRAQO_DOCUMENT_LIFECYCLE_V1;
  const originalInfo = console.info, originalWarn = console.warn;
  const logs: unknown[][] = [];
  const request = (auth = true) => new Request("https://fixture.invalid/api/internal/document-replacement-cleanup", {
    method: "POST", headers: auth ? { authorization: `Bearer ${secret}` } : {},
  });
  try {
    console.info = (...args) => logs.push(args); console.warn = (...args) => logs.push(args);
    const { POST } = await import("../app/api/internal/document-replacement-cleanup/route");
    delete process.env.TERRAQO_DOCUMENT_LIFECYCLE_V1;
    assert.equal((await POST(request())).status, 404);
    process.env.TERRAQO_DOCUMENT_LIFECYCLE_V1 = "true";
    assert.equal((await POST(request(false))).status, 401);
    isolated = false; assert.equal((await POST(request())).status, 503);
    assert.equal(storage, 0); assert.equal(dispatches, 0);
    isolated = true;
    const result = await POST(request());
    assert.equal(result.status, 200); assert.equal((await result.json()).completed, 1);
    assert.equal(result.headers.get("cache-control"), "no-store");
    fail = true;
    const unavailable = await POST(request()); assert.equal(unavailable.status, 503);
    assert.ok(!JSON.stringify(logs).includes("private-key")); assert.ok(!JSON.stringify(logs).includes(secret));
    assert.ok(!(await unavailable.text()).includes("private-key"));
    assert.equal(dispatches, 2);
  } finally {
    console.info = originalInfo; console.warn = originalWarn;
    if (flag === undefined) delete process.env.TERRAQO_DOCUMENT_LIFECYCLE_V1; else process.env.TERRAQO_DOCUMENT_LIFECYCLE_V1 = flag;
    for (const [id, module] of saved) { if (module) require.cache[id] = module; else delete require.cache[id]; }
  }
  console.log("PASS cleanup API: disabled gate, authentication/isolation before storage, aggregate-only results and sanitized failure");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
