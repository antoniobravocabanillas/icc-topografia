import { PUBLIC_WORKLOG_MEDIA_TYPES } from "./public-worklog-media";
import type { Prisma } from "@prisma/client";

// A public entry inside a CV never overrides withdrawal of its parent profile.
// Use the same predicate for content, metadata, social previews and exports.
export function publishedCvProfileWhere(username: string): Prisma.TerraqoProfessionalProfileWhereUniqueInput {
  return { username, liveCvEnabled: true };
}

export const standalonePublicWorklogWhere = {
  visibility: "PUBLIC", lifecycle: "PUBLISHED", deletedAt: null, workspaceId: null,
  OR: [{ projectId: null }, { project: { isPublic: true, deletedAt: null } }],
} satisfies Prisma.TerraqoWorklogEntryWhereInput;

export const publicCvProfileSelect = {
  id: true, username: true, headline: true, bio: true, city: true, region: true,
  country: true, locationCity: true, status: true, liveCvEnabled: true, liveCvVisibility: true,
  messagePrivacy: true, identityVerificationStatus: true, updatedAt: true, certifications: true,
  specialties: true, professionalCategories: true, equipment: true, software: true,
  user: { select: { name: true, image: true, lastSeenAt: true, onlineUntil: true } },
  experiences: {
    where: { visibility: "PUBLIC" },
    include: {
      workspace: {
        select: { name: true, brandName: true, logoUrl: true }
      },
      project: {
        select: {
          id: true,
          title: true,
          slug: true,
          isPublic: true, deletedAt: true,
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
  affiliations: {
    where: { visibility: "PUBLIC" },
    include: {
      workspace: { select: { name: true, brandName: true, logoUrl: true } },
      company: { select: { legalName: true, tradeName: true, logoUrl: true } }
    },
    orderBy: [{ current: "desc" }, { updatedAt: "desc" }],
    take: 30
  },
  education: {
    where: { visibility: "PUBLIC" },
    orderBy: [{ currentlyStudying: "desc" }, { startedAt: "desc" }, { createdAt: "desc" }],
    take: 30
  },
  socialLinks: {
    where: { visibility: "PUBLIC" },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    take: 12
  },
  documents: {
    // Verification files have no public disclosure setting.
    where: { id: { in: [] } },
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
    where: standalonePublicWorklogWhere,
    include: {
      project: {
        select: {
          id: true,
          title: true,
          slug: true,
          isPublic: true, deletedAt: true,
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
        select: {
          id: true,
          createdAt: true,
          resolvedAt: true,
          validator: { select: { name: true } }
        },
        take: 2
      },
      media: {
        where: { contentType: { in: PUBLIC_WORKLOG_MEDIA_TYPES } },
        select: { id: true, contentType: true, sortOrder: true },
        orderBy: { sortOrder: "asc" },
        take: 12
      }
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    // One extra row lets the server expose an opaque continuation cursor
    // without downloading the complete public history into the document.
    take: 81
  }
} satisfies Prisma.TerraqoProfessionalProfileSelect;

export type PublicCvProfile = Prisma.TerraqoProfessionalProfileGetPayload<{
  select: typeof publicCvProfileSelect;
}>;

// Archive routes only need the first page; the selected record is resolved separately.
export const publicCvArchiveProfileSelect = {
  ...publicCvProfileSelect,
  worklogs: { ...publicCvProfileSelect.worklogs, take: 21 },
} satisfies Prisma.TerraqoProfessionalProfileSelect;

// A published employment entry does not automatically publish its linked project.
export function redactPrivateProjects(profile: PublicCvProfile): PublicCvProfile {
  const visible = (project: { isPublic: boolean; deletedAt: Date | null } | null) =>
    project?.isPublic && !project.deletedAt;
  return {
    ...profile,
    experiences: profile.experiences.map(row => visible(row.project) ? row : { ...row, projectId: null, project: null }),
    worklogs: profile.worklogs.map(row => visible(row.project) ? row : { ...row, projectId: null, project: null }),
  };
}
