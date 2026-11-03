import { Prisma, type TerraqoMemberRole } from "@prisma/client";
import { workspaceAdminMemberRoles } from "./workspace-roles";

export class LastWorkspaceAdministratorError extends Error {
  readonly code = "LAST_WORKSPACE_ADMINISTRATOR";
  constructor() { super("No puedes retirar al último administrador activo. Asigna otro administrador antes de continuar."); }
}

export async function lockWorkspaceMemberships(tx: Prisma.TransactionClient, workspaceId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM icc."TerraqoWorkspace" WHERE id=${workspaceId} FOR UPDATE`);
  if (!rows.length) throw new Error("Workspace no encontrado.");
}

/** Must run in the same READ COMMITTED transaction as the mutation. The workspace lock serializes
 * competing removals, so two administrators cannot each rely on the other remaining. */
export async function guardWorkspaceMembershipChange(tx: Prisma.TransactionClient, workspaceId: string, userId: string, next: { role?: TerraqoMemberRole; active?: boolean }) {
  await lockWorkspaceMemberships(tx, workspaceId);
  const current = await tx.terraqoWorkspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
  if (!current?.active || !workspaceAdminMemberRoles.includes(current.role)) return;
  if ((next.active ?? current.active) && workspaceAdminMemberRoles.includes(next.role ?? current.role)) return;
  const remaining = await tx.terraqoWorkspaceMember.count({ where: { workspaceId, active: true, role: { in: workspaceAdminMemberRoles }, id: { not: current.id } } });
  if (!remaining) throw new LastWorkspaceAdministratorError();
}

export async function unlinkStaffWorkspaceAccess(tx: Prisma.TransactionClient, workspaceId: string, profileId: string) {
  await lockWorkspaceMemberships(tx, workspaceId);
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."StaffProfile" WHERE id=${profileId} AND "terraqoWorkspaceId"=${workspaceId} FOR UPDATE`);
  const profile = await tx.staffProfile.findFirst({ where: { id: profileId, terraqoWorkspaceId: workspaceId }, select: { id: true, userId: true } });
  if (!profile) throw new Error("Perfil no pertenece al workspace activo.");
  if (profile.userId) {
    await guardWorkspaceMembershipChange(tx, workspaceId, profile.userId, { active: false });
    await tx.terraqoWorkspaceMember.updateMany({ where: { workspaceId, userId: profile.userId }, data: { active: false } });
  }
  await tx.staffProfile.update({ where: { id: profileId }, data: { userId: null } });
}
