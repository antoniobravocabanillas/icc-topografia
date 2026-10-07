import "server-only";
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { EducationEvidenceReservationError, educationPersonalStorageFloor, lockEducationEvidenceAccess } from "./education-evidence-reservation";
import type { WorkspacePortalToken } from "./workspace-portal-session";

// Internal parser/store output only. The endpoint must calculate fingerprint
// from validated bytes and metadata; a client hash is not proof of stored data.
type StoredFile = { fileName: string; contentType: string; size: number; fingerprint: string };
const fail = (message: string, status: number): never => { throw new EducationEvidenceReservationError(message, status); };

/** Caller must propagate every failure out of its transaction. No store writes
 * here: the durable attempt's RESERVED fence is checked before SQL retention. */
export async function commitEducationEvidenceInTransaction(tx: Prisma.TransactionClient, token: WorkspacePortalToken,
  educationId: string, attemptId: string, file: StoredFile) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(attemptId) || !/^[a-f0-9]{64}$/.test(file.fingerprint) ||
    !Number.isSafeInteger(file.size) || file.size < 1 || file.size > 4 * 1024 * 1024 ||
    file.fileName.length < 1 || file.fileName.length > 180 || /[\u0000-\u001f\u007f/\\]/.test(file.fileName) ||
    !["application/pdf", "image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.contentType))
    fail("Archivo inválido.", 422);
  const access = await lockEducationEvidenceAccess(tx, token, educationId);
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoEducationEvidenceAttempt"
    WHERE id=${attemptId} AND "educationId"=${educationId} FOR UPDATE`);
  const attempt = await tx.terraqoEducationEvidenceAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.educationId !== educationId || attempt.actorId !== token.sub) fail("Intento no disponible.", 404);
  if (attempt!.fingerprint !== file.fingerprint || attempt!.size !== file.size) fail("El archivo no coincide con el intento.", 409);
  const receipt = await tx.terraqoEducationEvidenceOperation.findUnique({
    where: { educationId_operationKey: { educationId, operationKey: attempt!.operationKey } },
  });
  if (receipt) {
    if (receipt.actorId !== token.sub || receipt.fingerprint !== file.fingerprint || receipt.size !== file.size ||
      receipt.fileName !== file.fileName || receipt.contentType !== file.contentType ||
      receipt.originalVersion.getTime() !== attempt!.originalVersion.getTime()) fail("La clave ya contiene otra operación.", 409);
    // History survives withdrawal. Returning it never recreates an evidence.
    // A losing physical attempt still requires its own durable cleanup.
    return { kind: "receipt" as const, receipt, currentVersion: access.education.updatedAt.toISOString(),
      cleanupAttemptId: attempt!.state === "COMMITTED" ? null : attempt!.id };
  }
  const key = /^education-evidence\/([A-Za-z0-9_-]{1,100})\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.exec(attempt!.storageKey);
  if (attempt!.state !== "RESERVED" || attempt!.reservedUnits !== Math.ceil(file.size / 1_000_000) || key?.[1] !== educationId)
    fail("El intento perdió su reserva. Consulta el resultado antes de reenviar.", 409);
  if (!["NOT_REQUESTED", "REJECTED"].includes(access.education.verificationStatus)) fail("La formación está protegida.", 403);
  if (access.education.updatedAt.getTime() !== attempt!.originalVersion.getTime()) fail("La formación cambió.", 409);
  if (await tx.terraqoEducationEvidence.count({ where: { educationId } }) >= 6) fail("La formación alcanzó seis archivos.", 422);
  const floor = await educationPersonalStorageFloor(tx, token.sub);
  const buckets = await tx.$queryRaw<{ used: number }[]>(Prisma.sql`SELECT used FROM icc."TerraqoUsageBucket"
    WHERE "ownerKey"=${`user:${token.sub}`} AND period='retained' AND metric='storage-mb' FOR UPDATE`);
  if (!buckets[0] || buckets[0].used < floor) fail("La reserva requiere revisión.", 409);
  if (buckets[0].used > access.storageMb) fail("La capacidad personal cambió.", 429);
  const version = new Date(Math.max(Date.now(), access.education.updatedAt.getTime() + 1));
  const changed = await tx.terraqoProfessionalEducation.updateMany({ where: { id: educationId,
    professionalProfileId: access.profileId, updatedAt: attempt!.originalVersion,
    verificationStatus: { in: ["NOT_REQUESTED", "REJECTED"] } }, data: { updatedAt: version } });
  if (changed.count !== 1) fail("La formación cambió.", 409);
  const retained = await tx.terraqoEducationEvidenceAttempt.updateMany({ where: { id: attemptId, state: "RESERVED",
    reservedUnits: attempt!.reservedUnits }, data: { state: "COMMITTED", nextAttemptAt: null } });
  if (retained.count !== 1) fail("El intento perdió su reserva.", 409);
  const evidence = await tx.terraqoEducationEvidence.create({ data: { educationId, uploadedById: token.sub,
    storageKey: attempt!.storageKey, fileName: file.fileName, contentType: file.contentType, size: file.size } });
  const id = createHash("sha256").update(JSON.stringify([token.sub, educationId, attempt!.operationKey, "education-evidence-v1"])).digest("hex");
  const saved = await tx.terraqoEducationEvidenceOperation.create({ data: { id, educationId, actorId: token.sub,
    operationKey: attempt!.operationKey, fingerprint: file.fingerprint, evidenceId: evidence.id,
    fileName: file.fileName, contentType: file.contentType, size: file.size,
    originalVersion: attempt!.originalVersion, resultVersion: version } });
  await tx.activityLog.create({ data: { actorId: token.sub, terraqoWorkspaceId: token.workspaceId, action: "CREATED",
    entityType: "EducationEvidence", entityId: evidence.id, title: "Evidencia privada de formación adjuntada",
    metadata: { source: "native-portal", operationId: id } } });
  // Wall-clock expiration can occur while locks are held. Roll back the entire
  // file/version/receipt/audit unit rather than commit under expired authority.
  if (access.grantExpires <= new Date() || token.exp <= Math.floor(Date.now() / 1000)) fail("La sesión venció.", 401);
  if (access.capacityExpirations.some(value => value <= new Date())) fail("La capacidad cambió.", 409);
  return { kind: "committed" as const, receipt: saved, currentVersion: version.toISOString(), cleanupAttemptId: null };
}

export function commitEducationEvidenceAttempt(database: Pick<PrismaClient, "$transaction">, token: WorkspacePortalToken,
  educationId: string, attemptId: string, file: StoredFile) {
  return database.$transaction(tx => commitEducationEvidenceInTransaction(tx, token, educationId, attemptId, file), { maxWait: 5000, timeout: 15000 });
}
