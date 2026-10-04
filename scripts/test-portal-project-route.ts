import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma";
import { createWorkspacePortalToken, type WorkspacePortalRole } from "../lib/server/workspace-portal-session";
import { GET } from "../app/api/public/workspaces/[workspaceSlug]/portal/projects/[projectId]/route";

async function main() {
  process.env.AUTH_SECRET = randomBytes(32).toString("hex");
  const original = { member: prisma.terraqoWorkspaceMember.findFirst, billing: prisma.terraqoBillingAccount.findUnique,
    module: prisma.terraqoWorkspaceModule.findUnique, project: prisma.project.findFirst,
    client: prisma.clientAccount.findFirst, profile: prisma.terraqoProfessionalProfile.findUnique };
  let role: WorkspacePortalRole = "ADMIN";
  let active = true, enabled = true, visible = true;
  let reads = 0;
  prisma.terraqoWorkspaceMember.findFirst = (async (args: { where: unknown }) => {
    assert.deepEqual(args.where, { userId: "user", workspaceId: "workspace", active: true,
      workspace: { slug: "fixture", active: true, deletedAt: null } });
    return active ? { role } : null;
  }) as unknown as typeof original.member;
  prisma.terraqoBillingAccount.findUnique = (async () => null) as unknown as typeof original.billing;
  prisma.terraqoWorkspaceModule.findUnique = (async (args: { where: unknown }) => {
    assert.deepEqual(args.where, { workspaceId_code: { workspaceId: "workspace", code: "PROJECTS" } });
    return { active: enabled };
  }) as unknown as typeof original.module;
  prisma.clientAccount.findFirst = (async () => ({ clientId: "client" })) as unknown as typeof original.client;
  prisma.terraqoProfessionalProfile.findUnique = (async () => ({ id: "profile" })) as unknown as typeof original.profile;
  prisma.project.findFirst = (async (args: { where: Record<string, unknown>; select: Record<string, unknown> }) => {
    reads++;
    assert.equal(args.where.terraqoWorkspaceId, "workspace");
    assert.equal(args.where.deletedAt, null);
    assert.deepEqual(Object.keys(args.select).sort(), ["id", "title", "status", "summary", "location", "category", "servicesApplied", "updatedAt"].sort());
    return visible ? { id: "project", title: "Fixture", status: "PLANNING", summary: "Scope", location: null,
      category: null, servicesApplied: [], updatedAt: new Date("2026-01-01T00:00:00Z") } : null;
  }) as unknown as typeof original.project;
  const call = (id = "project", suppliedRole = role, slug = "fixture", anonymous = false) => {
    const { token } = createWorkspacePortalToken({ sub: "user", workspaceId: "workspace", workspaceSlug: "fixture", role: suppliedRole });
    return GET(new Request("https://example.test/project", { headers: anonymous ? {} : { authorization: `Bearer ${token}` } }),
      { params: Promise.resolve({ workspaceSlug: slug, projectId: id }) });
  };
  try {
    for (const legitimate of ["ADMIN", "CLIENT", "PROFESSIONAL"] as const) {
      role = legitimate;
      const response = await call();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal((await response.json()).data.project.id, "project");
    }
    let before = reads;
    for (const restricted of ["MEMBER", "VIEWER"] as const) { role = restricted; assert.equal((await call()).status, 403); }
    role = "ADMIN";
    assert.equal((await call("../private")).status, 404);
    assert.equal((await call("project", "ADMIN", "another-tenant")).status, 401);
    assert.equal((await call("project", "ADMIN", "fixture", true)).status, 401);
    assert.equal(reads, before);
    active = false; assert.equal((await call()).status, 401);
    active = true; role = "CLIENT"; assert.equal((await call("project", "ADMIN")).status, 401);
    role = "ADMIN"; enabled = false; assert.equal((await call()).status, 403);
    assert.equal(reads, before);
    enabled = true; visible = false;
    const missing = await call("unavailable");
    assert.equal(missing.status, 404);
    assert.ok(!(await missing.text()).includes("Fixture"));
    before = reads;
    console.log(`PASS project route: legitimate roles, membership revocation, role mismatch, module denial, cross-tenant, anonymous and opaque 404 (${before} resource reads).`);
  } finally {
    prisma.terraqoWorkspaceMember.findFirst = original.member;
    prisma.terraqoBillingAccount.findUnique = original.billing;
    prisma.terraqoWorkspaceModule.findUnique = original.module;
    prisma.project.findFirst = original.project;
    prisma.clientAccount.findFirst = original.client;
    prisma.terraqoProfessionalProfile.findUnique = original.profile;
    await prisma.$disconnect();
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
