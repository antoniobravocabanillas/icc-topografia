import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { safeDb } from "@/lib/server/safe-db";
import { absoluteUrl } from "@/lib/utils";
import { companyPublication } from "@/lib/terraqo/public-company-seo";

// Refresh newly published profiles without requiring a code deployment.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = ["", "/plataforma", "/producto", "/automatizacion", "/membresias", "/red", "/contacto", "/privacidad", "/terminos", "/legal", "/devoluciones", "/libro-de-reclamaciones"];
  const companies=await safeDb("sitemap:companies",prisma.terraqoWorkspace.findMany({where:{active:true,deletedAt:null},select:{slug:true,publicSlug:true,settings:true,updatedAt:true}}),[]);
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
    ...companies.filter(company=>companyPublication(company.settings)).map(company=>({url:absoluteUrl(`/empresas/${company.publicSlug||company.slug}`),lastModified:company.updatedAt,changeFrequency:"weekly" as const,priority:0.8})),
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
