import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  buildPublicationSnapshot,
  publicationDecisionSchema,
  publicationSnapshotHash,
  publicationSnapshotSchema,
} from "./publication-review-policy";

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

const sourceSelect = {
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
    select: sourceSelect,
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
      AND m.active=true AND w.active=true AND m.role::text IN ('OWNER','ADMIN')
    FOR SHARE OF m,w`);
  if (!members.length)
    throw new PublicationReviewError(
      "Tu permiso de administración no está vigente.",
      403,
    );
}

export async function requestPublicationReviews(input: {
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
      const reviews = [];
      for (const workspaceId of workspaceIds) {
        const workspace = await tx.terraqoWorkspace.findFirst({
          where: { id: workspaceId, active: true },
          select: { id: true },
        });
        if (!workspace)
          throw new PublicationReviewError(
            "La empresa ya no está disponible para revisar material.",
            409,
          );
        const snapshot = buildPublicationSnapshot(collection, workspaceId);
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

export async function listPublicationReviews(userId: string) {
  requireEnabled();
  const rows = await prisma.terraqoPublicationReview.findMany({
    where: {
      OR: [
        { requestedById: userId },
        {
          workspace: {
            active: true,
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
      if (
        collection.version !== review.collectionVersion ||
        publicationSnapshotHash(
          buildPublicationSnapshot(collection, review.workspaceId),
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
