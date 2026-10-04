import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313", "Explicit ICC test scope is required.");
  const workspace = await prisma.terraqoWorkspace.findFirst({ where: { slug: "icc-topografia", active: true, deletedAt: null,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  assert.ok(workspace);
  const password = randomBytes(24).toString("hex"), email = `limit-${randomUUID()}@example.test`;
  const user: { id: string } = await prisma.user.create({ data: { email, role: "CUSTOMER", name: "Prueba temporal de acceso",
    passwordHash: await bcrypt.hash(password, 12), terraqoMemberships: { create: { workspaceId: workspace.id, role: "MEMBER", active: true } } }, select: { id: true } });
  const attempt = (suppliedPassword: string) => fetch("https://api.terraqoglobal.com/api/public/workspaces/icc-topografia/portal/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: suppliedPassword }),
    redirect: "error", signal: AbortSignal.timeout(90000),
  });
  try {
    const results = await Promise.all(Array.from({ length: 12 }, () => attempt(randomBytes(24).toString("hex"))));
    assert.equal(results.filter(result => result.status === 401).length, 8, "The first eight invalid attempts must fail normally.");
    assert.equal(results.filter(result => result.status === 429).length, 4, "Concurrent requests must share one durable budget.");
    assert.ok(results.filter(result => result.status === 429).every(result => result.headers.get("retry-after") === "600"));
    assert.equal((await attempt(password)).status, 429, "A locked account must wait for its attempt window.");
    assert.equal(await prisma.verificationToken.count({ where: { identifier: `portal-login-attempt:${workspace.id}:${user.id}` } }), 8);
    console.log("PASS deployed concurrent login limit: eight failures, four rate limits, retry header, bound attempt markers and locked-account enforcement.");
  } finally {
    await prisma.verificationToken.deleteMany({ where: { identifier: { in: [`portal-login-attempt:${workspace.id}:${user.id}`, `portal-session:${workspace.id}:${user.id}`] } } });
    await prisma.user.delete({ where: { id: user.id } });
    console.log("CLEANUP: temporary limit-test account, membership and markers removed.");
  }
}
main().catch((error: unknown) => { console.error(error instanceof assert.AssertionError ? error.message : "Deployed login limit verification failed; sensitive diagnostics suppressed."); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
