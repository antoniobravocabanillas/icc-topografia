import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { BILLING_PLANS, getBillingPlan } from "@/lib/terraqo/billing/catalog";
import { personalRetainedStorageUnits } from "@/lib/terraqo/billing/personal-storage-usage";
import { getDefaultModulesForTier } from "@/lib/workspace";
import type { WorkspacePortalToken } from "./workspace-portal-session";

export class EducationEvidenceReservationError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
type Reservation = { size: number; version: string; operationKey: string; fingerprint: string };
const fail = (message: string, status: number): never => { throw new EducationEvidenceReservationError(message, status); };
const units = (bytes: number) => Math.ceil(bytes / 1_000_000);

export async function lockEducationEvidenceAccess(tx: Prisma.TransactionClient, token: WorkspacePortalToken, educationId: string) {
  if (token.role !== "PROFESSIONAL" || token.exp <= Math.floor(Date.now() / 1000) || !token.jti)
    fail("Vuelve a iniciar tu sesión profesional.", 401);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(educationId)) fail("Formación no disponible.", 404);
  const profiles = await tx.$queryRaw<{ id: string; planTier: string }[]>(Prisma.sql`
    SELECT id,"planTier" FROM icc."TerraqoProfessionalProfile" WHERE "userId"=${token.sub} FOR UPDATE`);
  const profile = profiles[0]; if (!profile) fail("Formación no disponible.", 404);
  const rows = await tx.$queryRaw<{ id: string; updatedAt: Date; verificationStatus: string }[]>(Prisma.sql`
    SELECT id,"updatedAt","verificationStatus" FROM icc."TerraqoProfessionalEducation"
    WHERE id=${educationId} AND "professionalProfileId"=${profile.id} FOR UPDATE`);
  if (!rows[0]) fail("Formación no disponible.", 404);
  const workspaces = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoWorkspace"
    WHERE id=${token.workspaceId} AND slug=${token.workspaceSlug} AND active=true AND "deletedAt" IS NULL FOR SHARE`);
  const members = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoWorkspaceMember"
    WHERE "workspaceId"=${token.workspaceId} AND "userId"=${token.sub} AND active=true AND role='PROFESSIONAL' FOR SHARE`);
  const modules = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoWorkspaceModule"
    WHERE "workspaceId"=${token.workspaceId} AND code='PROFESSIONAL_NETWORK' AND active=true FOR SHARE`);
  if (!workspaces.length || !members.length || !modules.length) fail("Tu acceso profesional cambió.", 403);
  const workspaceBilling = await tx.$queryRaw<{ planCode: string; paidThrough: Date | null }[]>(Prisma.sql`
    SELECT "planCode","paidThrough" FROM icc."TerraqoBillingAccount"
    WHERE "ownerKey"=${`workspace:${token.workspaceId}`} AND mode='live' FOR SHARE`);
  if (workspaceBilling[0]) {
    const plan = getBillingPlan(workspaceBilling[0].paidThrough && workspaceBilling[0].paidThrough > new Date()
      ? workspaceBilling[0].planCode : "workspace-free");
    if (plan.audience !== "WORKSPACE" || !getDefaultModulesForTier(plan.tier).includes("PROFESSIONAL_NETWORK"))
      fail("El módulo profesional no está disponible.", 403);
  }
  const personalBilling = await tx.$queryRaw<{ planCode: string; paidThrough: Date | null }[]>(Prisma.sql`
    SELECT "planCode","paidThrough" FROM icc."TerraqoBillingAccount"
    WHERE "ownerKey"=${`user:${token.sub}`} AND mode='live' FOR SHARE`);
  const plan = personalBilling[0]
    ? getBillingPlan(personalBilling[0].paidThrough && personalBilling[0].paidThrough > new Date() ? personalBilling[0].planCode : "personal-free")
    : BILLING_PLANS.find(value => value.audience === "PERSONAL" && value.tier === profile.planTier) ?? getBillingPlan("personal-free");
  if (plan.audience !== "PERSONAL") fail("La capacidad personal requiere revisión.", 403);
  const grants = await tx.$queryRaw<{ expires: Date }[]>(Prisma.sql`SELECT expires FROM icc."VerificationToken"
    WHERE identifier=${`portal-session:${token.workspaceId}:${token.sub}`}
    AND token=${createHash("sha256").update(token.jti!).digest("hex")} AND expires>${new Date()} FOR SHARE`);
  if (!grants[0]) fail("La sesión fue revocada.", 401);
  const capacityExpirations = [workspaceBilling[0]?.paidThrough, personalBilling[0]?.paidThrough]
    .filter((value): value is Date => Boolean(value && value > new Date()));
  return { education: rows[0], profileId: profile.id, storageMb: plan.storageMb, grantExpires: grants[0].expires,
    capacityExpirations };
}

// Education prerequisites are applied. Delegate to the shared floor so generic
// document/experience cleanup and education compensation protect the same units.
export async function educationPersonalStorageFloor(tx: Prisma.TransactionClient, userId: string) {
  return personalRetainedStorageUnits(tx, userId);
}

/** Requires a transaction whose caller propagates failures without committing.
 * The public wrapper below guarantees that quota and RESERVED are atomic. */
export async function reserveEducationEvidenceInTransaction(tx: Prisma.TransactionClient, token: WorkspacePortalToken,
  educationId: string, payload: Reservation) {
  if (!Number.isSafeInteger(payload.size) || payload.size < 1 || payload.size > 4 * 1024 * 1024 ||
    !/^[a-f0-9]{32}$/.test(payload.operationKey) || !/^[a-f0-9]{64}$/.test(payload.fingerprint) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(payload.version) ||
    Number.isNaN(Date.parse(payload.version)) || new Date(payload.version).toISOString() !== payload.version)
    fail("Solicitud de archivo inválida.", 422);
  const access = await lockEducationEvidenceAccess(tx, token, educationId);
  const receipt = await tx.terraqoEducationEvidenceOperation.findUnique({
    where: { educationId_operationKey: { educationId, operationKey: payload.operationKey } } });
  if (receipt) {
    if (receipt.actorId !== token.sub || receipt.fingerprint !== payload.fingerprint) fail("La clave ya contiene otra operación.", 409);
    return { kind: "receipt" as const, receipt, currentVersion: access.education.updatedAt.toISOString() };
  }
  if (!["NOT_REQUESTED", "REJECTED"].includes(access.education.verificationStatus)) fail("La formación está protegida.", 403);
  if (access.education.updatedAt.toISOString() !== payload.version) fail("La formación cambió. Recarga antes de adjuntar.", 409);
  if (await tx.terraqoEducationEvidence.count({ where: { educationId } }) >= 6) fail("La formación alcanzó seis archivos.", 422);
  const floor = await educationPersonalStorageFloor(tx, token.sub), charge = units(payload.size);
  const bucket = { ownerKey: `user:${token.sub}`, period: "retained", metric: "storage-mb" };
  await tx.terraqoUsageBucket.createMany({ data: [{ ...bucket, used: floor }], skipDuplicates: true });
  // Raise a stale baseline, never lower a bucket holding another upload's reserve.
  await tx.terraqoUsageBucket.updateMany({ where: { ...bucket, used: { lt: floor } }, data: { used: floor } });
  const attempt = await tx.terraqoEducationEvidenceAttempt.create({ data: { educationId, actorId: token.sub,
    operationKey: payload.operationKey, fingerprint: payload.fingerprint, originalVersion: new Date(payload.version),
    storageKey: `education-evidence/${educationId}/${randomUUID()}`, size: payload.size } });
  if (access.grantExpires <= new Date() || token.exp <= Math.floor(Date.now() / 1000)) fail("La sesión venció.", 401);
  if (access.capacityExpirations.some(value => value <= new Date())) fail("La capacidad cambió. Recarga antes de adjuntar.", 409);
  const charged = await tx.terraqoUsageBucket.updateMany({ where: { ...bucket, used: { lte: access.storageMb - charge } },
    data: { used: { increment: charge } } });
  if (charged.count !== 1) fail("La cuota personal está completa.", 429);
  const reserved = await tx.terraqoEducationEvidenceAttempt.update({ where: { id: attempt.id },
    data: { state: "RESERVED", reservedUnits: charge } });
  return { kind: "reserved" as const, attempt: reserved };
}

export function reserveEducationEvidenceAttempt(database: Pick<PrismaClient, "$transaction">, token: WorkspacePortalToken,
  educationId: string, payload: Reservation) {
  return database.$transaction(tx => reserveEducationEvidenceInTransaction(tx, token, educationId, payload), { maxWait: 5000, timeout: 15000 });
}
