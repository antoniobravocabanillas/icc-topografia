import "server-only";
import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { EducationEvidenceReservationError, lockEducationEvidenceAccess } from "./education-evidence-reservation";
import { getPrivateEvidenceStreamStore, type PrivateEvidenceStreamStore } from "./media";
import { readPrivateEvidenceStream } from "./private-evidence-stream";
import type { WorkspacePortalToken } from "./workspace-portal-session";

type Database = Pick<PrismaClient, "$transaction">;
const options = { maxWait: 5000, timeout: 15000 };
const fail = (message: string, status: number): never => { throw new EducationEvidenceReservationError(message, status); };
function fresh(access: Awaited<ReturnType<typeof lockEducationEvidenceAccess>>, token: WorkspacePortalToken) {
  if (access.grantExpires <= new Date() || token.exp <= Math.floor(Date.now() / 1000)) fail("La sesión venció.", 401);
  if (access.capacityExpirations.some(value => value <= new Date())) fail("El acceso cambió. Recarga la formación.", 409);
}

/** A null historical receipt is an observation, never permission to retry POST
 * automatically or a claim that an uncertain request can no longer commit. */
export function readEducationEvidence(database: Database, token: WorkspacePortalToken, educationId: string, operationKey?: string) {
  if (operationKey !== undefined && !/^[a-f0-9]{32}$/.test(operationKey)) fail("Clave de operación no válida.", 422);
  return database.$transaction(async tx => {
    const access = await lockEducationEvidenceAccess(tx, token, educationId);
    const files = await tx.terraqoEducationEvidence.findMany({ where: { educationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 7,
      select: { id: true, fileName: true, contentType: true, size: true, createdAt: true } });
    if (files.length > 6) fail("Los archivos requieren revisión.", 409);
    const receipt = operationKey === undefined ? null : await tx.terraqoEducationEvidenceOperation.findUnique({
      where: { educationId_operationKey: { educationId, operationKey } },
      select: { actorId: true, operationKey: true, evidenceId: true, fileName: true, contentType: true, size: true,
        originalVersion: true, resultVersion: true, createdAt: true } });
    if (receipt && receipt.actorId !== token.sub) fail("Operación no disponible.", 404);
    fresh(access, token);
    return { current: { educationId, version: access.education.updatedAt.toISOString(),
      verificationStatus: access.education.verificationStatus },
      files: files.map(file => ({ ...file, createdAt: file.createdAt.toISOString() })),
      receipt: receipt ? { operationKey: receipt.operationKey, evidenceId: receipt.evidenceId,
        fileName: receipt.fileName, contentType: receipt.contentType, size: receipt.size,
        originalVersion: receipt.originalVersion.toISOString(), resultVersion: receipt.resultVersion.toISOString(),
        createdAt: receipt.createdAt.toISOString() } : null };
  }, options);
}

async function lockedFile(tx: Prisma.TransactionClient, token: WorkspacePortalToken, educationId: string, evidenceId: string) {
  const access = await lockEducationEvidenceAccess(tx, token, educationId);
  const file = await tx.terraqoEducationEvidence.findFirst({ where: { id: evidenceId, educationId } });
  if (!file) fail("Archivo no disponible.", 404);
  const receipt = await tx.terraqoEducationEvidenceOperation.findUnique({ where: { evidenceId } });
  const attempt = await tx.terraqoEducationEvidenceAttempt.findUnique({ where: { storageKey: file!.storageKey } });
  const key = /^education-evidence\/([A-Za-z0-9_-]{1,100})\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.exec(file!.storageKey);
  if (key?.[1] !== educationId || !receipt || !attempt || receipt.educationId !== educationId ||
    receipt.actorId !== token.sub || attempt.actorId !== token.sub || attempt.educationId !== educationId ||
    attempt.state !== "COMMITTED" || receipt.operationKey !== attempt.operationKey ||
    receipt.fingerprint !== attempt.fingerprint || receipt.originalVersion.getTime() !== attempt.originalVersion.getTime() ||
    receipt.fileName !== file!.fileName || receipt.contentType !== file!.contentType || receipt.size !== file!.size ||
    attempt.size !== file!.size || !Number.isSafeInteger(file!.size) || file!.size < 1 || file!.size > 4 * 1024 * 1024 ||
    file!.fileName.length < 1 || file!.fileName.length > 180 || /[\u0000-\u001f\u007f/\\]/.test(file!.fileName) ||
    !["application/pdf", "image/jpeg", "image/png", "image/webp", "image/avif"].includes(file!.contentType))
    fail("El archivo requiere revisión.", 409);
  fresh(access, token);
  return { file: file!, fingerprint: receipt!.fingerprint, originalVersion: receipt!.originalVersion.toISOString() };
}

/** No SQL locks are held during provider I/O. A second live authorization and
 * exact reference check fences withdrawal/revocation while bytes were read. */
export async function downloadEducationEvidence(database: Database, token: WorkspacePortalToken, educationId: string,
  evidenceId: string, providedStore?: PrivateEvidenceStreamStore) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(evidenceId)) fail("Archivo no disponible.", 404);
  const before = await database.$transaction(tx => lockedFile(tx, token, educationId, evidenceId), options);
  const bytes = await readPrivateEvidenceStream(providedStore ?? getPrivateEvidenceStreamStore(), before.file.storageKey, before.file.size);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const fingerprint = createHash("sha256").update(JSON.stringify(["education-evidence-v1", digest,
    before.file.fileName, before.file.contentType, before.file.size, before.originalVersion])).digest("hex");
  if (fingerprint !== before.fingerprint) fail("El archivo no coincide con su recibo.", 409);
  const after = await database.$transaction(tx => lockedFile(tx, token, educationId, evidenceId), options);
  if (JSON.stringify(before) !== JSON.stringify(after)) fail("El archivo cambió durante la lectura.", 409);
  const encoded = encodeURIComponent(after.file.fileName).replace(/['()*]/g, value => `%${value.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(bytes.buffer as ArrayBuffer, { headers: { "Content-Type": after.file.contentType,
    "Content-Length": String(bytes.byteLength), "Content-Disposition": `attachment; filename*=UTF-8''${encoded}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
