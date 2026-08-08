import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getProfessionalNetworkContext, worklogInclude } from "@/lib/terraqo/worklog";

export async function requireProfessionalPortal() {
  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");

  const context = await getProfessionalNetworkContext(session.user.id);
  if (!context.profile) redirect("/portal");
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { id: context.profile.id },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      experiences: {
        include: { project: { select: { id: true, title: true, slug: true, location: true } } },
        orderBy: [{ verifiedByTerraqo: "desc" }, { createdAt: "desc" }]
      },
      education: {
        orderBy: [{ currentlyStudying: "desc" }, { startedAt: "desc" }, { createdAt: "desc" }]
      },
      affiliations: { orderBy: [{ current: "desc" }, { updatedAt: "desc" }] },
      applications: {
        include: {
          workspace: { select: { id: true, name: true, brandName: true } },
          jobPost: { select: { id: true, title: true, project: { select: { id: true, title: true } } } }
        },
        orderBy: { createdAt: "desc" }
      },
      documents: {
        orderBy: { uploadedAt: "desc" },
        select: { id: true, type: true, fileName: true, contentType: true, size: true, reviewStatus: true, reviewNote: true, uploadedAt: true }
      },
      worklogs: {
        where: { deletedAt: null },
        include: worklogInclude,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        take: 12
      }
    }
  });
  if (!profile) redirect("/portal");

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
