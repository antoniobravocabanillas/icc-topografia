import { prisma } from "@/lib/prisma";
import { fail, handleApiError, ok } from "@/lib/server/api";
import { getWorkspacePortalToken } from "@/lib/server/workspace-portal-session";

type RouteContext = { params: Promise<{ workspaceSlug: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params;
    const token = getWorkspacePortalToken(request, workspaceSlug);
    if (!token) return fail("La sesion no es valida o ha vencido.", 401);

    const membership = await prisma.terraqoWorkspaceMember.findFirst({
      where: { workspaceId: token.workspaceId, userId: token.sub, active: true },
      select: {
        role: true,
        title: true,
        workspace: { select: { id: true, slug: true, name: true, brandName: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
    if (!membership || membership.workspace.slug !== workspaceSlug) return fail("Acceso no autorizado para este workspace.", 403);

    const professional = membership.role === "PROFESSIONAL"
      ? await prisma.terraqoProfessionalProfile.findUnique({
          where: { userId: token.sub },
          select: {
            id: true,
            headline: true,
            bio: true,
            city: true,
            country: true,
            yearsExperience: true,
            status: true,
            visibility: true,
            professionalCategories: true,
            specialties: true,
            equipment: true,
            software: true,
            liveCvEnabled: true,
            liveCvVisibility: true,
            identityVerificationStatus: true,
            identityVerificationNote: true,
            documents: {
              orderBy: { uploadedAt: "desc" },
              select: { id: true, type: true, fileName: true, reviewStatus: true, reviewNote: true, uploadedAt: true },
            },
            affiliations: {
              orderBy: [{ current: "desc" }, { updatedAt: "desc" }],
              select: { id: true, companyName: true, roleTitle: true, current: true, verificationStatus: true },
            },
            experiences: {
              orderBy: { startedAt: "desc" },
              select: {
                id: true,
                title: true,
                companyName: true,
                role: true,
                verifiedByTerraqo: true,
                project: { select: { title: true, slug: true } },
              },
            },
            applications: {
              where: { workspaceId: token.workspaceId },
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                status: true,
                professionalCategory: true,
                availabilityNote: true,
                createdAt: true,
                jobPost: { select: { title: true, slug: true } },
              },
            },
            worklogs: {
              where: { workspaceId: token.workspaceId, deletedAt: null },
              orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
              take: 30,
              select: {
                id: true,
                title: true,
                summary: true,
                outcome: true,
                type: true,
                evidenceStatus: true,
                visibility: true,
                skills: true,
                evidenceUrls: true,
                occurredAt: true,
                project: { select: { id: true, title: true, slug: true } },
                _count: { select: { comments: true, reactions: true } },
              },
            },
          },
        })
      : null;

    const professionalNetwork = professional
      ? await Promise.all([
          prisma.project.findMany({
            where: {
              terraqoWorkspaceId: token.workspaceId,
              deletedAt: null,
              OR: [
                { terraqoExperiences: { some: { professionalProfileId: professional.id } } },
                { terraqoJobPosts: { some: { applications: { some: { professionalProfileId: professional.id, status: "ACCEPTED" } } } } },
              ],
            },
            select: { id: true, title: true, slug: true },
            orderBy: { updatedAt: "desc" },
          }),
          prisma.terraqoJobPost.findMany({
            where: {
              workspaceId: token.workspaceId,
              status: "OPEN",
              deletedAt: null,
              visibility: { in: ["PUBLIC", "COMMUNITY", "WORKSPACE"] },
            },
            select: { id: true, title: true, slug: true, summary: true, location: true, modality: true, requiredSkills: true, requiredTools: true },
            orderBy: { createdAt: "desc" },
            take: 20,
          }),
        ])
      : null;

    const client = membership.role === "CLIENT"
      ? await prisma.clientAccount.findFirst({
          where: { terraqoWorkspaceId: token.workspaceId, userId: token.sub, deletedAt: null },
          select: {
            status: true,
            client: {
              select: {
                id: true,
                name: true,
                company: true,
                phone: true,
                quotes: {
                  where: { terraqoWorkspaceId: token.workspaceId },
                  orderBy: { createdAt: "desc" },
                  take: 20,
                  select: { id: true, number: true, status: true, total: true, currency: true, createdAt: true },
                },
                projects: {
                  where: { terraqoWorkspaceId: token.workspaceId },
                  orderBy: { updatedAt: "desc" },
                  take: 20,
                  select: { id: true, title: true, slug: true, status: true, location: true, updatedAt: true },
                },
              },
            },
          },
        })
      : null;

    return ok({
      workspace: membership.workspace,
      user: { ...membership.user, role: membership.role.toLowerCase(), title: membership.title },
      professional,
      professionalNetwork: professionalNetwork ? { projects: professionalNetwork[0], opportunities: professionalNetwork[1] } : null,
      client,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
