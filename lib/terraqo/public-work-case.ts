import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publicationReviewEnabled } from "./publication-review";
import { workCaseScope } from "./work-case-publication";
import {
  type PublicSelectionItem,
  PUBLICATION_PROJECTION_POLICY,
  loadPublicationProjections,
} from "./publication-projection";
import { publishedCvProfileWhere } from "./public-cv";

// The public identity is a publication slug. The private organizer's name,
// description, phase, member count and identifiers never enter the public DTO.
async function readPage(
  username: string,
  after: string | undefined,
  limit: number,
  slug?: string,
) {
  if (
    !publicationReviewEnabled() ||
    process.env.TERRAQO_WORK_CASES_V1 !== "true" ||
    process.env.TERRAQO_SCOPED_SHARING_V1 !== "true"
  )
    return [];
  return prisma.$transaction(
    async (tx) => {
      const profile = await tx.terraqoProfessionalProfile.findUnique({
        where: publishedCvProfileWhere(username),
        select: { id: true },
      });
      if (!profile) return [];
      const cases: PublicWorkCase[] = [];
      let cursor = after;
      // Scan in bounded batches. Unavailable publications must not crowd older
      // authorized work off the CV or contribute to its counts or pagination.
      while (cases.length < limit) {
        const roots = await tx.terraqoPublicProjection.findMany({
          where: {
            policyVersion: PUBLICATION_PROJECTION_POLICY,
            revokedAt: null,
            snapshot: { path: ["workCaseScope"], string_starts_with: "" },
            slug: slug ?? (cursor ? { gt: cursor } : undefined),
            collection: {
              professionalProfileId: profile.id,
              lifecycle: "ACTIVE",
              archivedAt: null,
            },
          },
          orderBy: { slug: "asc" },
          take: 16,
          select: { id: true, slug: true },
        });
        const snapshots = await loadPublicationProjections(
          tx,
          roots.map((root) => root.id),
        );
        for (const root of roots) {
          const snapshot = snapshots.get(root.id);
          if (
            !snapshot?.workCaseScope ||
            (await workCaseScope(tx, snapshot)) !== snapshot.workCaseScope
          )
            continue;
          cases.push({
            slug: root.slug,
            title: snapshot.title,
            description: snapshot.description,
            items: snapshot.items.map((item) => ({
              worklogId: item.worklogId,
              revisionId: item.revisionId,
              ...item.fields,
              media: item.mediaIds.map((id) => ({
                id,
                href: `/api/public/cv/${encodeURIComponent(username)}/trabajos/${encodeURIComponent(root.slug)}/media/${encodeURIComponent(id)}`,
              })),
            })),
          });
          if (cases.length === limit) break;
        }
        if (slug || roots.length < 16) break;
        cursor = roots[roots.length - 1].slug;
      }
      return cases;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

export type PublicWorkCase = {
  slug: string;
  title: string;
  description: string | null;
  items: Array<
    PublicSelectionItem["fields"] & {
      worklogId: string;
      revisionId: string;
      media: Array<{ id: string; href: string }>;
    }
  >;
};
export type PublicWorkCaseCard = Pick<
  PublicWorkCase,
  "slug" | "title" | "description"
> & { count: number; image?: string };

export async function publicWorkCaseCards(
  username: string,
  limit: number,
  after?: string,
) {
  const cases = await readPage(username, after, limit + 1);
  return {
    cards: cases.slice(0, limit).map(({ slug, title, description, items }) => ({
      slug,
      title,
      description,
      count: new Set(items.map((item) => item.worklogId)).size,
      image: items.find((item) => item.media.length)?.media[0].href,
    })),
    hasMore: cases.length > limit,
  };
}

export async function publicWorkCase(username: string, slug: string) {
  return (await readPage(username, undefined, 1, slug))[0] ?? null;
}
