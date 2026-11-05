import type { TerraqoMemberRole } from "@prisma/client";

/** Roles capaces de administrar un workspace. Este módulo debe permanecer
 * libre de dependencias HTTP/Next para poder reutilizarse en workers. */
export const workspaceAdminMemberRoles: TerraqoMemberRole[] = ["OWNER", "ADMIN", "MANAGER"];

// New membership roles receive ordinary workspace data only after an explicit policy decision.
export const ordinaryWorkspaceMemberRoles: TerraqoMemberRole[] = [
  "OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER", "CLIENT", "PROFESSIONAL",
];

export function ordinaryWorkspaceMembership(userId: string) {
  return { userId, active: true, role: { in: ordinaryWorkspaceMemberRoles } };
}

export function ordinaryWorkspaceFor(userId: string) {
  return { active: true, deletedAt: null, members: { some: ordinaryWorkspaceMembership(userId) } };
}

export function workspaceBrandAuthority(userId: string, workspaceId: string) {
  return {
    id: workspaceId, active: true, deletedAt: null,
    members: { some: { userId, active: true, role: { in: workspaceAdminMemberRoles } } },
  };
}
