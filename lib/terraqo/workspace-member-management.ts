import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { guardWorkspaceMembershipChange, lockWorkspaceMemberships } from "./workspace-membership-guard";
import { workspaceMemberCapabilities } from "./workspace-member-management-policy";

export class WorkspaceMemberManagementError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export const workspaceMemberChangeSchema = z.object({
  workspaceId: z.string().min(1).max(160), memberId: z.string().min(1).max(160),
  role: z.enum(["ADMIN", "MANAGER", "MEMBER", "VIEWER", "PROFESSIONAL", "CLIENT"]),
  active: z.boolean(), expectedUpdatedAt: z.string().datetime(),
}).strict();

export async function changeWorkspaceMember(db: PrismaClient, actorId: string, input: unknown) {
  const data = workspaceMemberChangeSchema.parse(input);
  return db.$transaction(async tx => {
    const exists = await tx.terraqoWorkspace.findUnique({ where: { id: data.workspaceId }, select: { id: true } });
    if (!exists) throw new WorkspaceMemberManagementError("Workspace no disponible.", 404);
    await lockWorkspaceMemberships(tx, data.workspaceId);
    const workspace = await tx.terraqoWorkspace.findUnique({ where: { id: data.workspaceId }, select: { active: true, deletedAt: true, ownerUserId: true } });
    const actor = await tx.terraqoWorkspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: data.workspaceId, userId: actorId } } });
    if (!workspace?.active || workspace.deletedAt || !actor?.active || !["OWNER", "ADMIN", "MANAGER"].includes(actor.role)) throw new WorkspaceMemberManagementError("No tienes permiso para gestionar estos accesos.", 403);
    const target = await tx.terraqoWorkspaceMember.findFirst({ where: { id: data.memberId, workspaceId: data.workspaceId } });
    if (!target) throw new WorkspaceMemberManagementError("Miembro no disponible en este workspace.", 404);
    const capability = workspaceMemberCapabilities(actor, target, workspace.ownerUserId);
    if (!capability.editable || !capability.roles.includes(data.role)) throw new WorkspaceMemberManagementError("Tu rol no permite este cambio. Solicita la revisión de un administrador con mayor autoridad.", 403);
    // Same result is safe to retry; conflicting stale forms never overwrite newer authority.
    if (target.role === data.role && target.active === data.active) return { id: target.id, role: target.role, active: target.active, updatedAt: target.updatedAt.toISOString(), replayed: true };
    if (target.updatedAt.toISOString() !== data.expectedUpdatedAt) throw new WorkspaceMemberManagementError("El acceso cambió mientras lo revisabas. Recarga la página antes de guardar.", 409);
    await guardWorkspaceMembershipChange(tx, data.workspaceId, target.userId, { role: data.role, active: data.active });
    const updated = await tx.terraqoWorkspaceMember.update({ where: { id: target.id }, data: { role: data.role, active: data.active, updatedAt: new Date(Math.max(Date.now(), target.updatedAt.getTime() + 1)) } });
    // Audit and membership commit together. Suspending preserves authorship and staff relationships.
    await tx.activityLog.create({ data: { actorId, terraqoWorkspaceId: data.workspaceId, action: "UPDATED", entityType: "WorkspaceMembership", entityId: target.id, title: "Acceso al workspace actualizado", metadata: { before: { role: target.role, active: target.active }, after: { role: updated.role, active: updated.active } } } });
    return { id: updated.id, role: updated.role, active: updated.active, updatedAt: updated.updatedAt.toISOString(), replayed: false };
  }, { isolationLevel: "ReadCommitted" });
}
