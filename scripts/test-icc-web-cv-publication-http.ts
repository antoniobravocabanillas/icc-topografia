import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { decode } from "next-auth/jwt";
import { prisma } from "../lib/prisma";

let phase = "setup";
const origin = "https://portal.terraqoglobal.com";
const sessionName = "__Secure-authjs.session-token";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313"); assert.ok(process.env.AUTH_SECRET);
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({ where: {
    slug: "icc-topografia", active: true, deletedAt: null, companies: { some: { document: "20616116313", deletedAt: null } },
  }, select: { id: true } });
  const password = randomBytes(24).toString("hex"), email = `${randomUUID()}@example.test`;
  const user = await prisma.user.create({ data: {
    email, name: "Fixture privado sesión web CV HTTP", role: "CUSTOMER", emailVerified: new Date(), passwordHash: await bcrypt.hash(password, 12),
    terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } },
    terraqoProfessionalProfile: { create: { username: `cv-session-${randomBytes(6).toString("hex")}`, liveCvEnabled: false,
      experiences: { create: { title: "Entrada privada propia", visibility: "PRIVATE" } } } },
  }, select: { id: true, terraqoProfessionalProfile: { select: { id: true } } } });
  const profileId = user.terraqoProfessionalProfile!.id, grantIdentifier = `web-cv-session:${user.id}`;
  const jar = new Map<string, string>();
  const cookies = () => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
  const fetchOwn = async (path: string, init: RequestInit = {}, cookieOverride?: string) => {
    const response = await fetch(origin + path, { ...init, headers: {
      cookie: cookieOverride ?? cookies(), ...init.headers,
    }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(60000) });
    if (cookieOverride === undefined) for (const item of response.headers.getSetCookie()) {
      const pair = item.split(";", 1)[0], index = pair.indexOf("=");
      if (index > 0) {
        const key = pair.slice(0, index), value = pair.slice(index + 1);
        if (!value || /(?:^|;)\s*max-age=0(?:;|$)/i.test(item)) jar.delete(key); else jar.set(key, value);
      }
    }
    return response;
  };
  const sessionJwt = () => jar.get(sessionName) || [...jar].filter(([name]) => name.startsWith(sessionName + "."))
    .sort(([a], [b]) => Number(a.slice(sessionName.length + 1)) - Number(b.slice(sessionName.length + 1)))
    .map(([, value]) => value).join("");
  const base = "/api/terraqo/cv-publication?workspaceSlug=icc-topografia";
  const current = () => prisma.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: profileId },
    select: { updatedAt: true, liveCvEnabled: true, experiences: { select: { visibility: true } } } });
  const count = () => prisma.terraqoCvPublicationOperation.count({ where: { professionalProfileId: profileId } });
  const post = (command: object, cookieOverride?: string) => fetchOwn(base, { method: "POST", headers: {
    origin, "content-type": "application/json", "x-terraqo-cv-command": "1",
  }, body: JSON.stringify(command) }, cookieOverride);
  try {
    phase = "Auth.js credentials callback";
    let response = await fetchOwn("/api/auth/csrf"); assert.equal(response.status, 200);
    const csrf = (await response.json()).csrfToken; assert.equal(typeof csrf, "string");
    response = await fetchOwn("/api/auth/callback/credentials", { method: "POST", headers: {
      origin, "content-type": "application/x-www-form-urlencoded", "x-auth-return-redirect": "1",
    }, body: new URLSearchParams({ csrfToken: csrf, email, password, callbackUrl: origin + "/perfil" }) });
    assert.equal(response.status, 200); await response.body?.cancel(); assert.ok(sessionJwt());
    const originalClaims = await decode({ token: sessionJwt(), secret: process.env.AUTH_SECRET, salt: sessionName });
    assert.equal(originalClaims?.sub, user.id); assert.equal(typeof originalClaims?.cvSessionId, "string");
    assert.equal(await prisma.verificationToken.count({ where: { identifier: grantIdentifier } }), 1);
    phase = "session reads do not issue grants or expose their claims";
    response = await fetchOwn("/api/auth/session"); assert.equal(response.status, 200);
    const session = await response.json(); assert.equal(session.user.id, user.id);
    assert.ok(!JSON.stringify(session).includes(originalClaims!.cvSessionId!));
    const refreshed = await decode({ token: sessionJwt(), secret: process.env.AUTH_SECRET, salt: sessionName });
    assert.equal(refreshed?.cvSessionId, originalClaims!.cvSessionId);
    assert.equal(refreshed?.cvSessionExpires, originalClaims!.cvSessionExpires);
    assert.equal(await prisma.verificationToken.count({ where: { identifier: grantIdentifier } }), 1);
    phase = "deployed operation and privacy";
    response = await fetchOwn(base); assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const initial = (await response.json()).data; assert.equal(initial.current.published, false);
    assert.deepEqual(Object.keys(initial.current).sort(), ["published", "url", "username", "version"]);
    const publish = { action: "PUBLISH", version: initial.current.version, operationKey: randomBytes(16).toString("hex"), consent: true };
    const result = await Promise.all([post(publish), post(publish)]);
    assert.ok(result.every(item => item.status === 200)); for (const item of result) await item.body?.cancel();
    assert.equal(await count(), 1);
    const published = await current(); assert.equal(published.liveCvEnabled, true);
    const withdraw = { action: "WITHDRAW", version: published.updatedAt.toISOString(), operationKey: randomBytes(16).toString("hex") };
    response = await post(withdraw); assert.equal(response.status, 200); await response.body?.cancel();
    response = await fetchOwn(base + `&operationKey=${publish.operationKey}`); assert.equal(response.status, 200);
    const history = (await response.json()).data; assert.equal(history.current.published, false); assert.equal(history.receipt.published, true);
    assert.equal(await count(), 2); assert.equal((await current()).experiences[0].visibility, "PRIVATE");
    const oldCookie = cookies();
    phase = "Auth.js logout revokes permission and stale cookie cannot restore it";
    response = await fetchOwn("/api/auth/csrf"); const logoutCsrf = (await response.json()).csrfToken;
    response = await fetchOwn("/api/auth/signout", { method: "POST", headers: {
      origin, "content-type": "application/x-www-form-urlencoded", "x-auth-return-redirect": "1",
    }, body: new URLSearchParams({ csrfToken: logoutCsrf, callbackUrl: origin + "/cuenta" }) });
    assert.equal(response.status, 200); await response.body?.cancel();
    assert.equal(await prisma.verificationToken.count({ where: { identifier: grantIdentifier } }), 0);
    response = await fetchOwn(base, {}, oldCookie); assert.equal(response.status, 401); await response.body?.cancel();
    response = await post(publish, oldCookie); assert.equal(response.status, 401); await response.body?.cancel();
    assert.equal(await count(), 2);
    assert.equal(await prisma.verificationToken.count({ where: { identifier: grantIdentifier } }), 0);
    console.log("PASS deployed Auth.js/CV HTTP and SQL: real credential login grant, refresh without issuance/claim exposure, concurrent single operation, withdrawal/history, private entry preserved and logout rejects stale cookie without restoring permission.");
  } finally {
    await prisma.activityLog.deleteMany({ where: { actorId: user.id, terraqoWorkspaceId: workspace.id, entityType: "CvPublication" } });
    await prisma.verificationToken.deleteMany({ where: { identifier: grantIdentifier } });
    await prisma.user.delete({ where: { id: user.id } }); jar.clear();
    console.log("CLEANUP own Auth.js/CV HTTP user/profile/membership/entry/operations/audits/grants removed.");
  }
}
main().catch(() => { console.error(`Web CV HTTP verification failed at ${phase}; private diagnostics suppressed.`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
