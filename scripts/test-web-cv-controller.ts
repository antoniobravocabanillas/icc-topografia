import assert from "node:assert/strict";
import { readWebCvPage, type WebCvCommand, WebCvRequestError } from "../lib/terraqo/cv-publication-client";
import { WebCvPublicationController, type WebCvPublicationPort } from "../lib/terraqo/cv-publication-controller";

const version = "2026-10-07T01:00:00.000Z", later = "2026-10-07T01:00:01.000Z";
function page(command?: WebCvCommand, published = false) {
  return readWebCvPage({ schemaVersion: 1, workspaceSlug: "icc-topografia", current: {
    version: command ? later : version, username: "fixture-cv", published, url: published ? "https://terraqoglobal.com/cv/fixture-cv" : null,
  }, receipt: command ? { operationKey: command.operationKey, action: command.action, version: later,
    published: command.action === "PUBLISH", username: "fixture-cv", confirmedAt: later } : null }, "icc-topografia", command?.operationKey);
}
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
async function main() {
  let writes = 0, keys = 0, checks = 0;
  let submitted: WebCvCommand | null = null;
  let fail: "uncertain" | "conflict" | null = null;
  let result = page();
  const api: WebCvPublicationPort = {
    load: async () => result,
    reconcile: async key => { checks++; assert.equal(key, submitted!.operationKey); return result; },
    submit: async command => { writes++; submitted = command; if (fail) throw new WebCvRequestError(fail); return page(command); },
  };
  const controller = new WebCvPublicationController(api, () => (++keys).toString(16).padStart(32, "0"));
  let signals = 0; const unsubscribe = controller.subscribe(() => signals++);
  await controller.load(); assert.ok(Object.isFrozen(controller.getSnapshot()));
  assert.equal(controller.prepare("PUBLISH"), false); assert.equal(keys, 0);
  assert.equal(controller.prepare("PUBLISH", true), true); controller.cancelReview(); assert.equal(writes, 0);
  assert.equal(controller.prepare("PUBLISH", true), true);
  const reviewed = controller.getSnapshot().review!; fail = "uncertain";
  await Promise.all([controller.confirm(), controller.confirm()]); assert.equal(writes, 1);
  assert.equal(controller.getSnapshot().pending, reviewed); assert.equal(controller.getSnapshot().phase, "uncertain");
  await controller.load(); assert.equal(controller.getSnapshot().pending, reviewed);
  await controller.reconcile(); assert.equal(checks, 1); assert.equal(writes, 1);
  assert.equal(controller.getSnapshot().phase, "uncertain"); assert.equal(controller.getSnapshot().pending, reviewed);
  fail = null; await controller.resend(); assert.equal(writes, 2); assert.equal(submitted, reviewed);
  assert.equal(controller.getSnapshot().phase, "idle"); assert.equal(controller.getSnapshot().pending, null);
  assert.equal(controller.getSnapshot().page!.current.published, false); // Historic receipt never reactivates a withdrawn CV.
  unsubscribe(); const before = signals; controller.invalidate(); assert.equal(signals, before);
  assert.equal(controller.getSnapshot().page, null); assert.equal(controller.getSnapshot().phase, "invalid");

  const inFlight = deferred<ReturnType<typeof page>>();
  const late = new WebCvPublicationController({ load: async () => page(), reconcile: async () => page(), submit: async () => inFlight.promise }, () => "b".repeat(32));
  await late.load(); late.prepare("PUBLISH", true); const pending = late.confirm(); late.invalidate();
  inFlight.resolve(page(reviewed, true)); await pending; assert.equal(late.getSnapshot().page, null); assert.equal(late.getSnapshot().pending, null);

  fail = "conflict"; result = page();
  const conflict = new WebCvPublicationController(api, () => "c".repeat(32));
  await conflict.load(); conflict.prepare("PUBLISH", true); await conflict.confirm();
  assert.equal(conflict.getSnapshot().page, null); assert.equal(conflict.getSnapshot().pending, null);
  assert.equal(conflict.getSnapshot().failure, "conflict"); fail = null; await conflict.load();
  assert.equal(conflict.getSnapshot().failure, null);

  fail = "uncertain";
  const confirmed = new WebCvPublicationController(api, () => "d".repeat(32));
  await confirmed.load(); confirmed.prepare("PUBLISH", true); await confirmed.confirm();
  result = page(submitted!); await confirmed.reconcile();
  assert.equal(confirmed.getSnapshot().phase, "idle"); assert.equal(confirmed.getSnapshot().page!.current.published, false);

  const denied = new WebCvPublicationController({ load: async () => { throw new WebCvRequestError("credentials"); },
    submit: async command => page(command), reconcile: async () => page() });
  await denied.load(); assert.equal(denied.getSnapshot().phase, "invalid"); assert.equal(denied.getSnapshot().page, null);
  const withdrawal = new WebCvPublicationController({ load: async () => page(undefined, true),
    submit: async command => { assert.ok(!("consent" in command)); return page(command); }, reconcile: async () => page() }, () => "e".repeat(32));
  await withdrawal.load(); assert.equal(withdrawal.prepare("WITHDRAW"), true); await withdrawal.confirm();
  assert.equal(withdrawal.getSnapshot().page!.current.published, false);
  console.log("PASS web CV controller: separate consent/review/cancel, one in-flight send, frozen explicit resend, GET-null uncertainty, historic receipt/current state, conflict refresh and late-response/session invalidation.");
}
main().catch(() => { console.error("Web CV controller verification failed; diagnostics suppressed."); process.exitCode = 1; });
