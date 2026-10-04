import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { POST } from "../app/api/public/workspaces/[workspaceSlug]/portal/login/route";
import { verifyWorkspacePortalToken } from "../lib/server/workspace-portal-session";

async function main() {
  process.env.AUTH_SECRET = randomBytes(32).toString("hex");
  const originals = { workspace: prisma.terraqoWorkspace.findFirst, user: prisma.user.findUnique, grant: prisma.verificationToken.create, transaction: prisma.$transaction };
  let limited = false;
  const limitClient = { $queryRaw: async () => [], verificationToken: { deleteMany: async () => ({ count: 0 }),
    count: async () => limited ? 8 : 0, create: async () => ({}) } };
  prisma.$transaction = (async (operation: (client: typeof limitClient) => Promise<unknown>) => operation(limitClient)) as unknown as typeof originals.transaction;
  prisma.verificationToken.create = (async (args: { data: { identifier: string; token: string; expires: Date } }) => {
    assert.equal(args.data.identifier, "portal-session:fixture-workspace:fixture-user");
    assert.match(args.data.token, /^[a-f0-9]{64}$/);
    assert.ok(args.data.expires > new Date());
    return args.data;
  }) as unknown as typeof originals.grant;
  const password = randomBytes(16).toString("hex");
  const passwordHash = await bcrypt.hash(password, 4);
  let membershipRole: string | null = "MEMBER";
  prisma.terraqoWorkspace.findFirst = (async (args: { where: unknown }) => {
    assert.deepEqual(args.where, { slug: "fixture", active: true, deletedAt: null });
    return { id: "fixture-workspace", slug: "fixture", name: "Fixture", brandName: null };
  }) as unknown as typeof originals.workspace;
  prisma.user.findUnique = (async (args: { where: unknown; select: { terraqoMemberships: { where: unknown; take: number } } }) => {
    assert.deepEqual(args.where, { email: "user@example.test" });
    assert.deepEqual(args.select.terraqoMemberships.where, { workspaceId: "fixture-workspace", active: true });
    assert.equal(args.select.terraqoMemberships.take, 1);
    return { id: "fixture-user", name: "Fixture", email: "user@example.test", passwordHash,
      terraqoMemberships: membershipRole ? [{ role: membershipRole }] : [] };
  }) as unknown as typeof originals.user;
  const login = (suppliedPassword = password) => POST(new Request("https://example.test/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "USER@example.test", password: suppliedPassword }),
  }), { params: Promise.resolve({ workspaceSlug: "fixture" }) });
  try {
    for (const [role, expected] of [["OWNER", "ADMIN"], ["ADMIN", "ADMIN"], ["MANAGER", "ADMIN"],
      ["MEMBER", "MEMBER"], ["VIEWER", "VIEWER"], ["CLIENT", "CLIENT"], ["PROFESSIONAL", "PROFESSIONAL"]]) {
      membershipRole = role;
      const response = await login();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      const payload = await response.json();
      assert.equal(verifyWorkspacePortalToken(payload.data.token, "fixture")?.role, expected);
      assert.ok(verifyWorkspacePortalToken(payload.data.token, "fixture")?.jti);
      assert.equal(payload.data.user.role, expected.toLowerCase());
    }
    membershipRole = "SUPER_ADMIN";
    assert.equal((await login()).status, 403);
    membershipRole = null;
    assert.equal((await login()).status, 401);
    membershipRole = "OWNER";
    assert.equal((await login(randomBytes(16).toString("hex"))).status, 401);
    limited = true; const blocked = await login(); assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("retry-after"), "600");
    console.log("PASS: actual login route preserves all legitimate roles and never promotes MEMBER, VIEWER or unknown roles.");
  } finally {
    prisma.terraqoWorkspace.findFirst = originals.workspace;
    prisma.user.findUnique = originals.user;
    prisma.verificationToken.create = originals.grant;
    prisma.$transaction = originals.transaction;
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
