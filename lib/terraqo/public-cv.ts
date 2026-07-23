import type { Prisma } from "@prisma/client";

export const publicCvProfileInclude = {
  user: { select: { name: true, email: true, image: true } },
  experiences: {
    where: { visibility: "PUBLIC" },
    include: {
      project: {
        select: {
          id: true,
          title: true,
          slug: true,
          clientName: true,
          location: true,
          category: true,
          status: true,
          images: {
            select: { url: true, alt: true, position: true },
            orderBy: { position: "asc" },
            take: 1
          }
        }
      }
    },
    orderBy: [{ verifiedByTerraqo: "desc" }, { startedAt: "desc" }],
    take: 50
  },
  documents: {
    select: {
      id: true,
      type: true,
      reviewStatus: true,
      uploadedAt: true,
      reviewedAt: true
    },
    orderBy: { uploadedAt: "desc" }
  },
  worklogs: {
    where: { visibility: "PUBLIC", deletedAt: null },
    include: {
      project: {
        select: {
          id: true,
          title: true,
          slug: true,
          clientName: true,
          location: true,
          category: true,
          status: true,
          images: {
            select: { url: true, alt: true, position: true },
            orderBy: { position: "asc" },
            take: 1
          }
        }
      },
      workspace: { select: { brandName: true, name: true } },
      validations: {
        where: { status: "APPROVED" },
        select: { id: true, responseNote: true, createdAt: true },
        take: 2
      },
      media: {
        select: { id: true, fileName: true, contentType: true, sortOrder: true },
        orderBy: { sortOrder: "asc" },
        take: 1
      }
    },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 80
  }
} satisfies Prisma.TerraqoProfessionalProfileInclude;

export type PublicCvProfile = Prisma.TerraqoProfessionalProfileGetPayload<{
  include: typeof publicCvProfileInclude;
}>;
