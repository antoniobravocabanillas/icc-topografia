import { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";

export class DocumentLifecycleError extends Error {
  constructor(message: string, readonly status: 404 | 409 | 422) { super(message); }
}

/** Prepared by the upload service after content validation and storage reservation.
 * Never populate storageKey/contentSha256 directly from an HTTP JSON payload.
 */
type PreparedReplacementFile = { storageKey: string; fileName: string; contentType: string; size: number; contentSha256: string };

export function documentReplacementFingerprint(documentId: string, expectedVersion: number, file: Omit<PreparedReplacementFile, "storageKey">) {
  return createHash("sha256").update(JSON.stringify([
    documentId, expectedVersion, file.contentSha256, file.fileName, file.contentType, file.size,
  ])).digest("hex");
}

/** Dormant transaction core; the upload orchestrator must compensate its own
 * unused blob/reservation on replay or rollback, never the committed successor.
 */
export async function replaceProfessionalDocumentInTransaction(
  tx: Prisma.TransactionClient,
  input: { actorId: string; documentId: string; expectedVersion: number; operationKey: string; file: PreparedReplacementFile },
) {
  const { file } = input;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(input.documentId) || !input.actorId ||
      !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || input.expectedVersion >= 2147483647 ||
      !/^[a-zA-Z0-9_-]{16,128}$/.test(input.operationKey) || !/^[a-f0-9]{64}$/.test(file.contentSha256) ||
      !Number.isSafeInteger(file.size) || file.size < 1 || file.size > 10 * 1024 * 1024 ||
      !file.fileName.trim() || file.fileName.length > 255 || /[\r\n\u0000]/.test(file.fileName)) {
    throw new DocumentLifecycleError("La versión del documento o el archivo no son válidos.", 422);
  }
  const profiles = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM icc."TerraqoProfessionalProfile" WHERE "userId"=${input.actorId} FOR UPDATE`);
  if (!profiles[0]) throw new DocumentLifecycleError("Documento no disponible.", 404);
  const rows = await tx.$queryRaw<Array<DocumentState & { workspaceId: string | null }>>(Prisma.sql`
    SELECT id,type::text,"workspaceId","lifecycleVersion","withdrawnAt","withdrawnByUserId","withdrawOperationKey"
    FROM icc."TerraqoProfessionalDocument" WHERE id=${input.documentId}
      AND "professionalProfileId"=${profiles[0].id} FOR UPDATE`);
  const document = rows[0];
  if (!document) throw new DocumentLifecycleError("Documento no disponible.", 404);
  if (["DNI_FRONT", "DNI_BACK"].includes(document.type)) throw new DocumentLifecycleError("La identidad requiere su propio proceso de revisión.", 409);
  if (document.workspaceId) {
    const members = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoWorkspaceMember"
      WHERE "workspaceId"=${document.workspaceId} AND "userId"=${input.actorId} AND active=true AND role='PROFESSIONAL' FOR SHARE`);
    if (!members.length) throw new DocumentLifecycleError("Documento no disponible.", 404);
  }
  const allowed = document.type === "CV"
    ? ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
    : ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.contentType) || !file.storageKey.startsWith(`professional-documents/${profiles[0].id}/${document.type.toLowerCase()}/`) ||
      file.storageKey.length > 1024 || /\.\.|[\\\u0000\r\n]/.test(file.storageKey)) {
    throw new DocumentLifecycleError("El archivo no corresponde al expediente.", 422);
  }
  // Storage allocation is attempt-specific; fingerprint binds the actual content
  // and user-visible intent so a retry can safely use a different temporary key.
  const fingerprint = documentReplacementFingerprint(input.documentId, input.expectedVersion, file);
  const previous = await tx.$queryRaw<Array<{ id: string; replacesDocumentId: string; replacementFingerprint: string; lifecycleVersion: number }>>(Prisma.sql`
    SELECT id,"replacesDocumentId","replacementFingerprint","lifecycleVersion" FROM icc."TerraqoProfessionalDocument"
    WHERE "professionalProfileId"=${profiles[0].id} AND "replacementOperationKey"=${input.operationKey}`);
  if (previous[0]) {
    if (previous[0].replacesDocumentId !== document.id || previous[0].replacementFingerprint !== fingerprint)
      throw new DocumentLifecycleError("Ese intento ya se utilizó con otro contenido.", 409);
    return { id: previous[0].id, replayed: true };
  }
  if (document.withdrawnAt || document.lifecycleVersion !== input.expectedVersion)
    throw new DocumentLifecycleError("El documento cambió. Actualiza el expediente.", 409);
  const successors = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalDocument" WHERE "replacesDocumentId"=${document.id}`);
  if (successors.length) throw new DocumentLifecycleError("Ya existe una versión posterior. Actualiza el expediente.", 409);
  const id = randomUUID();
  await tx.$executeRaw(Prisma.sql`INSERT INTO icc."TerraqoProfessionalDocument"
    (id,"professionalProfileId","workspaceId",type,"storageKey","fileName","contentType",size,"replacesDocumentId","replacementOperationKey","replacementFingerprint")
    SELECT ${id},"professionalProfileId","workspaceId",type,${file.storageKey},${file.fileName},${file.contentType},${file.size},id,${input.operationKey},${fingerprint}
    FROM icc."TerraqoProfessionalDocument" WHERE id=${document.id} AND "professionalProfileId"=${profiles[0].id}`);
  if (document.type === "CV") {
    await tx.$executeRaw(Prisma.sql`UPDATE icc."TerraqoProfessionalProfile" SET "cvUrl"=${`/api/terraqo/professional-documents/${id}`}
      WHERE id=${profiles[0].id} AND "cvUrl"=${`/api/terraqo/professional-documents/${document.id}`}`);
  }
  return { id, replayed: false };
}

type Withdrawal = { id: string; lifecycleVersion: number; withdrawnAt: Date; replayed: boolean };
type DocumentState = { id: string; type: string; lifecycleVersion: number; withdrawnAt: Date | null;
  withdrawnByUserId: string | null; withdrawOperationKey: string | null };

/** Not wired to routes until all readers/workers enforce withdrawal and the additive DDL is deployed.
 * Caller must supply one interactive transaction; actor comes from authenticated server context.
 * Profile-first lock order matches upload/deletion. Blob retention means no quota refund here.
 */
export async function withdrawProfessionalDocumentInTransaction(
  tx: Prisma.TransactionClient,
  input: { actorId: string; documentId: string; expectedVersion: number; operationKey: string },
): Promise<Withdrawal> {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(input.documentId) || !input.actorId ||
      !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || input.expectedVersion >= 2147483647 ||
      !/^[a-zA-Z0-9_-]{16,128}$/.test(input.operationKey)) {
    throw new DocumentLifecycleError("Actualiza el documento antes de retirarlo.", 422);
  }
  const profiles = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM icc."TerraqoProfessionalProfile" WHERE "userId"=${input.actorId} FOR UPDATE`);
  if (!profiles[0]) throw new DocumentLifecycleError("Documento no disponible.", 404);
  const rows = await tx.$queryRaw<DocumentState[]>(Prisma.sql`
    SELECT id,type::text,"lifecycleVersion","withdrawnAt","withdrawnByUserId","withdrawOperationKey"
    FROM icc."TerraqoProfessionalDocument" WHERE id=${input.documentId}
      AND "professionalProfileId"=${profiles[0].id} FOR UPDATE`);
  const document = rows[0];
  if (!document) throw new DocumentLifecycleError("Documento no disponible.", 404);
  if (document.withdrawnAt) {
    if (document.withdrawnByUserId === input.actorId && document.withdrawOperationKey === input.operationKey &&
        document.lifecycleVersion === input.expectedVersion + 1) {
      return { id: document.id, lifecycleVersion: document.lifecycleVersion, withdrawnAt: document.withdrawnAt, replayed: true };
    }
    throw new DocumentLifecycleError("El documento cambió. Actualiza el expediente.", 409);
  }
  if (document.lifecycleVersion !== input.expectedVersion) throw new DocumentLifecycleError("El documento cambió. Actualiza el expediente.", 409);
  if (["DNI_FRONT", "DNI_BACK"].includes(document.type)) throw new DocumentLifecycleError("El retiro de identidad requiere una revisión específica.", 409);

  // These immutable fields are the withdrawal audit itself: same transaction,
  // exact actor/key/time/version. Review history and retained file remain intact.
  const changed = await tx.$queryRaw<Array<{ id: string; lifecycleVersion: number; withdrawnAt: Date }>>(Prisma.sql`
    UPDATE icc."TerraqoProfessionalDocument" SET "withdrawnAt"=clock_timestamp(),
      "withdrawnByUserId"=${input.actorId},"withdrawOperationKey"=${input.operationKey},"lifecycleVersion"="lifecycleVersion"+1
    WHERE id=${document.id} AND "professionalProfileId"=${profiles[0].id}
      AND "lifecycleVersion"=${input.expectedVersion} AND "withdrawnAt" IS NULL
    RETURNING id,"lifecycleVersion","withdrawnAt"`);
  if (changed.length !== 1) throw new DocumentLifecycleError("El documento cambió. Actualiza el expediente.", 409);
  await tx.$executeRaw(Prisma.sql`UPDATE icc."TerraqoProfessionalProfile" SET "cvUrl"=NULL
    WHERE id=${profiles[0].id} AND "cvUrl"=${`/api/terraqo/professional-documents/${document.id}`}`);
  return { ...changed[0], replayed: false };
}
