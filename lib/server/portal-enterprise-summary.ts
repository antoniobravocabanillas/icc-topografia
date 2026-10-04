import { prisma } from "@/lib/prisma";
import { hasWorkspaceModule } from "@/lib/terraqo/workspace-scope";

const PREVIEW_LIMIT = 20;

/** Read-only, bounded overview. Module entitlements apply before tenant queries. */
export async function getPortalEnterpriseSummary(workspaceId: string) {
  const [projectsEnabled, crmEnabled] = await Promise.all([
    hasWorkspaceModule("PROJECTS", workspaceId), hasWorkspaceModule("CRM", workspaceId),
  ]);
  const memberWhere = { workspaceId, active: true };
  const projectWhere = { terraqoWorkspaceId: workspaceId, deletedAt: null };
  const clientWhere = { terraqoWorkspaceId: workspaceId, deletedAt: null };
  const [memberCount, members, projectCount, projects, clientCount, clients] = await Promise.all([
    prisma.terraqoWorkspaceMember.count({ where: memberWhere }),
    prisma.terraqoWorkspaceMember.findMany({ where: memberWhere, take: PREVIEW_LIMIT,
      orderBy: [{ joinedAt: "desc" }, { id: "asc" }],
      select: { id: true, role: true, title: true, user: { select: { name: true } } } }),
    projectsEnabled ? prisma.project.count({ where: projectWhere }) : Promise.resolve(null),
    projectsEnabled ? prisma.project.findMany({ where: projectWhere, take: PREVIEW_LIMIT,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: { id: true, title: true, status: true, location: true } }) : Promise.resolve([]),
    crmEnabled ? prisma.client.count({ where: clientWhere }) : Promise.resolve(null),
    crmEnabled ? prisma.client.findMany({ where: clientWhere, take: PREVIEW_LIMIT,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: { id: true, name: true, company: true, status: true } }) : Promise.resolve([]),
  ]);
  return { schemaVersion: 1, previewLimit: PREVIEW_LIMIT, memberCount, members,
    projectCount, projects, clientCount, clients, capabilities: { projects: projectsEnabled, crm: crmEnabled } };
}
