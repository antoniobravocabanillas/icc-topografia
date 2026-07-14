import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { getWorkspaceForUser } from "@/lib/terraqo/workspace-access";

export async function requireWorkspaceActionRole(allowedRoles: Role[]) {
  const session = await auth();
  const role = session?.user?.role as Role | undefined;

  if (!session?.user?.id) throw new Error("Sesion requerida.");
  if (!role || !allowedRoles.includes(role)) throw new Error("Permisos insuficientes.");

  const activeWorkspace = await getWorkspaceForUser(session.user.id, role);
  if (!activeWorkspace?.active) throw new Error("Workspace inexistente o inactivo.");

  return { session, role, workspaceId: activeWorkspace.id, workspace: activeWorkspace };
}
