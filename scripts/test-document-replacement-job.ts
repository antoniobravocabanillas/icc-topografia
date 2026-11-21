import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { build } from "esbuild";
import { documentReplacementJobAuthorized, queueDocumentReplacementCleanup, runDocumentReplacementCleanupWorker } from "../lib/terraqo/document-replacement-job";

async function main() {
  const secret = randomBytes(32).toString("hex");
  let calls = 0, status = 202;
  const ports = { secret, api: "https://fixture.invalid/api/internal/document-replacement-cleanup",
    worker: "https://fixture.invalid/.netlify/functions/document-replacement-cleanup-background",
    fetch: (async (_url: unknown, init?: RequestInit) => {
      calls++; assert.equal(init?.redirect, "error"); assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${secret}`);
      assert.ok(init?.signal); return new Response(null, { status });
    }) as typeof fetch };
  const request = (authorization = `Bearer ${secret}`, method = "POST") => new Request(ports.worker, { method, headers: { authorization } });
  assert.equal(documentReplacementJobAuthorized(request(), undefined), false);
  assert.equal(documentReplacementJobAuthorized(request(), "short"), false);
  assert.equal(await runDocumentReplacementCleanupWorker(request("wrong"), ports), false);
  assert.equal(await runDocumentReplacementCleanupWorker(request(`Bearer ${secret}`, "GET"), ports), false);
  assert.equal(calls, 0);
  await queueDocumentReplacementCleanup(ports); assert.equal(calls, 1);
  status = 200;
  await assert.rejects(queueDocumentReplacementCleanup(ports), /JOB_NOT_QUEUED/);
  assert.equal(await runDocumentReplacementCleanupWorker(request(), ports), true);
  status = 503;
  await assert.rejects(runDocumentReplacementCleanupWorker(request(), ports), /JOB_CLEANUP_RETRY/);
  await assert.rejects(queueDocumentReplacementCleanup({ ...ports, secret: undefined }), /JOB_NOT_CONFIGURED/);
  await assert.rejects(queueDocumentReplacementCleanup({ ...ports, fetch: () => new Promise<Response>(() => undefined) }), /JOB_TIMEOUT/);

  // Bundle the actual provider entry points; they must not import server-only/Prisma.
  const functions = [];
  for (const name of ["document-replacement-cleanup", "document-replacement-cleanup-background"]) {
    const output = await build({ entryPoints: [`netlify/functions/${name}.mts`], bundle: true, platform: "node", format: "esm", write: false });
    functions.push(await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`));
  }
  const names = ["TERRAQO_DOCUMENT_LIFECYCLE_V1", "URL", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_API_URL", "PLATFORM_STAGING_CONFIRM", "TERRAQO_STAGING_DOCUMENT_CLEANUP_SECRET"];
  const saved = names.map(name => process.env[name]); const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = ports.fetch;
    delete process.env.TERRAQO_DOCUMENT_LIFECYCLE_V1;
    const before = calls;
    assert.equal((await functions[0].default()).status, 204);
    await functions[1].default(request()); assert.equal(calls, before);
    process.env.TERRAQO_DOCUMENT_LIFECYCLE_V1 = "true";
    process.env.URL = process.env.NEXT_PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_API_URL = "https://fixture.invalid";
    process.env.PLATFORM_STAGING_CONFIRM = "staging";
    process.env.TERRAQO_STAGING_DOCUMENT_CLEANUP_SECRET = secret;
    status = 202; assert.equal((await functions[0].default()).status, 200);
    status = 200; await functions[1].default(request());
    assert.equal(calls, before + 2);
    await functions[1].default(request("wrong")); assert.equal(calls, before + 2);
    process.env.NEXT_PUBLIC_API_URL = "https://api.terraqoglobal.com";
    assert.equal((await functions[0].default()).status, 503);
    assert.equal(calls, before + 2, "staging must not invoke production");
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((name, index) => { if (saved[index] === undefined) delete process.env[name]; else process.env[name] = saved[index]; });
  }
  console.log("PASS document cleanup scheduling: constant-time auth, no unauthenticated I/O, exact statuses, bounded transport, actual bundled entrypoints, disabled gate and staging isolation");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
