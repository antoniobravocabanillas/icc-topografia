import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForUser, workspaceAdminMemberRoles } from "@/lib/terraqo/workspace-access";
import { DiscoveryNeedsError } from "@/lib/terraqo/discovery-needs";

export async function requireDiscoveryWorkspaceActor() {
  const session = await auth();
  if (!session?.user?.id) throw new DiscoveryNeedsError("Sesión requerida.", 401);
  const role = session.user.role as Role | undefined;
  const workspace = await getWorkspaceForUser(session.user.id, role);
  if (!workspace?.active) throw new DiscoveryNeedsError("Workspace inexistente o inactivo.", 403);
  if (role !== "SUPER_ADMIN") {
    const membership = await prisma.terraqoWorkspaceMember.findFirst({
      where: {
        workspaceId: workspace.id,
        userId: session.user.id,
        active: true,
        role: { in: workspaceAdminMemberRoles },
      },
      select: { id: true },
    });
    if (!membership) throw new DiscoveryNeedsError("No tienes autorización para gestionar necesidades privadas.", 403);
  }
  return { session, workspace };
}
