import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getProfessionalNetworkContext } from "@/lib/terraqo/worklog";

export async function requireProfessionalPortal() {
  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");

  const context = await getProfessionalNetworkContext(session.user.id);
  if (!context.profile) redirect("/portal");
  const profile = context.profile;

  return { session, memberships: context.memberships, profile };
}

export function workspaceHasModules(workspace: { modules: Array<{ code: string }> }, required: string[]) {
  const active = new Set(workspace.modules.map((module) => module.code));
  return required.every((code) => active.has(code));
}

export async function getProfessionalProjects(professionalProfileId: string, workspaceIds: string[]) {
  if (!workspaceIds.length) return [];
  return prisma.project.findMany({
    where: {
      terraqoWorkspaceId: { in: workspaceIds },
      deletedAt: null,
      OR: [
        { terraqoExperiences: { some: { professionalProfileId } } },
        { terraqoJobPosts: { some: { applications: { some: { professionalProfileId, status: "ACCEPTED" } } } } }
      ]
    },
    select: { id: true, title: true, terraqoWorkspaceId: true },
    orderBy: { updatedAt: "desc" }
  });
}
