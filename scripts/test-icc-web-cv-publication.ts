import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { encode } from "next-auth/jwt";
import { prisma } from "../lib/prisma";
import { terraqoDomains } from "../lib/terraqo-domains";
import { createWebCvSessionGrant, revokeWebCvSessionGrant, webCvGrantIdentifier } from "../lib/server/web-cv-session-grant";
import { CvPublicationError, readCvPublication } from "../lib/server/portal-cv-publication";

let phase = "setup", actorId = "";
const require = createRequire(import.meta.url);
const authId = require.resolve("../auth");
require.cache[authId] = { id: authId, filename: authId, loaded: true,
  exports: { auth: async () => ({ user: { id: actorId } }) } } as NodeModule;

async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  assert.ok(process.env.AUTH_SECRET);
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({ where: {
    slug: "icc-topografia", active: true, deletedAt: null,
    companies: { some: { document: "20616116313", deletedAt: null } },
  }, select: { id: true } });
  const alias = `web-cv-${randomBytes(7).toString("hex")}`;
  const user = await prisma.user.create({ data: {
    email: `${randomUUID()}@example.test`, name: "Fixture privado publicación web", role: "CUSTOMER",
    terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } },
    terraqoProfessionalProfile: { create: { username: alias, liveCvEnabled: false, liveCvVisibility: "PRIVATE",
      experiences: { create: { title: "Entrada privada propia", companyName: "Fixture privado", visibility: "PRIVATE" } } } },
  }, select: { id: true, terraqoProfessionalProfile: { select: { id: true } } } });
  actorId = user.id;
  const profileId = user.terraqoProfessionalProfile!.id;
  const cookieName = "__Secure-authjs.session-token";
  const base = "https://portal.terraqoglobal.com/api/terraqo/cv-publication?workspaceSlug=icc-topografia";
  const current = () => prisma.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: profileId },
    select: { updatedAt: true, liveCvEnabled: true, experiences: { select: { visibility: true } } } });
  const count = () => prisma.terraqoCvPublicationOperation.count({ where: { professionalProfileId: profileId } });
  try {
    const { GET, POST } = await import("../app/api/terraqo/cv-publication/route");
    const grant = await createWebCvSessionGrant(user.id); assert.ok(grant);
    const claims = { sub: user.id, cvSessionId: grant.sessionId, cvSessionExpires: grant.expires };
    const jwt = await encode({ token: claims, secret: process.env.AUTH_SECRET, salt: cookieName, maxAge: 43200 });
    const legacy = await encode({ token: { sub: user.id }, secret: process.env.AUTH_SECRET, salt: cookieName, maxAge: 43200 });
    const send = async (body?: object, change: { cookie?: string; headers?: Record<string, string>; url?: string; raw?: string } = {}) => {
      const request = new Request(change.url || base, { method: body ? "POST" : "GET",
        headers: { cookie: `${cookieName}=${change.cookie ?? jwt}`, ...(body ? {
          origin: new URL(terraqoDomains.portal).origin, "content-type": "application/json", "x-terraqo-cv-command": "1",
        } : {}), ...change.headers }, body: body ? (change.raw ?? JSON.stringify(body)) : undefined });
      const response = await (body ? POST(request) : GET(request));
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      return { response, json: await response.json() };
    };
    phase = "cookie identity";
    assert.equal((await send(undefined, { cookie: legacy })).response.status, 401);
    assert.equal((await send(undefined, { cookie: "invalid", headers: { authorization: `Bearer ${jwt}` } })).response.status, 401);
    assert.equal((await send(undefined, { url: base + "&workspaceSlug=icc-topografia" })).response.status, 422);
    assert.equal((await send(undefined, { url: base + "&userId=foreign" })).response.status, 422);
    actorId = "different-identity";
    assert.equal((await send()).response.status, 401); actorId = user.id;
    const initial = await current();
    const publish = { action: "PUBLISH", version: initial.updatedAt.toISOString(), operationKey: randomBytes(16).toString("hex"), consent: true };
    phase = "origin and payload";
    const unsafeHeaders: Record<string, string>[] = [{ origin: "https://untrusted.example" }, { origin: "" }, { "x-terraqo-cv-command": "" }, { "sec-fetch-site": "cross-site" }];
    for (const headers of unsafeHeaders)
      assert.equal((await send(publish, { headers })).response.status, 403);
    assert.equal((await send(publish, { headers: { "content-type": "text/plain" } })).response.status, 415);
    assert.equal((await send(publish, { raw: "{" })).response.status, 422);
    assert.equal((await send(publish, { raw: "x".repeat(4097) })).response.status, 413);
    assert.equal((await send({ ...publish, consent: false })).response.status, 422);
    assert.equal((await send({ ...publish, userId: "foreign" })).response.status, 422);
    assert.equal(await count(), 0);
    phase = "durable operation";
    const pair = await Promise.all([send(publish), send(publish)]);
    assert.ok(pair.every(item => item.response.status === 200)); assert.equal(await count(), 1);
    const published = await current(); assert.equal(published.liveCvEnabled, true);
    assert.equal(published.experiences[0].visibility, "PRIVATE");
    assert.equal((await send({ ...publish, operationKey: randomBytes(16).toString("hex") })).response.status, 409);
    const withdraw = { action: "WITHDRAW", version: published.updatedAt.toISOString(), operationKey: randomBytes(16).toString("hex") };
    assert.equal((await send(withdraw)).response.status, 200);
    const historical = await send(undefined, { url: base + `&operationKey=${publish.operationKey}` });
    assert.equal(historical.response.status, 200);
    assert.equal(historical.json.data.current.published, false); assert.equal(historical.json.data.receipt.published, true);
    assert.equal((await send(publish)).json.data.current.published, false);
    assert.equal((await send(undefined, { url: base + `&operationKey=${randomBytes(16).toString("hex")}` })).json.data.receipt, null);
    assert.equal(await count(), 2);
    assert.equal(await prisma.activityLog.count({ where: { actorId: user.id, entityType: "CvPublication" } }), 2);
    assert.equal((await current()).experiences[0].visibility, "PRIVATE");
    assert.deepEqual(Object.keys(historical.json.data).sort(), ["current", "receipt", "schemaVersion", "workspaceSlug"]);
    assert.deepEqual(Object.keys(historical.json.data.current).sort(), ["published", "url", "username", "version"]);
    assert.equal(await prisma.verificationToken.count({ where: { identifier: webCvGrantIdentifier(user.id) } }), 1);
    phase = "live permissions and session isolation";
    await assert.rejects(readCvPublication({ sub: user.id, workspaceId: workspace.id, workspaceSlug: "icc-topografia",
      role: "PROFESSIONAL", exp: grant.expires, iat: grant.expires - 43200, jti: grant.sessionId }),
      error => error instanceof CvPublicationError && error.status === 401);
    await prisma.terraqoWorkspaceMember.updateMany({ where: { workspaceId: workspace.id, userId: user.id }, data: { role: "MEMBER" } });
    assert.equal((await send()).response.status, 403);
    await assert.rejects(readCvPublication({ source: "web", sub: user.id, workspaceId: workspace.id, workspaceSlug: "icc-topografia",
      role: "PROFESSIONAL", exp: grant.expires, sessionId: grant.sessionId }), error => error instanceof CvPublicationError && error.status === 403);
    await prisma.terraqoWorkspaceMember.updateMany({ where: { workspaceId: workspace.id, userId: user.id }, data: { role: "PROFESSIONAL" } });
    await revokeWebCvSessionGrant({ ...claims, exp: grant.expires });
    assert.equal((await send()).response.status, 401); assert.equal((await send(publish)).response.status, 401);
    assert.equal(await count(), 2);
    console.log("PASS web CV route SQL/Request: verified cookie, live owner/membership/grant, CSRF and bounded payload, atomic concurrent replay, historical/current state, GET without writes and revocation.");
  } finally {
    await prisma.activityLog.deleteMany({ where: { actorId: user.id, terraqoWorkspaceId: workspace.id, entityType: "CvPublication" } });
    await prisma.verificationToken.deleteMany({ where: { identifier: webCvGrantIdentifier(user.id) } });
    await prisma.user.delete({ where: { id: user.id } });
    console.log("CLEANUP own web CV publication fixture removed.");
  }
}
main().catch(() => { console.error(`Web CV publication verification failed at ${phase}; private diagnostics suppressed.`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
