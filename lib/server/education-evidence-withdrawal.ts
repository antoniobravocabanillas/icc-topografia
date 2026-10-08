import "server-only";
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { EducationEvidenceReservationError, educationPersonalStorageFloor, lockEducationEvidenceAccess } from "./education-evidence-reservation";
import type { WorkspacePortalToken } from "./workspace-portal-session";

const fail = (message: string, status: number): never => { throw new EducationEvidenceReservationError(message, status); };
type WithdrawalInput = { evidenceId: string; version: string; operationKey: string };
const receiptNamespace = "education-withdrawal-v1";

/** Internal SQL unit only. Propagate errors out of the transaction. No physical
 * deletion or refund occurs here: removal and its durable fence commit together. */
export async function withdrawEducationEvidenceInTransaction(tx: Prisma.TransactionClient, token: WorkspacePortalToken,
  educationId: string, input: WithdrawalInput) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(input.evidenceId) || !/^[a-f0-9]{32}$/.test(input.operationKey)) fail("Operación no válida.", 422);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.version) ||
    Number.isNaN(Date.parse(input.version)) || new Date(input.version).toISOString() !== input.version) fail("Recarga la formación.", 409);
  const access = await lockEducationEvidenceAccess(tx, token, educationId);
  const assertAuthority = () => {
    if (access.grantExpires <= new Date() || token.exp <= Math.floor(Date.now() / 1000)) fail("La sesión venció.", 401);
    if (access.capacityExpirations.some(value => value <= new Date())) fail("La capacidad cambió.", 409);
  };
  const fingerprint = createHash("sha256").update(JSON.stringify([
    "education-evidence-withdrawal-v1", token.sub, educationId, input.evidenceId, input.version,
  ])).digest("hex");
  const prior = await tx.terraqoEducationEvidenceWithdrawal.findUnique({
    where: { educationId_operationKey: { educationId, operationKey: input.operationKey } },
  });
  if (prior) {
    if (prior.actorId !== token.sub || prior.targetEvidenceId !== input.evidenceId || prior.fingerprint !== fingerprint ||
      prior.originalVersion.toISOString() !== input.version) fail("La clave ya contiene otra operación.", 409);
    // A receipt confirms the logical withdrawal, never physical disappearance.
    assertAuthority();
    return { kind: "receipt" as const, receipt: prior, currentVersion: access.education.updatedAt.toISOString() };
  }
  if (!["NOT_REQUESTED", "REJECTED"].includes(access.education.verificationStatus)) fail("La formación está protegida.", 403);
  if (access.education.updatedAt.toISOString() !== input.version) fail("La formación cambió.", 409);
  const file = await tx.terraqoEducationEvidence.findUnique({ where: { id: input.evidenceId }, include: { operation: true } });
  if (!file || file.educationId !== educationId || file.uploadedById !== token.sub) fail("Archivo no disponible.", 404);
  const upload = file!.operation;
  if (!upload || upload.actorId !== token.sub || upload.educationId !== educationId || upload.evidenceId !== file!.id ||
    upload.fileName !== file!.fileName || upload.contentType !== file!.contentType || upload.size !== file!.size)
    fail("La evidencia requiere revisión.", 409);
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoEducationEvidenceAttempt"
    WHERE "storageKey"=${file!.storageKey} AND "educationId"=${educationId} FOR UPDATE`);
  const attempt = await tx.terraqoEducationEvidenceAttempt.findUnique({ where: { storageKey: file!.storageKey } });
  const namespace = /^education-evidence\/([A-Za-z0-9_-]{1,100})\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.exec(file!.storageKey);
  if (!attempt || attempt.educationId !== educationId || attempt.actorId !== token.sub || attempt.state !== "COMMITTED" ||
    attempt.operationKey !== upload!.operationKey || attempt.fingerprint !== upload!.fingerprint || attempt.size !== file!.size ||
    attempt.originalVersion.getTime() !== upload!.originalVersion.getTime() || namespace?.[1] !== educationId ||
    attempt.reservedUnits !== Math.ceil(file!.size / 1_000_000)) fail("La evidencia perdió su retención.", 409);
  const floor = await educationPersonalStorageFloor(tx, token.sub);
  const buckets = await tx.$queryRaw<{ used: number }[]>(Prisma.sql`SELECT used FROM icc."TerraqoUsageBucket"
    WHERE "ownerKey"=${`user:${token.sub}`} AND period='retained' AND metric='storage-mb' FOR UPDATE`);
  if (!buckets[0] || buckets[0].used < floor) fail("La retención requiere revisión.", 409);
  const version = new Date(Math.max(Date.now(), access.education.updatedAt.getTime() + 1));
  const changed = await tx.terraqoProfessionalEducation.updateMany({ where: { id: educationId,
    professionalProfileId: access.profileId, updatedAt: new Date(input.version),
    verificationStatus: { in: ["NOT_REQUESTED", "REJECTED"] } }, data: { updatedAt: version } });
  if (changed.count !== 1) fail("La formación cambió.", 409);
  const removed = await tx.terraqoEducationEvidence.deleteMany({ where: { id: file!.id, educationId, storageKey: attempt!.storageKey } });
  if (removed.count !== 1) fail("La referencia cambió.", 409);
  const fenced = await tx.terraqoEducationEvidenceAttempt.updateMany({ where: { id: attempt!.id,
    state: "COMMITTED", reservedUnits: attempt!.reservedUnits }, data: { state: "CLEANUP_PENDING", attempts: 0, nextAttemptAt: null } });
  if (fenced.count !== 1) fail("La evidencia perdió su retención.", 409);
  // Retained bytes become outstanding units. Ensure the existing bucket can
  // cover that conservative floor, without charging or refunding this request.
  if (buckets[0].used < await educationPersonalStorageFloor(tx, token.sub)) fail("La retención requiere revisión.", 409);
  const id = createHash("sha256").update(JSON.stringify([token.sub, educationId, input.operationKey, receiptNamespace])).digest("hex");
  const receipt = await tx.terraqoEducationEvidenceWithdrawal.create({ data: { id, educationId, actorId: token.sub,
    operationKey: input.operationKey, fingerprint, targetEvidenceId: file!.id, uploadOperationId: upload!.id,
    attemptId: attempt!.id, originalVersion: new Date(input.version), resultVersion: version } });
  await tx.activityLog.create({ data: { actorId: token.sub, terraqoWorkspaceId: token.workspaceId, action: "DELETED",
    entityType: "EducationEvidenceWithdrawal", entityId: file!.id, title: "Evidencia privada de formación retirada",
    metadata: { source: "native-portal", operationId: id } } });
  assertAuthority();
  return { kind: "withdrawn" as const, receipt, currentVersion: version.toISOString() };
}

export function withdrawEducationEvidence(database: Pick<PrismaClient, "$transaction">, token: WorkspacePortalToken,
  educationId: string, input: WithdrawalInput) {
  return database.$transaction(tx => withdrawEducationEvidenceInTransaction(tx, token, educationId, input), { maxWait: 5000, timeout: 15000 });
}
