import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getProfessionalDocumentStore } from "./media";
import { PortalResourceError } from "./portal-resources";
import type { WorkspacePortalToken } from "./workspace-portal-session";

export const professionalDocumentScope = (token: WorkspacePortalToken) => ({
  professionalProfile: { userId: token.sub },
  OR: [{ workspaceId: token.workspaceId }, { workspaceId: null }],
});

export async function listProfessionalDocuments(token: WorkspacePortalToken, cursor?: string) {
  const rows = await prisma.terraqoProfessionalDocument.findMany({
    where: professionalDocumentScope(token), orderBy: { id: "asc" }, take: 31,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, type: true, fileName: true, contentType: true, size: true,
      reviewStatus: true, uploadedAt: true, reviewedAt: true, _count: { select: { cvImports: true } } },
  });
  return { schemaVersion: 1, workspaceSlug: token.workspaceSlug, resource: "professionalDocuments",
    canCreate: false, nextCursor: rows.length > 30 ? rows[29].id : null,
    records: rows.slice(0, 30).map(row => ({
      id: row.id, title: row.fileName, subtitle: "Expediente privado", status: row.reviewStatus,
      updatedAt: (row.reviewedAt || row.uploadedAt).toISOString(), editable: false,
      canDelete: row.reviewStatus === "REJECTED" && !["DNI_FRONT", "DNI_BACK"].includes(row.type) && row._count.cvImports === 0,
      fields: { kind: "professionalDocument", fileName: row.fileName, contentType: row.contentType,
        size: String(row.size), type: row.type, uploadedAt: row.uploadedAt.toISOString(),
        reviewedAt: row.reviewedAt?.toISOString() || "" } as Record<string, string>,
    })),
  };
}

export async function removeProfessionalDocument(token: WorkspacePortalToken, id: string, version: string | null, store: Pick<ReturnType<typeof getProfessionalDocumentStore>, "delete"> = getProfessionalDocumentStore()) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || !version || !Number.isFinite(Date.parse(version)))
    throw new PortalResourceError("Recarga el documento antes de retirarlo.", 422);
  const removed = await prisma.$transaction(async tx => {
    // Lock the profile before the document. Ownership, review state, CV pointer,
    // audit and quota refund must be decided in the same transaction.
    const profiles = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM icc."TerraqoProfessionalProfile" WHERE "userId"=${token.sub} FOR UPDATE`);
    if (!profiles[0]) throw new PortalResourceError("Documento no disponible.", 404);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalDocument"
      WHERE id=${id} AND "professionalProfileId"=${profiles[0].id}
      AND ("workspaceId"=${token.workspaceId} OR "workspaceId" IS NULL) FOR UPDATE`);
    const document = await tx.terraqoProfessionalDocument.findFirst({ where: { id, ...professionalDocumentScope(token) },
      select: { id: true, storageKey: true, size: true, type: true, reviewStatus: true,
        uploadedAt: true, reviewedAt: true, _count: { select: { cvImports: true } } } });
    if (!document) throw new PortalResourceError("Documento no disponible.", 404);
    if (document.reviewStatus !== "REJECTED" || ["DNI_FRONT", "DNI_BACK"].includes(document.type) || document._count.cvImports)
      throw new PortalResourceError("Los documentos verificados, en revisión, de identidad o importados se conservan.", 409);
    if ((document.reviewedAt || document.uploadedAt).getTime() !== Date.parse(version))
      throw new PortalResourceError("El documento cambió. Recarga antes de retirarlo.", 409);
    await tx.terraqoProfessionalDocument.delete({ where: { id } });
    await tx.terraqoProfessionalProfile.updateMany({ where: { id: profiles[0].id, cvUrl: `/api/terraqo/professional-documents/${id}` }, data: { cvUrl: null } });
    const audit = await tx.activityLog.create({ data: { actorId: token.sub, terraqoWorkspaceId: token.workspaceId,
      action: "DELETED", entityType: "ProfessionalDocument", entityId: id,
      title: "Documento privado retirado", metadata: { source: "native-portal", type: document.type,
        storageCleanupState: "PENDING", storageCleanupKey: document.storageKey, storageCleanupBytes: document.size } }, select: { id: true } });
    return { ...document, auditId: audit.id };
  }, { maxWait: 15000, timeout: 15000 });
  // Keep a durable cleanup marker and retain quota until physical blob deletion
  // succeeds. SQL and external object storage cannot commit atomically.
  try {
    await store.delete(removed.storageKey);
    await prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."ActivityLog" WHERE id=${removed.auditId} AND "actorId"=${token.sub} FOR UPDATE`);
      const pending = await tx.activityLog.findFirst({ where: { id: removed.auditId, actorId: token.sub }, select: { metadata: true } });
      if ((pending?.metadata as { storageCleanupState?: string } | null)?.storageCleanupState !== "PENDING") return;
    // Historical quota baselines use aggregate rounding. Never refund below the
    // retained bytes of the remaining documents, worklogs and message files.
    const aggregates = await Promise.all([
      tx.terraqoProfessionalDocument.aggregate({ where: { professionalProfile: { userId: token.sub } }, _sum: { size: true } }),
      tx.terraqoWorklogMedia.aggregate({ where: { worklog: { authorId: token.sub } }, _sum: { size: true } }),
      tx.terraqoMessageAttachment.aggregate({ where: { message: { senderId: token.sub } }, _sum: { size: true } }),
    ]);
    const floor = Math.ceil(aggregates.reduce((sum, row) => sum + (row._sum.size || 0), 0) / 1_000_000);
    const units = Math.ceil(removed.size / 1_000_000);
    await tx.terraqoUsageBucket.updateMany({ where: { ownerKey: `user:${token.sub}`, period: "retained", metric: "storage-mb", used: { gte: floor + units } }, data: { used: { decrement: units } } });
      await tx.activityLog.update({ where: { id: removed.auditId }, data: { metadata: {
        source: "native-portal", type: removed.type, storageCleanupState: "COMPLETE" } } });
    }, { maxWait: 15000, timeout: 15000 });
    return { deleted: true, storageCleanupPending: false };
  } catch {
    return { deleted: true, storageCleanupPending: true };
  }
}
