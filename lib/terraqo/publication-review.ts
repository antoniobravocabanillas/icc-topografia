import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  buildPublicationSnapshot,
  publicationDecisionSchema,
  publicationSnapshotHash,
  publicationSnapshotSchema,
} from "./publication-review-policy";

import type {
  WorkCaseTarget,
  PublicationSource,
} from "./publication-review-policy";
import { caseDisclosure, workCaseScope } from "./work-case-publication";

export class PublicationReviewError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "PublicationReviewError";
  }
}
export function publicationReviewEnabled() {
  return process.env.TERRAQO_WORKSPACE_PUBLICATION_V1 === "true";
}
function requireEnabled() {
  if (!publicationReviewEnabled())
    throw new PublicationReviewError("Recurso no disponible.", 404);
}

export const publicationSourceSelect = {
  id: true,
  version: true,
  title: true,
  description: true,
  items: {
    orderBy: { sortOrder: "asc" },
    select: {
      allowedFields: true,
      includeMedia: true,
      mediaIds: true,
      revision: {
        select: {
          id: true,
          revisionNo: true,
          contentHash: true,
          title: true,
          summary: true,
          outcome: true,
          contributionRole: true,
          responsibilities: true,
          methods: true,
          tools: true,
          worklog: {
            select: {
              id: true,
              workspaceId: true,
              deletedAt: true,
              occurredAt: true,
              locationLabel: true,
              media: { select: { id: true, contentType: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.TerraqoShareCollectionSelect;

async function collectionForReview(tx: Prisma.TransactionClient, id: string) {
  const collection = await tx.terraqoShareCollection.findFirst({
    where: { id, lifecycle: { not: "ARCHIVED" } },
    select: publicationSourceSelect,
  });
  if (!collection)
    throw new PublicationReviewError("Selección no disponible.", 404);
  return collection;
}
async function administrator(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
) {
  // Lock the authority rows too: a simultaneous suspension cannot authorize this decision.
  const members = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT m.id FROM icc."TerraqoWorkspaceMember" m
    JOIN icc."TerraqoWorkspace" w ON w.id=m."workspaceId"
    WHERE m."workspaceId"=${workspaceId} AND m."userId"=${userId}
      AND m.active=true AND w.active=true AND w."deletedAt" IS NULL AND m.role::text IN ('OWNER','ADMIN')
    FOR SHARE OF m,w`);
  if (!members.length)
    throw new PublicationReviewError(
      "Tu permiso de administración no está vigente.",
      403,
    );
}

export async function requireCaseScope(
  tx: Prisma.TransactionClient,
  source: PublicationSource,
  target?: WorkCaseTarget,
) {
  let disclosure;
  try {
    disclosure = caseDisclosure(source);
  } catch {
    throw new PublicationReviewError(
      "El contenido seleccionado ya no está disponible.",
      409,
    );
  }
  const scope = await workCaseScope(tx, disclosure, target);
  if (!scope)
    throw new PublicationReviewError(
      "La agrupación o su versión ya no está disponible.",
      409,
    );
  return scope;
}

export async function requestPublicationReviews(input: {
  workCase?: WorkCaseTarget;
  userId: string;
  collectionId: string;
  expectedVersion: number;
}) {
  requireEnabled();
  return prisma.$transaction(
    async (tx) => {
      const owned = await tx.terraqoShareCollection.findFirst({
        where: { id: input.collectionId, createdById: input.userId },
        select: { id: true },
      });
      if (!owned)
        throw new PublicationReviewError("Selección no disponible.", 404);
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM icc."TerraqoShareCollection" WHERE id=${owned.id} FOR UPDATE`,
      );
      const collection = await collectionForReview(tx, owned.id);
      if (collection.version !== input.expectedVersion)
        throw new PublicationReviewError(
          "La selección cambió. Recarga antes de solicitar autorización.",
          409,
        );
      const workspaceIds = [
        ...new Set(
          collection.items
            .map((item) => item.revision.worklog.workspaceId)
            .filter((id): id is string => !!id),
        ),
      ].sort();
      if (!workspaceIds.length)
        throw new PublicationReviewError(
          "Esta selección no contiene material empresarial.",
          422,
        );
      const caseScope = input.workCase
        ? await requireCaseScope(tx, collection, input.workCase)
        : undefined;
      const reviews = [];
      for (const workspaceId of workspaceIds) {
        const workspace = await tx.terraqoWorkspace.findFirst({
          where: { id: workspaceId, active: true, deletedAt: null },
          select: { id: true },
        });
        if (!workspace)
          throw new PublicationReviewError(
            "La empresa ya no está disponible para revisar material.",
            409,
          );
        const snapshot = buildPublicationSnapshot(
          collection,
          workspaceId,
          caseScope,
        );
        const scopeHash = publicationSnapshotHash(snapshot);
        const existing = await tx.terraqoPublicationReview.findUnique({
          where: {
            collectionId_workspaceId_collectionVersion: {
              collectionId: collection.id,
              workspaceId,
              collectionVersion: collection.version,
            },
          },
        });
        if (existing) {
          if (existing.scopeHash !== scopeHash)
            throw new PublicationReviewError(
              "El contenido cambió. Crea una nueva selección para pedir otra autorización.",
              409,
            );
          reviews.push(existing);
        } else {
          reviews.push(
            await tx.terraqoPublicationReview.create({
              data: {
                collectionId: collection.id,
                workspaceId,
                collectionVersion: collection.version,
                scopeHash,
                snapshot,
                requestedById: input.userId,
              },
            }),
          );
        }
      }
      // Creating requests never creates a public projection or changes grants.
      return reviews.map((review) => ({
        id: review.id,
        workspaceId: review.workspaceId,
        decision: review.decision,
        revokedAt: review.revokedAt,
        scopeHash: review.scopeHash,
        collectionVersion: review.collectionVersion,
      }));
    },
    { isolationLevel: "Serializable" },
  );
}

export async function listPublicationReviews(
  userId: string,
  workspaceId?: string,
) {
  requireEnabled();
  const rows = await prisma.terraqoPublicationReview.findMany({
    where: {
      ...(workspaceId ? { workspaceId } : {}),
      OR: [
        { requestedById: userId },
        {
          workspace: {
            active: true,
            deletedAt: null,
            members: {
              some: { userId, active: true, role: { in: ["OWNER", "ADMIN"] } },
            },
          },
        },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    select: {
      id: true,
      collectionId: true,
      collectionVersion: true,
      workspaceId: true,
      scopeHash: true,
      snapshot: true,
      decision: true,
      decidedAt: true,
      comment: true,
      revokedAt: true,
      revokedReason: true,
      createdAt: true,
      requestedById: true,
      workspace: { select: { name: true } },
    },
  });
  return rows.map(({ snapshot, requestedById, ...row }) => ({
    ...row,
    requestedByMe: requestedById === userId,
    snapshot: publicationSnapshotSchema.parse(snapshot),
  }));
}

/** Resolve only a pinned attachment. Permission is evaluated on every read;
 * knowing a review/media id never grants access to other company material. */
export async function getPublicationReviewMedia(input: {
  userId: string;
  reviewId: string;
  mediaId: string;
}) {
  requireEnabled();
  const review = await prisma.terraqoPublicationReview.findFirst({
    where: {
      id: input.reviewId,
      revokedAt: null,
      collection: { lifecycle: { not: "ARCHIVED" } },
      OR: [
        { requestedById: input.userId },
        {
          workspace: {
            active: true,
            deletedAt: null,
            members: {
              some: {
                userId: input.userId,
                active: true,
                role: { in: ["OWNER", "ADMIN"] },
              },
            },
          },
        },
      ],
    },
    select: { snapshot: true, scopeHash: true, workspaceId: true, decision: true,
      collectionVersion: true, collection: { select: { version: true } } },
  });
  // An obsolete pending request can never be approved. Its preview must not
  // become a second byte-access path after a newer authorization is withdrawn.
  if (!review || (review.decision === "PENDING" && review.collectionVersion !== review.collection.version))
    throw new PublicationReviewError("Recurso no disponible.", 404);
  const snapshot = publicationSnapshotSchema.parse(review.snapshot);
  if (publicationSnapshotHash(snapshot) !== review.scopeHash)
    throw new PublicationReviewError("El alcance no está disponible.", 409);
  const item = snapshot.items.find((item) =>
    item.mediaIds.includes(input.mediaId),
  );
  if (!item) throw new PublicationReviewError("Recurso no disponible.", 404);
  const media = await prisma.terraqoWorklogMedia.findFirst({
    where: {
      id: input.mediaId,
      contentType: "image/webp",
      worklog: {
        id: item.worklogId,
        workspaceId: review.workspaceId,
        deletedAt: null,
        revisions: {
          some: { id: item.revisionId, contentHash: item.contentHash },
        },
      },
    },
    select: { storageKey: true, contentType: true },
  });
  if (!media) throw new PublicationReviewError("Recurso no disponible.", 404);
  return media;
}

export async function decidePublicationReview(input: {
  userId: string;
  reviewId: string;
  payload: z.infer<typeof publicationDecisionSchema>;
}) {
  requireEnabled();
  const payload = publicationDecisionSchema.parse(input.payload);
  return prisma.$transaction(
    async (tx) => {
      const pointer = await tx.terraqoPublicationReview.findUnique({
        where: { id: input.reviewId },
        select: { collectionId: true, workspaceId: true },
      });
      if (!pointer)
        throw new PublicationReviewError("Solicitud no disponible.", 404);
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM icc."TerraqoShareCollection" WHERE id=${pointer.collectionId} FOR UPDATE`,
      );
      await administrator(tx, pointer.workspaceId, input.userId);
      const review = await tx.terraqoPublicationReview.findUniqueOrThrow({
        where: { id: input.reviewId },
      });
      if (review.revokedAt || review.scopeHash !== payload.scopeHash)
        throw new PublicationReviewError("El alcance ya no está vigente.", 409);
      if (review.decision !== "PENDING") {
        if (
          review.decidedById === input.userId &&
          review.decision === payload.decision &&
          review.comment === (payload.comment || null)
        )
          return {
            id: review.id,
            decision: review.decision,
            decidedAt: review.decidedAt,
          };
        throw new PublicationReviewError(
          "La solicitud ya tiene una decisión.",
          409,
        );
      }
      const collection = await collectionForReview(tx, review.collectionId);
      const reviewed = publicationSnapshotSchema.parse(review.snapshot);
      const caseScope = reviewed.workCaseScope
        ? await requireCaseScope(tx, collection)
        : undefined;
      if (
        collection.version !== review.collectionVersion ||
        publicationSnapshotHash(
          buildPublicationSnapshot(collection, review.workspaceId, caseScope),
        ) !== review.scopeHash
      )
        throw new PublicationReviewError(
          "El contenido cambió desde la solicitud. Se necesita otra autorización.",
          409,
        );
      return tx.terraqoPublicationReview.update({
        where: { id: review.id },
        data: {
          decision: payload.decision,
          comment: payload.comment || null,
          decidedById: input.userId,
          decidedAt: new Date(),
        },
        select: { id: true, decision: true, decidedAt: true },
      });
    },
    { isolationLevel: "Serializable" },
  );
}

export async function revokePublicationReview(input: {
  userId: string;
  reviewId: string;
  reason: string;
}) {
  requireEnabled();
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 2000)
    throw new PublicationReviewError(
      "Indica el motivo del retiro (3 a 2000 caracteres).",
      422,
    );
  return prisma.$transaction(
    async (tx) => {
      const pointer = await tx.terraqoPublicationReview.findUnique({
        where: { id: input.reviewId },
        select: { collectionId: true, workspaceId: true },
      });
      if (!pointer)
        throw new PublicationReviewError("Solicitud no disponible.", 404);
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM icc."TerraqoShareCollection" WHERE id=${pointer.collectionId} FOR UPDATE`,
      );
      await administrator(tx, pointer.workspaceId, input.userId);
      const review = await tx.terraqoPublicationReview.findUniqueOrThrow({
        where: { id: input.reviewId },
      });
      if (review.revokedAt) return { revoked: true };
      if (review.decision !== "APPROVED")
        throw new PublicationReviewError(
          "Solo se puede retirar una autorización concedida.",
          409,
        );
      const now = new Date();
      await tx.terraqoPublicationReview.update({
        where: { id: review.id },
        data: {
          revokedAt: now,
          revokedById: input.userId,
          revokedReason: reason,
        },
      });
      // Revoke the actual access root in the same transaction; no cached grant can reopen it.
      await tx.terraqoPublicProjection.updateMany({
        where: { collectionId: review.collectionId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.terraqoShareCollection.update({
        where: { id: review.collectionId },
        data: { version: { increment: 1 } },
        select: { id: true },
      });
      return { revoked: true };
    },
    { isolationLevel: "Serializable" },
  );
}
