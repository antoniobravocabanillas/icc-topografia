import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { WorkspacePortalToken } from "./workspace-portal-session";

/** Resource authorization mirrors the portal's client/professional project list.
 * The project itself must belong to the token's active workspace; a public flag
 * or a supplied identifier never grants access to private project information.
 */
export async function getPortalProject(token: WorkspacePortalToken, projectId: string) {
  const where: Prisma.ProjectWhereInput = { id: projectId, terraqoWorkspaceId: token.workspaceId, deletedAt: null };
  if (token.role === "CLIENT") {
    const account = await prisma.clientAccount.findFirst({
      where: { userId: token.sub, terraqoWorkspaceId: token.workspaceId, deletedAt: null },
      select: { clientId: true },
    });
    if (!account?.clientId) return null;
    where.clientId = account.clientId;
    where.client = { terraqoWorkspaceId: token.workspaceId, deletedAt: null };
  } else if (token.role === "PROFESSIONAL") {
    const profile = await prisma.terraqoProfessionalProfile.findUnique({ where: { userId: token.sub }, select: { id: true } });
    if (!profile) return null;
    where.OR = [
      { terraqoExperiences: { some: { professionalProfileId: profile.id } } },
      { terraqoJobPosts: { some: { applications: { some: { professionalProfileId: profile.id, status: "ACCEPTED" } } } } },
    ];
  } else if (token.role !== "ADMIN") return null;
  return prisma.project.findFirst({ where, select: {
    id: true, title: true, status: true, summary: true, location: true,
    category: true, servicesApplied: true, updatedAt: true,
  } });
}
