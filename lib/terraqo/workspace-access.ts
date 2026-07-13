import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { workspace } from "@/lib/workspace";

export async function getActiveWorkspaceMembership(userId: string) {
  return prisma.terraqoWorkspaceMember.findFirst({
    where: {
      userId,
      active: true,
      workspace: {
        slug: workspace.defaultWorkspaceSlug,
        active: true
      }
    },
    select: {
      role: true,
      workspaceId: true,
      workspace: {
        select: { slug: true, name: true }
      }
    }
  });
}

export async function hasWorkspaceAdminAccess(userId: string, role?: Role | null) {
  if (role === "SUPER_ADMIN") return true;
  return Boolean(await getActiveWorkspaceMembership(userId));
}
