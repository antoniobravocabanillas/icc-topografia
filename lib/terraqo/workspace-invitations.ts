import { createHash, randomBytes } from "node:crypto";
import { type Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { lockWorkspaceMemberships } from "./workspace-membership-guard";
import { workspaceAdminMemberRoles } from "./workspace-roles";

const ordinaryInvitationRole = z.enum(["VIEWER", "MEMBER", "PROFESSIONAL", "CLIENT"]);
export const workspaceInvitationCreateSchema = z.object({
  workspaceId: z.string().min(1).max(160), email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  role: z.enum([...ordinaryInvitationRole.options, "EVALUATOR"]).default("VIEWER"),
  canReadEvaluations: z.boolean().default(false),
  operationKey: z.string().uuid(),
}).strict();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export class WorkspaceInvitationError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function authorize(tx: Prisma.TransactionClient, workspaceId: string, actorId: string) {
  const workspace = await tx.terraqoWorkspace.findUnique({ where: { id: workspaceId }, select: { active: true, deletedAt: true } });
  const member = await tx.terraqoWorkspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: actorId } } });
  if (!workspace?.active || workspace.deletedAt || !member?.active || !workspaceAdminMemberRoles.includes(member.role)) {
    throw new WorkspaceInvitationError("No tienes permiso para administrar estas invitaciones.", 403);
  }
}
const unavailable = () => new WorkspaceInvitationError("La invitación no está disponible para esta cuenta.", 404);

// Return delivery details only for the exact issuance written by the authorized transaction.
const issuanceFields = { id: true, email: true, resendCount: true, expiresAt: true } as const;
export type WorkspaceInvitationIssue = { id: string; email: string; resendCount: number; expiresAt: Date; token: string };

/** Explicit projection excludes token hashes, operation fingerprints and private identity records. */
export async function listWorkspaceInvitations(db: PrismaClient, actorId: string, workspaceId: string) {
  return db.$transaction(async tx => {
    await lockWorkspaceMemberships(tx, workspaceId);
    await authorize(tx, workspaceId, actorId);
    return tx.terraqoWorkspaceInvitation.findMany({
      where: { workspaceId, ...(process.env.TERRAQO_WORKSPACE_EVALUATORS_V1 === "true" ? {} : { role: { not: "EVALUATOR" as const } }) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50,
      select: { id: true, email: true, role: true, canReadEvaluations: true, status: true, createdAt: true, expiresAt: true, lastIssuedAt: true, resendCount: true, acceptedAt: true, cancelledAt: true },
    });
  }, { isolationLevel: "ReadCommitted" });
}

/** Raw tokens are returned only on explicit creation/rotation. No delivery occurs here. */
export async function createWorkspaceInvitation(db: PrismaClient, actorId: string, input: unknown) {
  const data = workspaceInvitationCreateSchema.parse(input);
  if (data.role === "EVALUATOR" && process.env.TERRAQO_WORKSPACE_EVALUATORS_V1 !== "true") throw unavailable();
  if (data.role !== "EVALUATOR" && data.canReadEvaluations) {
    throw new WorkspaceInvitationError("El permiso de lectura requiere una invitación de evaluador.", 422);
  }
  // Preserve the fingerprint of invitations issued before the evaluator migration.
  const fingerprint = hash(JSON.stringify(data.role === "EVALUATOR"
    ? [data.email, data.role, data.canReadEvaluations] : [data.email, data.role]));
  return db.$transaction(async tx => {
    await lockWorkspaceMemberships(tx, data.workspaceId);
    await authorize(tx, data.workspaceId, actorId);
    const existing = await tx.terraqoWorkspaceInvitation.findUnique({ where: { workspaceId_operationKey: { workspaceId: data.workspaceId, operationKey: data.operationKey } } });
    if (existing) {
      if (existing.operationFingerprint !== fingerprint || existing.createdById !== actorId) throw new WorkspaceInvitationError("La operación ya corresponde a otra invitación.", 409);
      return { id: existing.id, token: null, replayed: true };
    }
    const now = new Date();
    const pending = await tx.terraqoWorkspaceInvitation.findFirst({ where: { workspaceId: data.workspaceId, email: data.email, status: "PENDING", expiresAt: { gt: now } } });
    if (pending) throw new WorkspaceInvitationError("Ya existe una invitación vigente para este correo.", 409);
    const count = await tx.terraqoWorkspaceInvitation.count({ where: { workspaceId: data.workspaceId, createdAt: { gte: new Date(now.getTime() - 86400000) } } });
    if (count >= 50) throw new WorkspaceInvitationError("Se alcanzó el límite diario de invitaciones.", 429);
    const token = randomBytes(32).toString("base64url");
    const invitation = await tx.terraqoWorkspaceInvitation.create({ data: { ...data, createdById: actorId, operationFingerprint: fingerprint, tokenHash: hash(token), expiresAt: new Date(now.getTime() + 7 * 86400000) }, select: issuanceFields });
    return { ...invitation, token, replayed: false };
  }, { isolationLevel: "ReadCommitted" });
}

export async function manageWorkspaceInvitation(db: PrismaClient, actorId: string, workspaceId: string, invitationId: string, action: "cancel" | "rotate", expectedResendCount?: number) {
  if (action !== "cancel" && action !== "rotate") throw unavailable();
  return db.$transaction(async tx => {
    await lockWorkspaceMemberships(tx, workspaceId);
    await authorize(tx, workspaceId, actorId);
    const invitation = await tx.terraqoWorkspaceInvitation.findFirst({ where: { id: invitationId, workspaceId } });
    if (!invitation || (invitation.role === "EVALUATOR" && process.env.TERRAQO_WORKSPACE_EVALUATORS_V1 !== "true")) throw unavailable();
    if (action === "cancel" && invitation.status === "CANCELLED") return { token: null };
    if (invitation.status !== "PENDING") throw unavailable();
    if (action === "cancel") {
      await tx.terraqoWorkspaceInvitation.update({ where: { id: invitationId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      return { token: null };
    }
    // Check under the workspace lock, including retries that arrive after the cooldown.
    if (expectedResendCount !== undefined && invitation.resendCount !== expectedResendCount) {
      throw new WorkspaceInvitationError("El enlace ya se renovó. Actualiza la página para ver la invitación vigente.", 409);
    }
    const now = new Date();
    if (invitation.expiresAt <= now || invitation.resendCount >= 5 || now.getTime() - invitation.lastIssuedAt.getTime() < 60000) {
      throw new WorkspaceInvitationError("No se puede renovar el enlace todavía o se agotó su vigencia o límite.", 429);
    }
    const token = randomBytes(32).toString("base64url");
    const rotated = await tx.terraqoWorkspaceInvitation.update({ where: { id: invitationId }, data: { tokenHash: hash(token), lastIssuedAt: now, resendCount: { increment: 1 } }, select: issuanceFields });
    return { ...rotated, token };
  }, { isolationLevel: "ReadCommitted" });
}

export async function acceptWorkspaceInvitation(db: PrismaClient, actorId: string, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw unavailable();
  return db.$transaction(async tx => {
    const invitation = await tx.terraqoWorkspaceInvitation.findUnique({ where: { tokenHash: hash(token) }, select: { id: true, workspaceId: true } });
    if (!invitation) throw unavailable();
    await lockWorkspaceMemberships(tx, invitation.workspaceId);
    // Re-read after the lock: cancellation/rotation/acceptance cannot race past this point.
    const current = await tx.terraqoWorkspaceInvitation.findUnique({ where: { tokenHash: hash(token) } });
    await tx.$queryRaw`SELECT id FROM icc."User" WHERE id=${actorId} FOR SHARE`;
    const user = await tx.user.findUnique({ where: { id: actorId }, select: { email: true, emailVerified: true } });
    if (!current || !user?.emailVerified || user.email?.toLowerCase() !== current.email) throw unavailable();
    if (current.role === "EVALUATOR") {
      if (process.env.TERRAQO_WORKSPACE_EVALUATORS_V1 !== "true") throw unavailable();
    } else if (!ordinaryInvitationRole.safeParse(current.role).success) throw unavailable();
    await authorize(tx, current.workspaceId, current.createdById);
    const destination = current.role === "EVALUATOR" ? { access: "EVALUATOR" as const } : {};
    if (current.status === "ACCEPTED" && current.acceptedById === actorId) return { workspaceId: current.workspaceId, replayed: true, ...destination };
    if (current.status !== "PENDING" || current.expiresAt <= new Date()) throw unavailable();
    const member = await tx.terraqoWorkspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: current.workspaceId, userId: actorId } } });
    if (member && !member.active) throw new WorkspaceInvitationError("La membresía está suspendida. Solicita revisión al administrador.", 409);
    // An invitation does not replace an existing role or reactivate a suspended member.
    if (current.role === "EVALUATOR") {
      const identity = { workspaceId: current.workspaceId, userId: actorId };
      const evaluator = await tx.terraqoWorkspaceEvaluator.findUnique({ where: { workspaceId_userId: identity } });
      if (evaluator && !evaluator.active) throw new WorkspaceInvitationError("El acceso de evaluador está suspendido.", 409);
      if (!evaluator) await tx.terraqoWorkspaceEvaluator.create({ data: { ...identity, canReadEvaluations: current.canReadEvaluations } });
    } else if (!member) {
      await tx.terraqoWorkspaceMember.create({ data: { workspaceId: current.workspaceId, userId: actorId, role: current.role, active: true, invitedAt: current.createdAt, joinedAt: new Date() } });
    }
    await tx.terraqoWorkspaceInvitation.update({ where: { id: current.id }, data: { status: "ACCEPTED", acceptedById: actorId, acceptedAt: new Date() } });
    return { workspaceId: current.workspaceId, replayed: false, ...destination };
  }, { isolationLevel: "ReadCommitted" });
}
