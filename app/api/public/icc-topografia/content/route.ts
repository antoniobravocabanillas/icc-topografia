import { prisma } from "@/lib/prisma";
import { handleApiError, ok } from "@/lib/server/api";
import { serializeProduct } from "@/lib/server/serializers";
import { getDefaultTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeImage(value: string | null | undefined, origin: string) {
  if (!value) return "";
  const cleanValue = value.replace(/^\.\/public\//, "/");

  if (cleanValue.startsWith("/api/media/")) {
    return `${origin}${cleanValue}`;
  }

  const mediaPath = cleanValue.match(/https?:\/\/[^/]+(\/api\/media\/.+)$/i)?.[1];
  if (mediaPath) {
    return `${origin}${mediaPath}`;
  }

  return cleanValue;
}

export async function GET(request: Request) {
  try {
    const origin = new URL(request.url).origin;
    const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
    await requireWorkspaceModule("PUBLIC_WEBSITE", terraqoWorkspaceId);

    const [services, projects, products, categories, clientLogos] = await Promise.all([
      prisma.service.findMany({
        where: { isPublished: true, terraqoWorkspaceId },
        orderBy: [{ isFeatured: "desc" }, { title: "asc" }]
      }),
      prisma.project.findMany({
        where: { isPublic: true, terraqoWorkspaceId, deletedAt: null },
        include: { images: { orderBy: { position: "asc" } } },
        orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }]
      }),
      prisma.product.findMany({
        where: { isActive: true, isVisible: true, terraqoWorkspaceId },
        include: { category: true, variants: true },
        orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }]
      }),
      prisma.category.findMany({
        where: { products: { some: { isActive: true, isVisible: true, terraqoWorkspaceId } } },
        orderBy: { name: "asc" }
      }),
      prisma.clientLogo.findMany({
        where: { active: true, terraqoWorkspaceId },
        orderBy: [{ position: "asc" }, { createdAt: "desc" }]
      })
    ]);

    return ok({
      generatedAt: new Date().toISOString(),
      source: "Terraqo Workspace / ICC Topografia",
      services: services.map((service) => {
        const content = asRecord(service.content);
        return {
          ...content,
          id: service.id,
          slug: service.slug,
          title: service.title,
          category: service.category || String(content.category || ""),
          summary: service.summary,
          headline: service.headline || String(content.headline || ""),
          cover: normalizeImage(service.cover || String(content.cover || ""), origin),
          gallery: service.gallery.map((image) => normalizeImage(image, origin)),
          benefits: service.benefits.length ? service.benefits : ((content.benefits as string[]) || []),
          applications: service.applications.length ? service.applications : ((content.applications as string[]) || []),
          deliverables: service.deliverables.length ? service.deliverables : ((content.deliverables as string[]) || []),
          technologies: service.technologies.length ? service.technologies : ((content.technologies as string[]) || []),
          equipment: (content.equipment as string[]) || [],
          process: (content.process as string[]) || [],
          problem: String(content.problem || service.summary),
          caseStudy: String(content.caseStudy || service.summary),
          errorRange: service.precision || String(content.errorRange || ""),
          metric: service.icon || String(content.metric || ""),
          metricLabel: service.status || String(content.metricLabel || ""),
          featured: service.isFeatured,
          relatedServices: service.relatedServices,
          relatedProjects: service.relatedProjects
        };
      }),
      projects: projects.map((project) => {
        const hasCoordinates = project.latitude !== null && project.longitude !== null;

        return {
          slug: project.slug,
          title: project.title,
          sector: project.category || "",
          location: project.location || "",
          status: project.status,
          clientName: project.clientName || "",
          latitude: project.latitude,
          longitude: project.longitude,
          geofenceRadiusMeters: project.geofenceRadiusMeters,
          mapUrl: hasCoordinates ? `https://www.google.com/maps?q=${project.latitude},${project.longitude}` : "",
          image: normalizeImage(project.images[0]?.url, origin) || "/images/hero-topografia.jpg",
          gallery: project.images.map((image) => normalizeImage(image.url, origin)),
          summary: project.summary,
          description: project.description,
          challenge: project.challenge || "",
          solution: project.solution || "",
          result: project.results || "",
          results: project.results || "",
          services: project.servicesApplied,
          featured: project.isFeatured
        };
      }),
      products: products.map((product) => {
        const serialized = serializeProduct(product);
        return {
          ...serialized,
          title: product.name,
          category: product.category.name,
          categorySlug: product.category.slug,
          mainImage: normalizeImage(product.mainImage || product.images[0], origin),
          images: product.images.map((image) => normalizeImage(image, origin))
        };
      }),
      categories: categories.map((category) => ({
        name: category.name,
        slug: category.slug,
        count: products.filter((product) => product.categoryId === category.id).length
      })),
      clients: clientLogos.map((client) => ({
        name: client.name,
        logo: normalizeImage(client.logoUrl, origin),
        href: client.website || "#",
        sector: client.sector || ""
      }))
    });
  } catch (error) {
    return handleApiError(error);
  }
}
