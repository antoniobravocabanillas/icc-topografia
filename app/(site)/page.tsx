import { TerraqoHomeExperience } from "@/components/terraqo/terraqo-home-experience";
import { prisma } from "@/lib/prisma";
import { safeDb } from "@/lib/server/safe-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TerraqoHomePage() {
  const worklogs = await safeDb(
    "public home latest worklogs",
    prisma.terraqoWorklogEntry.findMany({
      where: {
        visibility: "PUBLIC",
        deletedAt: null,
        moderationStatus: { not: "REJECTED" },
        author: { emailVerified: { not: null } },
        professionalProfile: {
          username: { not: null },
          liveCvEnabled: true,
        },
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 3,
      select: {
        id: true,
        title: true,
        summary: true,
        occurredAt: true,
        locationLabel: true,
        author: { select: { name: true, image: true } },
        professionalProfile: { select: { username: true, headline: true } },
        workspace: { select: { name: true, brandName: true } },
        project: { select: { title: true } },
        media: {
          where: { contentType: { startsWith: "image/" } },
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: { id: true },
        },
      },
    }),
    [],
  );

  return <TerraqoHomeExperience latestWorklogs={worklogs.map((worklog) => ({
    id: worklog.id,
    title: worklog.title,
    summary: worklog.summary,
    occurredAt: worklog.occurredAt.toISOString(),
    location: worklog.locationLabel,
    authorName: worklog.author.name || "Profesional Terraqo",
    authorImage: worklog.author.image,
    headline: worklog.professionalProfile.headline,
    username: worklog.professionalProfile.username!,
    context: worklog.project?.title || worklog.workspace?.brandName || worklog.workspace?.name || null,
    imageUrl: worklog.media[0]
      ? `/api/public/cv/${encodeURIComponent(worklog.professionalProfile.username!)}/worklogs/${worklog.media[0].id}`
      : null,
  }))} />;
}
