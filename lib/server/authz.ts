import { Role } from "@prisma/client";
import { auth } from "@/auth";
import { fail } from "@/lib/server/api";
import { hasWorkspaceAdminAccess } from "@/lib/terraqo/workspace-access";

const roleRank: Record<Role, number> = {
  CUSTOMER: 0,
  TECHNICIAN: 1,
  SALES: 1,
  SURVEYOR: 1,
  ENGINEER: 1,
  ARCHITECT: 1,
  SUPPORT: 1,
  EDITOR: 2,
  COMMERCIAL_ADMIN: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4
};

export async function requireRole(minRole: Role = "ADMIN") {
  const session = await auth();
  const role = session?.user?.role as Role | undefined;

  if (!session?.user?.id || !role) {
    return { response: fail("Autenticacion requerida", 401), session: null };
  }

  if (roleRank[role] < roleRank[minRole]) {
    return { response: fail("Permisos insuficientes", 403), session: null };
  }

  if (!(await hasWorkspaceAdminAccess(session.user.id, role))) {
    return { response: fail("Acceso no autorizado para este workspace", 403), session: null };
  }

  return { response: null, session };
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return { response: fail("Autenticacion requerida", 401), session: null };
  }

  return { response: null, session };
}
