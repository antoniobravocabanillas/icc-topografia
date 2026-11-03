import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ACCESS_REQUEST_RECEIPT, SelectionAccessRequestError, validateAccessExpiry, selectionAccessRequestSchema, selectionAccessDecisionSchema } from "./selection-access-request-policy";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function selectionAccessRequestsEnabled() {
  return process.env.TERRAQO_SCOPED_SHARING_V1 === "true" && process.env.TERRAQO_SELECTION_ACCESS_REQUESTS_V1 === "true";
}

export async function requestSelectionAccess(userId: string, payload: z.infer<typeof selectionAccessRequestSchema>) {
  const targetHash = hash([payload.targetType, payload.target]);
  const now = new Date();
  return prisma.$transaction(async tx => {
    // Serialize every attempt by this actor, including nonexistent targets. The response never reveals existence.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."User" WHERE id=${userId} FOR UPDATE`);
    const existing = await tx.terraqoSelectionAccessRequest.findUnique({ where: { requesterId_targetHash: { requesterId: userId, targetHash } } });
    if (existing && (existing.status === "PENDING" || now.getTime() - existing.requestedAt.getTime() < 86_400_000)) return ACCESS_REQUEST_RECEIPT;
    const attempts = await tx.terraqoSelectionAccessRequest.count({ where: { requesterId: userId, requestedAt: { gte: new Date(now.getTime() - 86_400_000) } } });
    if (attempts >= 10) throw new SelectionAccessRequestError("Alcanzaste el límite diario de solicitudes. Inténtalo mañana.", 429);
    const collection = payload.targetType === "collection"
      ? await tx.terraqoShareCollection.findUnique({ where: { id: payload.target }, select: { id: true, createdById: true, lifecycle: true, version: true } })
      : (await tx.terraqoPublicProjection.findUnique({ where: { slug: payload.target }, select: { collection: { select: { id: true, createdById: true, lifecycle: true, version: true } } } }))?.collection;
    const target = collection && collection.lifecycle !== "ARCHIVED" && collection.createdById !== userId ? collection : null;
    const data = { collectionId: target?.id ?? null, collectionVersion: target?.version ?? null, message: payload.message || null, requestedAt: now, status: "PENDING", decidedById: null, decidedAt: null, decisionHash: null, grantId: null };
    if (existing) await tx.terraqoSelectionAccessRequest.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } });
    else await tx.terraqoSelectionAccessRequest.create({ data: { ...data, requesterId: userId, targetHash } });
    return ACCESS_REQUEST_RECEIPT;
  }, { isolationLevel: "Serializable" });
}

export async function listSelectionAccessRequests(userId: string) {
  return prisma.terraqoSelectionAccessRequest.findMany({
    where: { collection: { createdById: userId, lifecycle: { not: "ARCHIVED" } }, status: "PENDING" },
    select: { id: true, version: true, message: true, requestedAt: true, collectionVersion: true, requester: { select: { id: true, name: true } }, collection: { select: { id: true, title: true, version: true, items: { select: { allowedFields: true, includeMedia: true, mediaIds: true } } } } },
    orderBy: [{ requestedAt: "asc" }, { id: "asc" }], take: 100,
  });
}

export async function resolveRequestedSelectionAccess(userId: string, target: Pick<z.infer<typeof selectionAccessRequestSchema>, "targetType" | "target">) {
  // An old approval is not authorization. Recheck its live grant on every lookup.
  // Unknown, pending, declined, expired and revoked targets have the same response.
  const request = await prisma.terraqoSelectionAccessRequest.findFirst({
    where: {
      requesterId: userId, targetHash: hash([target.targetType, target.target]), status: "APPROVED",
      collection: { lifecycle: { not: "ARCHIVED" } },
      grant: { subjectUserId: userId, lifecycle: "ACTIVE", revokedAt: null, expiresAt: { gt: new Date() }, scopes: { has: "VIEW_COLLECTION" } },
    },
    select: { collectionId: true, grant: { select: { collectionId: true, expiresAt: true } } },
  });
  if (!request?.collectionId || request.grant?.collectionId !== request.collectionId) return { available: false } as const;
  return { available: true, href: `/portal/selecciones/${encodeURIComponent(request.collectionId)}`, expiresAt: request.grant.expiresAt.toISOString() } as const;
}

export async function decideSelectionAccess(userId: string, payload: z.infer<typeof selectionAccessDecisionSchema>) {
  const decisionHash = hash(payload);
  return prisma.$transaction(async tx => {
    const request = await tx.terraqoSelectionAccessRequest.findFirst({ where: { id: payload.requestId, collection: { createdById: userId, lifecycle: { not: "ARCHIVED" } } }, select: { collectionId: true } });
    if (!request?.collectionId) throw new SelectionAccessRequestError("Solicitud no disponible.", 404);
    // Match grant/revocation lock order. Decision and grant are one atomic transaction.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoShareCollection" WHERE id=${request.collectionId} FOR UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoSelectionAccessRequest" WHERE id=${payload.requestId} FOR UPDATE`);
    const current = await tx.terraqoSelectionAccessRequest.findUnique({ where: { id: payload.requestId }, include: { collection: { include: { items: { select: { includeMedia: true, mediaIds: true } } } } } });
    if (!current?.collection || current.collection.createdById !== userId || current.collection.lifecycle === "ARCHIVED") throw new SelectionAccessRequestError("Solicitud no disponible.", 404);
    if (current.status !== "PENDING") {
      if (current.decisionHash === decisionHash) return { status: current.status, replayed: true };
      throw new SelectionAccessRequestError("Esta solicitud ya fue resuelta.", 409);
    }
    if (current.version !== payload.expectedVersion) throw new SelectionAccessRequestError("La solicitud cambió. Recarga antes de decidir.", 409);
    let grantId: string | null = null;
    if (payload.decision === "APPROVED") {
      if (current.collection.version !== payload.expectedCollectionVersion) throw new SelectionAccessRequestError("La selección cambió desde tu revisión. Recarga y revisa sus campos antes de aprobar.", 409);
      if (current.collection.version !== current.collectionVersion && !payload.scopeChangeConfirmed) throw new SelectionAccessRequestError("Confirma que revisaste el alcance actualizado de la selección.", 409);
      const expiresAt = validateAccessExpiry(payload.expiresAt, new Date());
      if (payload.allowDownload && !current.collection.items.some(item => item.includeMedia && item.mediaIds.length)) throw new SelectionAccessRequestError("La selección no incluye adjuntos para descargar.", 422);
      const grant = await tx.terraqoAccessGrant.create({ data: { collectionId: current.collection.id, subjectUserId: current.requesterId, issuedById: userId, scopes: payload.allowDownload ? ["VIEW_COLLECTION", "DOWNLOAD_MEDIA"] : ["VIEW_COLLECTION"], expiresAt, operationKey: `access-request:${current.id}:${current.version}`, operationFingerprint: decisionHash }, select: { id: true } });
      grantId = grant.id;
      await tx.terraqoShareCollection.update({ where: { id: current.collection.id }, data: { version: { increment: 1 }, lifecycle: "ACTIVE" } });
    }
    await tx.terraqoSelectionAccessRequest.update({ where: { id: current.id }, data: { status: payload.decision, decidedById: userId, decidedAt: new Date(), decisionHash, grantId, version: { increment: 1 } } });
    return { status: payload.decision, replayed: false };
  }, { isolationLevel: "Serializable" });
}
