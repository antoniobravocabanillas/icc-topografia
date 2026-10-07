import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDefaultModulesForTier } from "@/lib/workspace";
import { getBillingPlan } from "@/lib/terraqo/billing/catalog";
import type { WorkspacePortalToken } from "./workspace-portal-session";
import { cvPublicationFingerprint, cvPublicationOperationId, parseCvPublicationPayload } from "./cv-publication-payload";

export class CvPublicationError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
const selected = { id: true, username: true, liveCvEnabled: true, updatedAt: true } as const;
type Profile = Prisma.TerraqoProfessionalProfileGetPayload<{ select: typeof selected }>;
const state = (row: Profile) => ({ version: row.updatedAt.toISOString(), username: row.username,
  published: row.liveCvEnabled, url: row.liveCvEnabled && row.username ? `https://terraqoglobal.com/cv/${row.username}` : null });
const receipt = (row: Prisma.TerraqoCvPublicationOperationGetPayload<object>) => ({
  operationKey: row.operationKey, action: row.action, version: row.resultVersion.toISOString(),
  published: row.published, username: row.username, confirmedAt: row.createdAt.toISOString(),
});
const transact = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(work, { maxWait: 5000, timeout: 15000 });

async function lockAccess(tx: Prisma.TransactionClient, token: WorkspacePortalToken) {
  if (token.role !== "PROFESSIONAL" || token.exp <= Math.floor(Date.now() / 1000))
    throw new CvPublicationError("Tu sesión profesional ya no está disponible.", 403);
  if (!token.jti) throw new CvPublicationError("Inicia sesión nuevamente para administrar la publicación.", 401);
  const owner = await tx.terraqoProfessionalProfile.findUnique({ where: { userId: token.sub }, select: { id: true } });
  if (!owner) throw new CvPublicationError("Perfil no disponible.", 404);
  const profiles = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile" WHERE id=${owner.id} AND "userId"=${token.sub} FOR UPDATE`);
  if (!profiles.length) throw new CvPublicationError("Perfil no disponible.", 404);
  const workspace = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoWorkspace" WHERE id=${token.workspaceId} AND slug=${token.workspaceSlug} AND active=true AND "deletedAt" IS NULL FOR SHARE`);
  const member = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoWorkspaceMember" WHERE "workspaceId"=${token.workspaceId} AND "userId"=${token.sub} AND active=true AND role='PROFESSIONAL' FOR SHARE`);
  if (!workspace.length || !member.length) throw new CvPublicationError("Tu acceso profesional cambió.", 403);
  const modules = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoWorkspaceModule" WHERE "workspaceId"=${token.workspaceId} AND code='PROFESSIONAL_NETWORK' AND active=true FOR SHARE`);
  const billing = await tx.$queryRaw<{ planCode: string; paidThrough: Date | null }[]>(Prisma.sql`SELECT "planCode","paidThrough" FROM icc."TerraqoBillingAccount" WHERE "ownerKey"=${`workspace:${token.workspaceId}`} AND mode='live' FOR SHARE`);
  if (!modules.length || (billing[0] && !getDefaultModulesForTier(billing[0].paidThrough && billing[0].paidThrough > new Date() ? getBillingPlan(billing[0].planCode).tier : "FREE").includes("PROFESSIONAL_NETWORK")))
    throw new CvPublicationError("El módulo profesional no está habilitado.", 403);
  const grants = await tx.$queryRaw<{ token: string }[]>(Prisma.sql`SELECT token FROM icc."VerificationToken" WHERE identifier=${`portal-session:${token.workspaceId}:${token.sub}`} AND token=${createHash("sha256").update(token.jti).digest("hex")} AND expires>${new Date()} FOR SHARE`);
  if (!grants.length) throw new CvPublicationError("La sesión fue revocada.", 401);
  return tx.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: owner.id }, select: selected });
}

export async function readCvPublication(token: WorkspacePortalToken, operationKey?: string) {
  if (operationKey !== undefined && !/^[a-f0-9]{32}$/.test(operationKey)) throw new CvPublicationError("Operación no válida.", 422);
  return transact(async tx => {
    const profile = await lockAccess(tx, token);
    const operation = operationKey ? await tx.terraqoCvPublicationOperation.findUnique({ where: {
      id: cvPublicationOperationId(token.sub, profile.id, operationKey),
    } }) : null;
    return { schemaVersion: 1, workspaceSlug: token.workspaceSlug, current: state(profile), receipt: operation ? receipt(operation) : null };
  });
}

export async function writeCvPublication(token: WorkspacePortalToken, input: unknown) {
  const payload = parseCvPublicationPayload(input);
  return transact(async tx => {
    const profile = await lockAccess(tx, token);
    const id = cvPublicationOperationId(token.sub, profile.id, payload.operationKey);
    const fingerprint = cvPublicationFingerprint(payload);
    const existing = await tx.terraqoCvPublicationOperation.findUnique({ where: { id } });
    // Resolve replay before version comparison, but after live authorization.
    // A historical receipt never substitutes for the current profile state.
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new CvPublicationError("La clave ya corresponde a otra operación.", 409);
      return { schemaVersion: 1, workspaceSlug: token.workspaceSlug, current: state(profile), receipt: receipt(existing) };
    }
    if (profile.updatedAt.toISOString() !== payload.version) throw new CvPublicationError("El perfil cambió. Actualízalo antes de continuar.", 409);
    if (payload.action === "PUBLISH" && (!profile.username || !/^[a-z0-9][a-z0-9._-]{2,29}$/.test(profile.username) ||
      ["admin", "api", "app", "cuenta", "cv", "portal", "soporte", "terraqo", "terraqoglobal", "www"].includes(profile.username)))
      throw new CvPublicationError("Guarda un nombre de usuario válido antes de publicar.", 422);
    const published = payload.action === "PUBLISH";
    // Strictly advance the version even for no-op transitions within one ms.
    const saved = await tx.terraqoProfessionalProfile.update({ where: { id: profile.id }, data: {
      liveCvEnabled: published, ...(published ? { liveCvVisibility: "PUBLIC" } : {}),
      updatedAt: new Date(Math.max(Date.now(), profile.updatedAt.getTime() + 1)),
    }, select: selected });
    const operation = await tx.terraqoCvPublicationOperation.create({ data: {
      id, professionalProfileId: profile.id, operationKey: payload.operationKey, fingerprint,
      action: payload.action, originalVersion: profile.updatedAt, resultVersion: saved.updatedAt,
      published, username: saved.username, consentVersion: published ? "cv-publication-v1" : null,
    } });
    await tx.activityLog.create({ data: { actorId: token.sub, terraqoWorkspaceId: token.workspaceId, action: "UPDATED", entityType: "CvPublication", entityId: id,
      title: published ? "CV publicado por su propietario" : "CV retirado por su propietario",
      metadata: { workspaceId: token.workspaceId, profileId: profile.id, action: payload.action, consentVersion: operation.consentVersion },
    } });
    return { schemaVersion: 1, workspaceSlug: token.workspaceSlug, current: state(saved), receipt: receipt(operation) };
  });
}
