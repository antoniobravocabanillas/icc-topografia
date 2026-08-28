import { ProfessionalNetworkDirectory } from "@/components/portal/professional-network-directory";
import { prisma } from "@/lib/prisma";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProfessionalNetworkDirectoryPage() {
  const { session, memberships } = await requireProfessionalPortal();
  const workspaceIds = memberships.map((membership) => membership.workspaceId);
  const profiles = workspaceIds.length
    ? await prisma.terraqoProfessionalProfile.findMany({
        where: {
          userId: { not: session.user.id },
          user: { terraqoMemberships: { some: { workspaceId: { in: workspaceIds }, active: true } } }
        },
        include: {
          user: { select: { id: true, name: true, email: true, image: true, lastSeenAt: true, onlineUntil: true } },
          affiliations: {
            where: { workspaceId: { in: workspaceIds } },
            include: { workspace: { select: { name: true, brandName: true } } },
            orderBy: [{ current: "desc" }, { updatedAt: "desc" }],
            take: 1
          },
          experiences: { where: { OR: [{ verifiedByTerraqo: true }, { visibility: { in: ["PUBLIC", "COMMUNITY", "WORKSPACE"] } }] }, select: { id: true }, take: 8 }
        },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        take: 80
      })
    : [];
  const companies = workspaceIds.length
    ? await prisma.company.findMany({
        where: { terraqoWorkspaceId: { in: workspaceIds }, deletedAt: null },
        select: { id: true, legalName: true, tradeName: true, document: true, city: true, locationCity: true, industry: true, status: true, publicSlug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 80
      })
    : [];

  const groups = workspaceIds.length
    ? await prisma.terraqoTeam.findMany({
        where: { workspaceId: { in: workspaceIds }, status: "ACTIVE" },
        include: { workspace: { select: { name: true, brandName: true } }, members: { select: { id: true } } },
        orderBy: { updatedAt: "desc" },
        take: 80
      })
    : [];

  return (
    <ProfessionalNetworkDirectory
      professionals={profiles.map((profile) => {
        const workspace = profile.affiliations[0]?.workspace;
        return {
          id: profile.id,
          name: profile.user.name || "Profesional Terraqo",
          image: profile.user.image,
          headline: profile.headline,
          city: profile.city,
          locationCity: profile.locationCity,
          status: profile.status,
          workspaceName: workspace?.brandName || workspace?.name || "Terraqo",
          skills: [...profile.professionalCategories, ...profile.specialties],
          verifiedExperiences: profile.experiences.length,
          lastSeenAt: profile.user.lastSeenAt?.toISOString() || null,
          onlineUntil: profile.user.onlineUntil?.toISOString() || null,
          updatedAt: profile.updatedAt.toISOString()
        };
      })}
      companies={companies.map((company) => ({
        id: company.id,
        name: company.tradeName || company.legalName,
        document: company.document,
        city: company.locationCity || company.city,
        industry: company.industry,
        status: company.status,
        publicSlug: company.publicSlug,
        updatedAt: company.updatedAt.toISOString()
      }))}
      groups={groups.map((group) => ({
        id: group.id,
        name: group.name,
        purpose: group.purpose,
        workspaceName: group.workspace.brandName || group.workspace.name,
        members: group.members.length,
        updatedAt: group.updatedAt.toISOString()
      }))}
    />
  );
}
