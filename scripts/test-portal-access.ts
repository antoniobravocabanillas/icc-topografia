import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma";
import { createWorkspacePortalToken, getWorkspacePortalToken } from "../lib/server/workspace-portal-session";
import { toWorkspacePortalRole } from "../lib/server/workspace-portal-policy";

async function main() {
  process.env.AUTH_SECRET = randomBytes(32).toString("hex");
  const original = prisma.terraqoWorkspaceMember.findFirst;
  let currentRole: string | null = null;
  let active = true;
  let workspaceActive = true;
  let deletedAt: Date | null = null;
  let slug = "fixture";
  let checks = 0;
  prisma.terraqoWorkspaceMember.findFirst = (async (args: { where?: Record<string, unknown> }) => {
    checks++;
    assert.equal(args.where?.userId, "fixture-user");
    assert.equal(args.where?.workspaceId, "fixture-workspace");
    assert.equal(args.where?.active, true);
    assert.deepEqual(args.where?.workspace, { slug: "fixture", active: true, deletedAt: null });
    if (!currentRole || !active || !workspaceActive || deletedAt || slug !== "fixture") return null;
    return { role: currentRole };
  }) as unknown as typeof prisma.terraqoWorkspaceMember.findFirst;
  try {
    const issue = (role: Parameters<typeof createWorkspacePortalToken>[0]["role"]) => {
      const issued = createWorkspacePortalToken({ sub: "fixture-user", workspaceId: "fixture-workspace", workspaceSlug: "fixture", role });
      return new Request("https://example.test", { headers: { authorization: `Bearer ${issued.token}` } });
    };
    const admin = issue("ADMIN");
    assert.equal(await getWorkspacePortalToken(admin, "fixture"), null, "A token must not authorize a removed membership.");
    assert.equal(checks, 1, "Authorization must consult current membership.");
    for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
      currentRole = role;
      assert.equal((await getWorkspacePortalToken(admin, "fixture"))?.role, "ADMIN");
    }
    for (const role of ["CLIENT", "PROFESSIONAL", "MEMBER", "VIEWER", "UNKNOWN"]) {
      currentRole = role;
      assert.equal(await getWorkspacePortalToken(admin, "fixture"), null, `${role} must not retain an administrator token.`);
    }
    currentRole = "ADMIN";
    active = false;
    assert.equal(await getWorkspacePortalToken(admin, "fixture"), null);
    active = true;
    workspaceActive = false;
    assert.equal(await getWorkspacePortalToken(admin, "fixture"), null);
    workspaceActive = true;
    deletedAt = new Date();
    assert.equal(await getWorkspacePortalToken(admin, "fixture"), null);
    deletedAt = null;
    slug = "another-tenant";
    assert.equal(await getWorkspacePortalToken(admin, "fixture"), null);
    slug = "fixture";
    const before = checks;
    assert.equal(await getWorkspacePortalToken(admin, "another-tenant"), null);
    assert.equal(checks, before, "A token for another slug must fail before database access.");
    for (const role of ["CLIENT", "PROFESSIONAL", "MEMBER", "VIEWER"] as const) {
      currentRole = role;
      assert.equal((await getWorkspacePortalToken(issue(role), "fixture"))?.role, role);
    }
    for (const role of ["OWNER", "ADMIN", "MANAGER"]) assert.equal(toWorkspacePortalRole(role), "ADMIN");
    for (const role of ["CLIENT", "PROFESSIONAL", "MEMBER", "VIEWER"]) assert.equal(toWorkspacePortalRole(role), role);
    for (const role of ["UNKNOWN", "admin", "", "SUPER_ADMIN", " ADMIN"]) assert.equal(toWorkspacePortalRole(role), null);
    console.log("Portal membership authorization regression checks passed.");
  } finally {
    prisma.terraqoWorkspaceMember.findFirst = original;
    await prisma.$disconnect();
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
