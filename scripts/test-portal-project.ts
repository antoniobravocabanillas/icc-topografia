import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { getPortalProject } from "../lib/server/portal-project";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";

async function main() {
  const original = { project: prisma.project.findFirst, account: prisma.clientAccount.findFirst, profile: prisma.terraqoProfessionalProfile.findUnique };
  let role: WorkspacePortalToken["role"] = "ADMIN";
  let clientId: string | null = "authorized-client";
  let profileId: string | null = "authorized-profile";
  let queries = 0;
  prisma.clientAccount.findFirst = (async (args: { where: unknown }) => {
    assert.deepEqual(args.where, { userId: "user", terraqoWorkspaceId: "workspace", deletedAt: null }); return { clientId };
  }) as unknown as typeof original.account;
  prisma.terraqoProfessionalProfile.findUnique = (async (args: { where: unknown }) => {
    assert.deepEqual(args.where, { userId: "user" }); return profileId ? { id: profileId } : null;
  }) as unknown as typeof original.profile;
  prisma.project.findFirst = (async (args: { where: Record<string, unknown>; select: Record<string, unknown> }) => {
    queries++;
    assert.equal(args.where.id, "project"); assert.equal(args.where.terraqoWorkspaceId, "workspace"); assert.equal(args.where.deletedAt, null);
    assert.equal(args.select.documents, undefined); assert.equal(args.select.latitude, undefined); assert.equal(args.select.sale, undefined);
    if (role === "CLIENT") assert.equal(args.where.clientId, "authorized-client");
    if (role === "PROFESSIONAL") assert.deepEqual(args.where.OR, [
      { terraqoExperiences: { some: { professionalProfileId: "authorized-profile" } } },
      { terraqoJobPosts: { some: { applications: { some: { professionalProfileId: "authorized-profile", status: "ACCEPTED" } } } } },
    ]);
    return { id: "project" };
  }) as unknown as typeof original.project;
  const token = () => ({ sub: "user", workspaceId: "workspace", workspaceSlug: "fixture", role, iat: 1, exp: 2 });
  try {
    for (const legitimate of ["ADMIN", "CLIENT", "PROFESSIONAL"] as const) { role = legitimate; assert.ok(await getPortalProject(token(), "project")); }
    const before = queries;
    role = "CLIENT"; clientId = null; assert.equal(await getPortalProject(token(), "project"), null);
    role = "PROFESSIONAL"; profileId = null; assert.equal(await getPortalProject(token(), "project"), null);
    for (const restricted of ["MEMBER", "VIEWER"] as const) { role = restricted; assert.equal(await getPortalProject(token(), "project"), null); }
    assert.equal(queries, before, "Unlinked and restricted users must not query project data.");
    console.log("PASS: project reads enforce tenant, client and professional ownership; restricted roles and unlinked accounts cannot query projects.");
  } finally {
    prisma.project.findFirst = original.project; prisma.clientAccount.findFirst = original.account; prisma.terraqoProfessionalProfile.findUnique = original.profile;
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
