import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasWorkspaceAdminAccess } from "@/lib/terraqo/workspace-access";

export async function requireAdminPage(allowedRoles: Role[]) {
  const session = await auth();
  const role = session?.user?.role as Role | undefined;

  if (!session?.user) redirect("/cuenta?callbackUrl=/admin");
  if (!role || !allowedRoles.includes(role)) redirect("/admin");
  if (!(await hasWorkspaceAdminAccess(session.user.id, role))) redirect("/cuenta?error=workspace-access");

  return session;
}

export function canManageAdmin(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN" || role === "COMMERCIAL_ADMIN" || role === "EDITOR";
}
