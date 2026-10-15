import { TerraqoHomeExperience } from "@/components/terraqo/terraqo-home-experience";
import { prisma } from "@/lib/prisma";
import { safeDb } from "@/lib/server/safe-db";
import { createMetadata } from "@/lib/seo";
export const metadata=createMetadata({title:"Terraqo",description:"Tu trabajo deja huella. Conecta tu identidad, evidencia y oportunidades en la red del trabajo real.",path:"/"});

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
      },
      orderBy: [{ updatedAt: "desc" }, { occurredAt: "desc" }, { createdAt: "desc" }],
      take: 10,
      select: {
        id: true,
        title: true,
        summary: true,
        occurredAt: true,
        updatedAt: true,
        locationLabel: true,
        author: { select: { name: true, image: true } },
        professionalProfile: { select: { username: true, headline: true, liveCvEnabled: true } },
        workspace: { select: { name: true, brandName: true } },
        project: { select: { title: true } },
        media: {
          where: { contentType: { startsWith: "image/" } },
          orderBy: { sortOrder: "asc" },
          take: 4,
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
    updatedAt: worklog.updatedAt.toISOString(),
    location: worklog.locationLabel,
    authorName: worklog.author.name || "Profesional Terraqo",
    authorImage: worklog.author.image,
    headline: worklog.professionalProfile.headline,
    username: worklog.professionalProfile.username,
    profilePublished: Boolean(worklog.professionalProfile.liveCvEnabled && worklog.professionalProfile.username),
    context: worklog.project?.title || worklog.workspace?.brandName || worklog.workspace?.name || null,
    imageUrls: worklog.professionalProfile.username
      ? worklog.media.map((media) =>
          `/api/public/cv/${encodeURIComponent(worklog.professionalProfile.username!)}/worklogs/${media.id}`
        )
      : [],
  }))} />;
}
