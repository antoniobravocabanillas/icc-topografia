import { ProfessionalNetworkDirectory } from "@/components/portal/professional-network-directory";
import { prisma } from "@/lib/prisma";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";
import { visibleWorklogWhere } from "@/lib/terraqo/worklog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProfessionalNetworkDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { session, memberships } = await requireProfessionalPortal();
  const params = await searchParams;
  const workspaceIds = memberships.map((membership) => membership.workspaceId);
  const profiles = await prisma.terraqoProfessionalProfile.findMany({
    where: {
      userId: { not: session.user.id },
      user: { emailVerified: { not: null } },
      friendDiscoveryEnabled: true,
      OR: [
        { visibility: { in: ["PUBLIC", "COMMUNITY"] } },
        ...(workspaceIds.length
          ? [
              {
                user: {
                  terraqoMemberships: {
                    some: { workspaceId: { in: workspaceIds }, active: true },
                  },
                },
              },
            ]
          : []),
      ],
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          lastSeenAt: true,
          onlineUntil: true,
          terraqoBuilderAccount: {
            select: { profileBoostUntil: true, foundingBuilder: true },
          },
        },
      },
      affiliations: {
        where: { workspaceId: { in: workspaceIds } },
        include: { workspace: { select: { name: true, brandName: true } } },
        orderBy: [{ current: "desc" }, { updatedAt: "desc" }],
        take: 1,
      },
      experiences: {
        where: {
          OR: [
            { verifiedByTerraqo: true },
            { visibility: { in: ["PUBLIC", "COMMUNITY", "WORKSPACE"] } },
          ],
        },
        select: { id: true, verifiedByTerraqo: true },
        take: 20,
      },
      worklogs: {
        where: visibleWorklogWhere(session.user.id, workspaceIds),
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: {
          id: true,
          title: true,
          summary: true,
          outcome: true,
          type: true,
          evidenceStatus: true,
          moderationStatus: true,
          tqPointsAwarded: true,
          trustScoreAwarded: true,
          skills: true,
          occurredAt: true,
          workspace: { select: { name: true, brandName: true } },
          project: { select: { title: true } },
          media: {
            orderBy: { sortOrder: "asc" },
            take: 10,
            select: { id: true, contentType: true },
          },
          _count: { select: { comments: true, reactions: true } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 80,
  });
  const friendships = await prisma.terraqoFriendship.findMany({
    where: {
      OR: [{ requesterId: session.user.id }, { recipientId: session.user.id }],
    },
    select: { id: true, requesterId: true, recipientId: true, status: true },
  });
  const friendshipByUser = new Map(
    friendships.map((friendship) => {
      const otherId =
        friendship.requesterId === session.user.id
          ? friendship.recipientId
          : friendship.requesterId;
      const status =
        friendship.status === "ACCEPTED"
          ? "ACCEPTED"
          : friendship.status === "PENDING"
            ? friendship.requesterId === session.user.id
              ? "PENDING_SENT"
              : "PENDING_RECEIVED"
            : "NONE";
      return [otherId, { id: friendship.id, status }] as const;
    }),
  );
  const companies = workspaceIds.length
    ? await prisma.company.findMany({
        where: { terraqoWorkspaceId: { in: workspaceIds }, deletedAt: null },
        select: {
          id: true,
          legalName: true,
          tradeName: true,
          document: true,
          city: true,
          locationCity: true,
          industry: true,
          status: true,
          publicSlug: true,
          logoUrl: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 80,
      })
    : [];

  const groups = workspaceIds.length
    ? await prisma.terraqoTeam.findMany({
        where: { workspaceId: { in: workspaceIds }, status: "ACTIVE" },
        include: {
          workspace: { select: { name: true, brandName: true } },
          members: { select: { id: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 80,
      })
    : [];

  const jobs = await prisma.terraqoJobPost.findMany({
    where: {
      status: "OPEN",
      deletedAt: null,
      workspace: {
        active: true,
        modules: { some: { code: "JOB_MARKETPLACE", active: true } },
      },
      OR: [
        { visibility: { in: ["PUBLIC", "COMMUNITY"] } },
        ...(workspaceIds.length
          ? [
              {
                visibility: "WORKSPACE" as const,
                workspaceId: { in: workspaceIds },
              },
            ]
          : []),
      ],
    },
    select: {
      id: true,
      title: true,
      summary: true,
      location: true,
      modality: true,
      createdAt: true,
      requiredSkills: true,
      workspace: {
        select: { slug: true, name: true, brandName: true, logoUrl: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  return (
    <ProfessionalNetworkDirectory
      initialQuery={params.q?.trim().slice(0, 120) || ""}
      jobAds={jobs.map((job) => ({
        id: job.id,
        title: job.title,
        summary: job.summary,
        company: job.workspace.brandName || job.workspace.name,
        companySlug: job.workspace.slug,
        companyLogo: job.workspace.logoUrl,
        location: job.location,
        modality: job.modality,
        skills: job.requiredSkills,
        publishedAt: job.createdAt.toISOString(),
      }))}
      professionals={profiles.map((profile) => {
        const workspace = profile.affiliations[0]?.workspace;
        return {
          id: profile.id,
          userId: profile.user.id,
          friendship: friendshipByUser.get(profile.user.id) || {
            status: "NONE",
          },
          name: profile.user.name || "Profesional Terraqo",
          image: profile.user.image,
          headline: profile.headline,
          city: profile.city,
          locationCity: profile.locationCity,
          status: profile.status,
          verified: profile.identityVerificationStatus === "VERIFIED",
          workspaceName: workspace?.brandName || workspace?.name || "Terraqo",
          roleTitle: profile.affiliations[0]?.roleTitle || null,
          skills: [...profile.professionalCategories, ...profile.specialties],
          visibleExperiences: profile.experiences.length,
          verifiedExperiences: profile.experiences.filter(
            (experience) => experience.verifiedByTerraqo,
          ).length,
          lastSeenAt: profile.user.lastSeenAt?.toISOString() || null,
          onlineUntil: profile.user.onlineUntil?.toISOString() || null,
          profileBoostUntil:
            profile.user.terraqoBuilderAccount?.profileBoostUntil?.toISOString() ||
            null,
          foundingBuilder:
            profile.user.terraqoBuilderAccount?.foundingBuilder || false,
          latestWorklog: profile.worklogs[0]
            ? {
                id: profile.worklogs[0].id,
                title: profile.worklogs[0].title,
                summary: profile.worklogs[0].summary,
                outcome: profile.worklogs[0].outcome,
                type: profile.worklogs[0].type,
                evidenceStatus: profile.worklogs[0].evidenceStatus,
                moderationStatus: profile.worklogs[0].moderationStatus,
                tqPointsAwarded: profile.worklogs[0].tqPointsAwarded,
                trustScoreAwarded: profile.worklogs[0].trustScoreAwarded,
                skills: profile.worklogs[0].skills,
                occurredAt: profile.worklogs[0].occurredAt.toISOString(),
                workspaceName:
                  profile.worklogs[0].workspace?.brandName ||
                  profile.worklogs[0].workspace?.name ||
                  null,
                projectName: profile.worklogs[0].project?.title || null,
                mediaIds: profile.worklogs[0].media
                  .filter((media) => media.contentType.startsWith("image/"))
                  .map((media) => media.id),
                reactions: profile.worklogs[0]._count.reactions,
                comments: profile.worklogs[0]._count.comments,
              }
            : null,
          updatedAt: profile.updatedAt.toISOString(),
        };
      })}
      companies={companies.map((company) => ({
        id: company.id,
        name: company.tradeName || company.legalName,
        document: company.document,
        city: company.locationCity || company.city,
        industry: company.industry,
        status: company.status,
        logoUrl: company.logoUrl,
        publicSlug: company.publicSlug,
        updatedAt: company.updatedAt.toISOString(),
      }))}
      groups={groups.map((group) => ({
        id: group.id,
        name: group.name,
        purpose: group.purpose,
        workspaceName: group.workspace.brandName || group.workspace.name,
        members: group.members.length,
        updatedAt: group.updatedAt.toISOString(),
      }))}
    />
  );
}
