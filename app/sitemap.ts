import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { safeDb } from "@/lib/server/safe-db";
import { absoluteUrl } from "@/lib/utils";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = ["", "/plataforma", "/producto", "/automatizacion", "/membresias", "/red", "/cuenta", "/registro", "/privacidad", "/terminos"];
  const profiles = await safeDb(
    "sitemap:public-cv-profiles",
    prisma.terraqoProfessionalProfile.findMany({
      where: {
        username: { not: null },
        liveCvEnabled: true,
        friendDiscoveryEnabled: true
      },
      select: { username: true, updatedAt: true },
      orderBy: { updatedAt: "desc" }
    }),
    []
  );
  const sections = ["experiencias", "educacion", "proyectos", "evidencias", "capacidades", "documentos"];

  return [
    ...staticRoutes.map((route) => ({
      url: absoluteUrl(route),
      lastModified: new Date(),
      changeFrequency: route === "" ? "weekly" as const : "monthly" as const,
      priority: route === "" ? 1 : 0.5
    })),
    ...profiles.flatMap((profile) => {
      const username = profile.username as string;
      return [
        {
          url: absoluteUrl(`/cv/${username}`),
          lastModified: profile.updatedAt,
          changeFrequency: "weekly" as const,
          priority: 0.9
        },
        ...sections.map((section) => ({
          url: absoluteUrl(`/cv/${username}/${section}`),
          lastModified: profile.updatedAt,
          changeFrequency: "monthly" as const,
          priority: 0.65
        }))
      ];
    })
  ];
}
