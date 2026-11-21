import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { prisma } from "../lib/prisma";

async function main() {
  const require = createRequire(import.meta.url);
  const saved = new Map<string, NodeModule | undefined>();
  const mock = (name: string, exports: object) => {
    const id = require.resolve(name); saved.set(id, require.cache[id]);
    require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule;
  };
  let authenticated = true, withdrawals = 0, replacements = 0;
  let replacementFailure: Error | null = null;
  mock("../lib/server/authz.ts", { requireUser: async () => authenticated
    ? { session: { user: { id: "session-owner" } } } : { response: new Response(null, { status: 401 }) } });
  const realLifecycle = require("../lib/server/professional-document-lifecycle.ts");
  mock("../lib/server/professional-document-lifecycle.ts", { ...realLifecycle,
    withdrawProfessionalDocumentInTransaction: async (_tx: unknown, input: Record<string, unknown>) => {
      assert.equal(input.actorId, "session-owner"); assert.equal(input.documentId, "document"); withdrawals++;
      return { id: "document", lifecycleVersion: 2, replayed: false };
    } });
  mock("../lib/server/document-replacement-upload.ts", {
    ReplacementUploadUnconfirmed: class extends Error {},
    uploadDocumentReplacement: async (_db: unknown, _store: unknown, input: Record<string, unknown>) => {
      if (replacementFailure) throw replacementFailure;
      assert.equal(input.actorId, "session-owner"); assert.ok(input.file instanceof File);
      assert.equal(input.expectedVersion, 1); replacements++; return { id: "successor", replayed: false };
    },
  });
  mock("../lib/server/media.ts", { getProfessionalDocumentStore: () => ({}) });
  const transaction = prisma.$transaction;
  prisma.$transaction = (async (callback: (tx: object) => unknown) => callback({})) as typeof transaction;
  const flag = process.env.TERRAQO_DOCUMENT_LIFECYCLE_V1;
  const url = "https://fixture.invalid/api/documents/document";
  const headers = { origin: "https://fixture.invalid", "content-type": "application/json" };
  const command = { expectedVersion: 1, operationKey: "synthetic-operation-0001" };
  const request = (body: unknown = command, overrides: Record<string, string> = {}) => new Request(url, {
    method: "POST", headers: { ...headers, ...overrides }, body: JSON.stringify(body),
  });
  try {
    const { documentLifecycleMutation: mutate } = await import("../lib/server/document-lifecycle-http");
    delete process.env.TERRAQO_DOCUMENT_LIFECYCLE_V1;
    assert.equal((await mutate(request(), "document", "withdraw")).status, 404);
    process.env.TERRAQO_DOCUMENT_LIFECYCLE_V1 = "true";
    authenticated = false;
    assert.equal((await mutate(request(), "document", "withdraw")).status, 401);
    authenticated = true;
    assert.equal((await mutate(request(command, { origin: "https://attacker.invalid" }), "document", "withdraw")).status, 403);
    assert.equal((await mutate(request(command, { "content-type": "text/plain" }), "document", "withdraw")).status, 415);
    assert.equal((await mutate(request({ ...command, actorId: "other" }), "document", "withdraw")).status, 422);
    assert.equal((await mutate(request({ ...command, expectedVersion: 0 }), "document", "withdraw")).status, 422);
    assert.equal((await mutate(request({ ...command, operationKey: "x".repeat(3000) }, { "content-length": "1" }), "document", "withdraw")).status, 413);
    assert.equal(withdrawals, 0);
    const response = await mutate(request(), "document", "withdraw");
    assert.equal(response.status, 200); assert.equal(withdrawals, 1);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const form = () => {
      const data = new FormData();
      data.set("expectedVersion", "1"); data.set("operationKey", command.operationKey);
      data.set("file", new File(["%PDF-synthetic"], "test.pdf", { type: "application/pdf" }));
      return data;
    };
    const multipart = (body: FormData) => new Request(url, { method: "POST", headers: { origin: headers.origin }, body });
    for (const extra of ["file", "actorId", "storageKey"]) {
      const body = form(); body.append(extra, "untrusted");
      assert.equal((await mutate(multipart(body), "document", "replace")).status, 422);
    }
    const invalid = form(); invalid.set("expectedVersion", "1e0");
    assert.equal((await mutate(multipart(invalid), "document", "replace")).status, 422);
    assert.equal(replacements, 0);
    assert.equal((await mutate(multipart(form()), "document", "replace")).status, 200);
    assert.equal(replacements, 1);
    const originalError = console.error;
    const diagnostics: string[] = [];
    try {
      console.error = (...args: unknown[]) => { diagnostics.push(args.join(" ")); };
      replacementFailure = Object.assign(new Error("private SQL and filename must not escape"), { code: "P2028" });
      const failed = await mutate(multipart(form()), "document", "replace");
      assert.equal(failed.status, 500);
      const body = await failed.json();
      assert.match(body.requestId, /^[0-9a-f-]{36}$/);
      assert.equal(failed.headers.get("x-request-id"), body.requestId);
      assert.deepEqual(JSON.parse(diagnostics[0]), { event: "document-lifecycle-failure", requestId: body.requestId, action: "replace", phase: "replacement", code: "P2028" });
      assert.ok(!JSON.stringify(body).includes("private SQL"));
      assert.ok(!diagnostics.join("").includes("private SQL"));
    } finally { console.error = originalError; replacementFailure = null; }
    console.log("PASS lifecycle HTTP: disabled gate, authentication, origin, strict commands, actual-byte limit, duplicate multipart fields and server-owned actor");
  } finally {
    prisma.$transaction = transaction;
    if (flag === undefined) delete process.env.TERRAQO_DOCUMENT_LIFECYCLE_V1; else process.env.TERRAQO_DOCUMENT_LIFECYCLE_V1 = flag;
    for (const [id, module] of saved) { if (module) require.cache[id] = module; else delete require.cache[id]; }
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
