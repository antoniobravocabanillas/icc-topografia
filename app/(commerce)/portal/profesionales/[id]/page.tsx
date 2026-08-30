import { notFound } from "next/navigation";
import {
  ProfessionalProfileView,
  type ProfessionalProfileViewData,
} from "@/components/portal/professional-profile-view";
import { prisma } from "@/lib/prisma";
import { friendshipPairKey } from "@/lib/terraqo/friendships";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";
import {
  formatExperienceDuration,
  monthsBetween,
} from "@/lib/terraqo/profile-summary";
import { visibleWorklogWhere, worklogInclude } from "@/lib/terraqo/worklog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ id: string }> };

function friendshipState(
  friendship: {
    id: string;
    requesterId: string;
    recipientId: string;
    status: string;
  } | null,
  viewerId: string,
): ProfessionalProfileViewData["friendship"] {
  if (!friendship || !["PENDING", "ACCEPTED"].includes(friendship.status))
    return { status: "NONE" };
  if (friendship.status === "ACCEPTED")
    return { id: friendship.id, status: "ACCEPTED" };
  return {
    id: friendship.id,
    status:
      friendship.requesterId === viewerId ? "PENDING_SENT" : "PENDING_RECEIVED",
  };
}

export default async function ProfessionalProfilePage({ params }: PageProps) {
  const { id } = await params;
  const { session, memberships } = await requireProfessionalPortal();
  const viewerId = session.user.id;
  const viewerWorkspaceIds = memberships.map(
    (membership) => membership.workspaceId,
  );
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          onlineUntil: true,
          terraqoMemberships: {
            where: { active: true },
            select: { workspaceId: true },
          },
        },
      },
      affiliations: {
        include: { workspace: { select: { slug: true } } },
        orderBy: [{ current: "desc" }, { updatedAt: "desc" }],
      },
      experiences: {
        include: { project: { select: { title: true } } },
        orderBy: { startedAt: "desc" },
      },
      education: {
        orderBy: [
          { currentlyStudying: "desc" },
          { startedAt: "desc" },
          { createdAt: "desc" },
        ],
      },
    },
  });
  if (!profile) notFound();

  const owner = profile.userId === viewerId;
  const sharedWorkspace =
    profile.affiliations.some((affiliation) =>
      viewerWorkspaceIds.includes(affiliation.workspaceId),
    ) ||
    profile.user.terraqoMemberships.some((membership) =>
      viewerWorkspaceIds.includes(membership.workspaceId),
    );
  const friendship = owner
    ? null
    : await prisma.terraqoFriendship.findUnique({
        where: { pairKey: friendshipPairKey(viewerId, profile.userId) },
      });
  const connected = friendship?.status === "ACCEPTED";
  const discoverable = ["PUBLIC", "COMMUNITY"].includes(profile.visibility);
  if (!owner && !sharedWorkspace && !connected && !discoverable) notFound();

  const [worklogs, viewerFriends, profileFriends] = await Promise.all([
    prisma.terraqoWorklogEntry.findMany({
      where: {
        professionalProfileId: profile.id,
        ...visibleWorklogWhere(viewerId, viewerWorkspaceIds),
      },
      include: worklogInclude,
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 40,
    }),
    owner
      ? Promise.resolve([])
      : prisma.terraqoFriendship.findMany({
          where: {
            status: "ACCEPTED",
            OR: [{ requesterId: viewerId }, { recipientId: viewerId }],
          },
          select: { requesterId: true, recipientId: true },
        }),
    owner
      ? Promise.resolve([])
      : prisma.terraqoFriendship.findMany({
          where: {
            status: "ACCEPTED",
            OR: [
              { requesterId: profile.userId },
              { recipientId: profile.userId },
            ],
          },
          select: { requesterId: true, recipientId: true },
        }),
  ]);

  const viewerFriendIds = new Set(
    viewerFriends.map((item) =>
      item.requesterId === viewerId ? item.recipientId : item.requesterId,
    ),
  );
  const commonIds = profileFriends
    .map((item) =>
      item.requesterId === profile.userId ? item.recipientId : item.requesterId,
    )
    .filter((userId) => viewerFriendIds.has(userId))
    .slice(0, 8);
  const commonConnections = commonIds.length
    ? await prisma.user.findMany({
        where: { id: { in: commonIds } },
        select: {
          id: true,
          name: true,
          image: true,
          terraqoProfessionalProfile: { select: { id: true } },
        },
      })
    : [];

  const canSee = (visibility: string, workspaceId?: string | null) =>
    owner ||
    visibility === "PUBLIC" ||
    visibility === "COMMUNITY" ||
    (visibility === "WORKSPACE" &&
      Boolean(workspaceId && viewerWorkspaceIds.includes(workspaceId)));
  const experiences = profile.experiences.filter((item) =>
    canSee(item.visibility, item.workspaceId),
  );
  const education = profile.education.filter((item) => canSee(item.visibility));
  const affiliations = profile.affiliations.filter((item) =>
    canSee(item.visibility, item.workspaceId),
  );
  const totalMonths = experiences.reduce(
    (sum, item) =>
      sum +
      monthsBetween(
        item.startedAt,
        item.currentlyWorking ? null : item.endedAt,
      ),
    0,
  );
  const skills = Array.from(
    new Set([
      ...profile.professionalCategories,
      ...profile.specialties,
      ...worklogs.flatMap((item) => item.skills),
    ]),
  ).filter(Boolean);
  const statusLabels: Record<string, string> = {
    OPEN_TO_PROJECTS: "Disponible para proyectos",
    AVAILABLE: "Disponible",
    EMPLOYED: "Actualmente trabajando",
    NOT_AVAILABLE: "No disponible",
  };

  const view: ProfessionalProfileViewData = {
    profileId: profile.id,
    userId: profile.userId,
    owner,
    name: profile.user.name || "Profesional Terraqo",
    image: profile.user.image,
    headline: profile.headline || "Perfil profesional",
    location:
      profile.locationCity ||
      profile.city ||
      profile.region ||
      "Ubicación reservada",
    experienceDuration: formatExperienceDuration(totalMonths),
    online: Boolean(
      profile.user.onlineUntil && profile.user.onlineUntil > new Date(),
    ),
    available: ["OPEN_TO_PROJECTS", "AVAILABLE"].includes(profile.status),
    statusLabel:
      statusLabels[profile.status] ||
      profile.status.replaceAll("_", " ").toLowerCase(),
    verified: profile.identityVerificationStatus === "VERIFIED",
    about:
      profile.generatedSummary ||
      profile.bio ||
      "Este profesional está construyendo su presentación en Terraqo.",
    skills,
    experiences: experiences.map((item) => ({
      id: item.id,
      title: item.title,
      company:
        item.companyName || item.project?.title || "Proyecto profesional",
      duration: formatExperienceDuration(
        monthsBetween(
          item.startedAt,
          item.currentlyWorking ? null : item.endedAt,
        ),
      ),
      verified:
        item.verifiedByTerraqo || item.verificationStatus === "APPROVED",
      current: item.currentlyWorking,
      summary: item.summary,
    })),
    education: education.map((item) => ({
      id: item.id,
      degree: item.degree,
      institution: item.institution,
      field: item.field,
      verified: item.verificationStatus === "APPROVED",
    })),
    affiliations: affiliations.map((item) => ({
      id: item.id,
      company: item.companyName,
      role: item.roleTitle || "Rol profesional",
      slug: item.workspace.slug,
    })),
    worklogs: worklogs.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      outcome: item.outcome,
      occurredAt: item.occurredAt.toISOString(),
      workspace: item.workspace?.brandName || item.workspace?.name || null,
      project: item.project?.title || null,
      skills: item.skills,
      mediaIds: item.media.map((media) => media.id),
      verified:
        item.evidenceStatus === "VERIFIED" ||
        item.validations.some((validation) => validation.status === "APPROVED"),
      quality: item.qualityScore,
      reactions: item._count.reactions,
      comments: item._count.comments,
    })),
    commonConnections: commonConnections.map((item) => ({
      id: item.id,
      name: item.name,
      image: item.image,
      profileId: item.terraqoProfessionalProfile?.id,
    })),
    friendship: friendshipState(friendship, viewerId),
    metrics: {
      experiences: experiences.length,
      companies: new Set(affiliations.map((item) => item.companyName)).size,
      validations: worklogs.filter(
        (item) =>
          item.evidenceStatus === "VERIFIED" ||
          item.validations.some(
            (validation) => validation.status === "APPROVED",
          ),
      ).length,
      recognitions: worklogs.reduce(
        (sum, item) => sum + item._count.reactions,
        0,
      ),
    },
  };

  return <ProfessionalProfileView profile={view} />;
}
