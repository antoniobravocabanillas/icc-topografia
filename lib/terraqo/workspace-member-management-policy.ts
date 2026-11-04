import type { TerraqoMemberRole } from "@prisma/client";

const rank: Record<TerraqoMemberRole, number> = { OWNER: 3, ADMIN: 2, MANAGER: 1, MEMBER: 0, VIEWER: 0, PROFESSIONAL: 0, CLIENT: 0 };
export const assignableWorkspaceRoles: TerraqoMemberRole[] = ["ADMIN", "MANAGER", "MEMBER", "VIEWER", "PROFESSIONAL", "CLIENT"];

/** Workspace authority never inherits a global account role. Ownership transfer is separate. */
export function workspaceMemberCapabilities(actor: { userId: string; role: TerraqoMemberRole; active: boolean }, target: { userId: string; role: TerraqoMemberRole }, ownerUserId: string | null) {
  const editable = actor.active && rank[actor.role] > 0 && target.role !== "OWNER" && target.userId !== ownerUserId
    && (actor.userId === target.userId || rank[actor.role] > rank[target.role]);
  return { editable, roles: editable ? assignableWorkspaceRoles.filter(role => rank[role] < rank[actor.role] || role === target.role) : [] };
}
