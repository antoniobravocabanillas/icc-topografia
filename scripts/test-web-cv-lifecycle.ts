import assert from "node:assert/strict";
import { WebCvPublicationController } from "../lib/terraqo/cv-publication-controller";
import { guardCvUnload, isCvDocumentEntry, readCvSessionOwner, WebCvSessionBoundary } from "../lib/terraqo/cv-publication-lifecycle";
import { readWebCvPage, WebCvRequestError } from "../lib/terraqo/cv-publication-client";
const deferred = () => { let resolve!: (value: string | null) => void;
  const promise = new Promise<string | null>(done => { resolve = done; }); return { promise, resolve }; };
async function main() {
  const page = readWebCvPage({ schemaVersion: 1, workspaceSlug: "icc-topografia", current: {
    version: "2026-10-07T00:00:00.000Z", username: "synthetic-owner", published: false, url: null }, receipt: null }, "icc-topografia");
  const controller = new WebCvPublicationController({ load: async () => page, reconcile: async () => page,
    submit: async () => { throw new WebCvRequestError("uncertain"); } }, () => "a".repeat(32));
  let owner: string | null = "owner", fails = false, signals = 0;
  const scope = new WebCvSessionBoundary("owner", controller, async () => { if (fails) throw Error(); return owner; }, () => signals++);
  assert.equal(scope.ready, false); await scope.check(); assert.equal(scope.ready, true);
  await controller.load(); controller.prepare("PUBLISH", true); await controller.confirm(); const pending = controller.getSnapshot().pending;
  let prevented = false; const event = { preventDefault: () => { prevented = true; }, returnValue: "old" };
  guardCvUnload(controller, event as unknown as BeforeUnloadEvent); assert.equal(prevented, true); assert.equal(event.returnValue, "");
  fails = true; await scope.check(); assert.equal(scope.ready, false); assert.equal(scope.invalid, false);
  assert.equal(controller.getSnapshot().pending, pending); fails = false; await scope.check(); assert.equal(scope.ready, true);
  owner = "other"; await scope.check(); assert.equal(scope.invalid, true); assert.equal(controller.getSnapshot().page, null);
  assert.equal(controller.getSnapshot().pending, null); owner = "owner"; await scope.check(); assert.equal(scope.ready, false);
  const first = deferred(), second = deferred(); let reads = 0;
  const newer = new WebCvSessionBoundary("owner", controller, () => (++reads === 1 ? first.promise : second.promise), () => {});
  const one = newer.check(), two = newer.check(); second.resolve(null); await two; first.resolve("owner"); await one;
  assert.equal(newer.invalid, true); assert.equal(newer.ready, false);
  const late = deferred(); const closed = new WebCvSessionBoundary("owner", controller, () => late.promise, () => {});
  const check = closed.check(); closed.dispose(); late.resolve("owner"); await check; assert.equal(closed.ready, false);
  const hidden = deferred(); const paused = new WebCvSessionBoundary("owner", controller, () => hidden.promise, () => {});
  const hiddenCheck = paused.check(); paused.pause(); hidden.resolve("owner"); await hiddenCheck; assert.equal(paused.ready, false);
  assert.ok(signals > 0);
  assert.equal(isCvDocumentEntry("https://portal.test/perfil", "https://portal.test/cuenta/publicacion-cv"), false);
  assert.equal(isCvDocumentEntry("https://portal.test/cuenta/publicacion-cv?workspace=a", "https://portal.test/cuenta/publicacion-cv?workspace=b"), false);
  assert.equal(isCvDocumentEntry("https://portal.test/cuenta/publicacion-cv", "https://portal.test/cuenta/publicacion-cv#review"), true);
  assert.equal(isCvDocumentEntry(undefined, "https://portal.test/cuenta/publicacion-cv"), false);
  const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
  const reader = (response: Response) => readCvSessionOwner(async (_url, init) => {
    assert.equal(init?.credentials, "same-origin"); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store"); return response;
  });
  assert.equal(await reader(json({ user: { id: "owner", email: "synthetic@example.test" } })), "owner");
  assert.equal(await reader(json(null)), null); assert.equal(await reader(new Response(null, { status: 401 })), null);
  await assert.rejects(reader(new Response(null, { status: 500 })));
  await assert.rejects(reader(json({ user: { id: "../../other" } })));
  await assert.rejects(reader(json({ user: { id: "owner" }, long: "x".repeat(16384) })));
  console.log("PASS web CV lifecycle: newest session result wins, uncertain network retains command/unload guard, changed owner/closed scope discard private state, document entry and bounded owner reader.");
}
main().catch(() => { console.error("FAIL web CV lifecycle."); process.exitCode = 1; });
