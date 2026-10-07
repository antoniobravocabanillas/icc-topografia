import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CvPublicationError } from "../lib/server/portal-cv-publication";

const require = createRequire(import.meta.url);
let owner: string | null = "session-owner", identityFailure: unknown, accessFailure: unknown;
let authReads = 0, checks = 0, reads = 0;
const fakeIdentity = { source: "web", sub: "session-owner", workspaceSlug: "icc-topografia" };
function mock(path: string, exports: object) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule;
}
mock("../auth", { auth: async () => { authReads++; return owner ? { user: { id: owner } } : null; } });
mock("next/headers", { headers: async () => new Headers({ cookie: "synthetic-cookie" }) });
mock("next/navigation", { notFound: () => { throw Error("NOT_FOUND"); }, redirect: (url: string) => { throw Error(`REDIRECT:${url}`); } });
mock("../components/portal/cv-publication-screen", { CvPublicationScreen: (props: { ownerId: string; workspaceSlug: string }) =>
  <div data-owner={props.ownerId} data-workspace={props.workspaceSlug} /> });
mock("../lib/server/web-cv-publication-identity", { webCvPublicationIdentity: async (request: Request, slug: string) => {
  checks++; assert.equal(request.headers.get("x-terraqo-cv-owner"), owner);
  assert.equal(request.headers.get("cookie"), "synthetic-cookie"); assert.equal(slug, "icc-topografia");
  if (identityFailure) throw identityFailure; return fakeIdentity;
} });
// Preserve the error constructor so status handling exercises the actual class.
mock("../lib/server/portal-cv-publication", { CvPublicationError, readCvPublication: async (identity: unknown) => {
  reads++; assert.equal(identity, fakeIdentity); if (accessFailure) throw accessFailure;
  return { current: { username: "must-not-serialize", bankAccount: "must-not-serialize" } };
} });
async function main() {
  const originalFlag = process.env.TERRAQO_WEB_CV_PUBLICATION_ENABLED;
  try {
    const { default: page } = await import("../app/(cv-publication)/cuenta/publicacion-cv/page");
    const invoke = (query: Record<string, string | string[]> = { workspaceSlug: "icc-topografia" }) => page({ searchParams: Promise.resolve(query) });
    delete process.env.TERRAQO_WEB_CV_PUBLICATION_ENABLED;
    await assert.rejects(invoke(), /NOT_FOUND/); assert.equal(authReads, 0); assert.equal(checks, 0);
    process.env.TERRAQO_WEB_CV_PUBLICATION_ENABLED = "true";
    await assert.rejects(invoke({ workspaceSlug: "icc-topografia", owner: "other" }), /NOT_FOUND/);
    assert.equal(authReads, 0);
    owner = null; await assert.rejects(invoke(), /REDIRECT:\/cuenta\?workspace=icc-topografia/); assert.equal(checks, 0);
    owner = "session-owner";
    const html = renderToStaticMarkup(await invoke({ workspaceSlug: "icc-topografia", document: "01234567-89ab-4cde-8fab-0123456789ab" }));
    assert.ok(html.includes('data-owner="session-owner"')); assert.ok(html.includes('data-workspace="icc-topografia"'));
    assert.ok(!html.includes("must-not-serialize")); assert.equal(reads, 1);
    accessFailure = new CvPublicationError("denied", 403); await assert.rejects(invoke(), /NOT_FOUND/);
    accessFailure = new CvPublicationError("missing profile", 404); await assert.rejects(invoke(), /NOT_FOUND/);
    accessFailure = Error("network unavailable"); await assert.rejects(invoke(), /network unavailable/);
    accessFailure = undefined; identityFailure = new CvPublicationError("legacy grant", 401);
    assert.ok(renderToStaticMarkup(await invoke()).includes('data-owner="session-owner"'));
    identityFailure = new CvPublicationError("wrong membership", 403); await assert.rejects(invoke(), /NOT_FOUND/);
    console.log("CV page bootstrap: gate/query/session/live authorization/reauth/error isolation/DTO minimization passed with controlled ports.");
  } finally {
    if (originalFlag === undefined) delete process.env.TERRAQO_WEB_CV_PUBLICATION_ENABLED;
    else process.env.TERRAQO_WEB_CV_PUBLICATION_ENABLED = originalFlag;
  }
}
main().catch(() => { console.error("CV page bootstrap verification failed."); process.exitCode = 1; });
