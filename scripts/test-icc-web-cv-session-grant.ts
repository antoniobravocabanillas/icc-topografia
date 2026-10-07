import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { createWebCvSessionGrant, revokeWebCvSessionGrant, webCvGrantHash,
  webCvGrantIdentifier, webCvSessionClaims } from "../lib/server/web-cv-session-grant";

async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({ where: {
    slug: "icc-topografia", active: true, deletedAt: null,
    companies: { some: { document: "20616116313", deletedAt: null } },
  }, select: { id: true } });
  const user = await prisma.user.create({ data: {
    email: `web-cv-grant-${randomUUID()}@example.test`, name: "Fixture privado de permiso web CV", role: "CUSTOMER",
    terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } },
    terraqoProfessionalProfile: { create: { liveCvEnabled: false } },
  }, select: { id: true, terraqoProfessionalProfile: { select: { updatedAt: true } } } });
  const identifier = webCvGrantIdentifier(user.id);
  try {
    const [first, second] = await Promise.all([createWebCvSessionGrant(user.id), createWebCvSessionGrant(user.id)]);
    assert.ok(first && second); assert.notEqual(first.sessionId, second.sessionId);
    const rows = await prisma.verificationToken.findMany({ where: { identifier } });
    assert.equal(rows.length, 2);
    assert.ok(rows.every(row => row.token !== first.sessionId && row.token !== second.sessionId));
    assert.ok(rows.some(row => row.token === webCvGrantHash(first.sessionId)));
    const jwt = { sub: user.id, cvSessionId: first.sessionId, cvSessionExpires: first.expires, exp: first.expires + 1 };
    assert.deepEqual(webCvSessionClaims(jwt), { userId: user.id, sessionId: first.sessionId, expires: first.expires });
    assert.equal(webCvSessionClaims({ sub: user.id, exp: first.expires }), null);
    for (const changes of [
      { cvSessionId: "not-a-session" }, { sub: "" }, { cvSessionExpires: Date.now() },
      { cvSessionExpires: 0 }, { cvSessionExpires: first.expires + 2 }, { exp: 0 }, { exp: 1.5 },
    ]) assert.equal(webCvSessionClaims({ ...jwt, ...changes }), null);
    await revokeWebCvSessionGrant({ ...jwt, cvSessionExpires: 0, exp: 0 });
    await revokeWebCvSessionGrant(jwt); // Idempotent logout, including expired cookies.
    const remaining = await prisma.verificationToken.findMany({ where: { identifier } });
    assert.equal(remaining.length, 1); assert.equal(remaining[0].token, webCvGrantHash(second.sessionId));
    assert.equal((await prisma.terraqoProfessionalProfile.findUniqueOrThrow({ where: { userId: user.id }, select: { updatedAt: true } })).updatedAt.toISOString(),
      user.terraqoProfessionalProfile!.updatedAt.toISOString());
    console.log("PASS web CV grant SQL: hashed independent login permissions, strict claims/expiry, exact idempotent logout and unchanged profile.");
  } finally {
    await prisma.verificationToken.deleteMany({ where: { identifier } });
    await prisma.user.delete({ where: { id: user.id } });
    console.log("CLEANUP own web CV grant fixture removed.");
  }
}
main().catch(() => { console.error("Web CV grant verification failed; private diagnostics suppressed."); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
