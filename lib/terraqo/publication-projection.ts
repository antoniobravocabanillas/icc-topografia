import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  buildPublicationSnapshot,
  publicationSnapshotHash,
  publicationSnapshotSchema,
  type PublicationSource,
} from "./publication-review-policy";
import {
  publicationReviewEnabled,
  publicationSourceSelect,
  PublicationReviewError,
} from "./publication-review";

export const PUBLICATION_PROJECTION_POLICY = "public-selection-v2";
const snapshotSchema = z
  .object({
    policy: z.literal(PUBLICATION_PROJECTION_POLICY),
    collectionId: z.string(),
    collectionVersion: z.number().int().positive(),
    title: z.string(),
    description: z.string().nullable(),
    items: publicationSnapshotSchema.shape.items,
    approvals: z
      .array(
        z
          .object({
            id: z.string(),
            workspaceId: z.string(),
            scopeHash: z.string(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();
export type PublicationProjectionSnapshot = z.infer<typeof snapshotSchema>;
export type PublicSelectionItem =
  PublicationProjectionSnapshot["items"][number];

export function publicSelectionPolicyWhere() {
  return {
    revokedAt: null,
    policyVersion: {
      in: publicationReviewEnabled()
        ? ["public-selection-v1", PUBLICATION_PROJECTION_POLICY]
        : ["public-selection-v1"],
    },
  };
}

function personalItems(collection: PublicationSource) {
  const personal = collection.items.filter(
    (item) => !item.revision.worklog.workspaceId,
  );
  if (!personal.length) return [];
  const copy = {
    ...collection,
    items: personal.map((item) => ({
      ...item,
      revision: {
        ...item.revision,
        worklog: { ...item.revision.worklog, workspaceId: "personal" },
      },
    })),
  };
  return buildPublicationSnapshot(copy, "personal").items;
}

/** Called under the collection row lock. Approval is consumed as an immutable
 * disclosure, never as blanket permission to read later mutable worklog fields. */
export async function preparePublicationProjection(
  tx: Prisma.TransactionClient,
  collectionId: string,
  expectedVersion: number,
) {
  if (!publicationReviewEnabled())
    throw new PublicationReviewError("Recurso no disponible.", 404);
  const collection = await tx.terraqoShareCollection.findFirst({
    where: { id: collectionId, lifecycle: { not: "ARCHIVED" } },
    select: publicationSourceSelect,
  });
  if (!collection || collection.version !== expectedVersion)
    throw new PublicationReviewError(
      "La selección cambió. Recarga antes de publicar.",
      409,
    );
  const workspaceIds = [
    ...new Set(
      collection.items.flatMap((item) =>
        item.revision.worklog.workspaceId
          ? [item.revision.worklog.workspaceId]
          : [],
      ),
    ),
  ].sort();
  const reviews = workspaceIds.length
    ? await tx.terraqoPublicationReview.findMany({
        where: {
          collectionId,
          collectionVersion: expectedVersion,
          decision: "APPROVED",
          revokedAt: null,
          workspace: { active: true, deletedAt: null },
        },
        select: {
          id: true,
          workspaceId: true,
          scopeHash: true,
          snapshot: true,
        },
      })
    : [];
  const items = personalItems(collection);
  const approvals: PublicationProjectionSnapshot["approvals"] = [];
  for (const workspaceId of workspaceIds) {
    const current = buildPublicationSnapshot(collection, workspaceId);
    const review = reviews.find((review) => review.workspaceId === workspaceId);
    if (
      !review ||
      review.scopeHash !== publicationSnapshotHash(current) ||
      publicationSnapshotHash(
        publicationSnapshotSchema.parse(review.snapshot),
      ) !== review.scopeHash
    )
      throw new PublicationReviewError(
        "Falta una autorización vigente para esta versión y su contenido.",
        409,
      );
    items.push(...current.items);
    approvals.push({ id: review.id, workspaceId, scopeHash: review.scopeHash });
  }
  const order = new Map(
    collection.items.map((item, i) => [item.revision.id, i]),
  );
  items.sort((a, b) => order.get(a.revisionId)! - order.get(b.revisionId)!);
  return snapshotSchema.parse({
    policy: PUBLICATION_PROJECTION_POLICY,
    collectionId,
    collectionVersion: expectedVersion,
    title: collection.title,
    description: collection.description,
    items,
    approvals,
  });
}

/** Load access roots in batches, not one SQL request per discovery candidate.
 * The new column/table are never queried while the rollout flag is disabled. */
export async function loadPublicationProjections(
  client: Prisma.TransactionClient,
  ids: string[],
) {
  const result = new Map<string, PublicationProjectionSnapshot>();
  if (!publicationReviewEnabled() || !ids.length) return result;
  const unique = [...new Set(ids)];
  for (let offset = 0; offset < unique.length; offset += 100) {
    const projections = await client.terraqoPublicProjection.findMany({
      where: {
        id: { in: unique.slice(offset, offset + 100) },
        ...publicSelectionPolicyWhere(),
        collection: { lifecycle: { not: "ARCHIVED" } },
      },
      select: {
        id: true,
        policyVersion: true,
        snapshot: true,
        collection: { select: publicationSourceSelect },
      },
    });
    const approvalIds = projections.flatMap((projection) => {
      const parsed = snapshotSchema.safeParse(projection.snapshot);
      return parsed.success
        ? parsed.data.approvals.map((approval) => approval.id)
        : [];
    });
    const reviews = approvalIds.length
      ? await client.terraqoPublicationReview.findMany({
          where: {
            id: { in: approvalIds },
            decision: "APPROVED",
            revokedAt: null,
            workspace: { active: true, deletedAt: null },
          },
          select: {
            id: true,
            collectionId: true,
            collectionVersion: true,
            workspaceId: true,
            scopeHash: true,
            snapshot: true,
          },
        })
      : [];
    for (const projection of projections) {
      const collection = projection.collection;
      if (projection.policyVersion === "public-selection-v1") {
        if (
          collection.items.some(
            (item) =>
              item.revision.worklog.workspaceId ||
              item.revision.worklog.deletedAt,
          )
        )
          continue;
        try {
          result.set(
            projection.id,
            snapshotSchema.parse({
              policy: PUBLICATION_PROJECTION_POLICY,
              collectionId: collection.id,
              collectionVersion: collection.version,
              title: collection.title,
              description: collection.description,
              items: personalItems(collection),
              approvals: [],
            }),
          );
        } catch {
          /* Removed material is not an authorization. */
        }
        continue;
      }
      const parsed = snapshotSchema.safeParse(projection.snapshot);
      if (!parsed.success || parsed.data.collectionId !== collection.id)
        continue;
      const snapshot = parsed.data;
      const approved = snapshot.approvals.every((approval) => {
        const review = reviews.find((review) => review.id === approval.id);
        if (
          !review ||
          review.collectionId !== collection.id ||
          review.collectionVersion !== snapshot.collectionVersion ||
          review.workspaceId !== approval.workspaceId ||
          review.scopeHash !== approval.scopeHash
        )
          return false;
        const reviewed = publicationSnapshotSchema.safeParse(review.snapshot);
        if (
          !reviewed.success ||
          publicationSnapshotHash(reviewed.data) !== review.scopeHash
        )
          return false;
        const workspaceItems = snapshot.items.filter((item) =>
          collection.items.some(
            (source) =>
              source.revision.id === item.revisionId &&
              source.revision.worklog.workspaceId === approval.workspaceId,
          ),
        );
        return (
          reviewed.data.title === snapshot.title &&
          reviewed.data.description === snapshot.description &&
          JSON.stringify(workspaceItems) === JSON.stringify(reviewed.data.items)
        );
      });
      if (!approved) continue;
      const valid = snapshot.items.every((item) => {
        const source = collection.items.find(
          (source) => source.revision.id === item.revisionId,
        );
        if (
          !source ||
          source.revision.worklog.deletedAt ||
          source.revision.contentHash !== item.contentHash ||
          source.revision.worklog.id !== item.worklogId
        )
          return false;
        if (
          source.revision.worklog.workspaceId &&
          !snapshot.approvals.some(
            (approval) =>
              approval.workspaceId === source.revision.worklog.workspaceId,
          )
        )
          return false;
        if (
          Object.keys(item.fields).some(
            (field) => !source.allowedFields.includes(field),
          )
        )
          return false;
        return item.mediaIds.every(
          (id) =>
            source.includeMedia &&
            source.mediaIds.includes(id) &&
            source.revision.worklog.media.some(
              (media) => media.id === id && media.contentType === "image/webp",
            ),
        );
      });
      if (valid) result.set(projection.id, snapshot);
    }
  }
  return result;
}

export async function readPublicationSource(
  client: Prisma.TransactionClient,
  projectionId: string,
  revisionId: string,
) {
  const projection = (
    await loadPublicationProjections(client, [projectionId])
  ).get(projectionId);
  return (
    projection?.items.find((item) => item.revisionId === revisionId) ?? null
  );
}
