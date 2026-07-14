import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { workspace } from "@/lib/workspace";

export async function getActiveWorkspaceMembership(userId: string, preferredWorkspaceId?: string | null) {
  return prisma.terraqoWorkspaceMember.findFirst({
    where: {
      userId,
      active: true,
      ...(preferredWorkspaceId ? { workspaceId: preferredWorkspaceId } : {}),
      workspace: {
        active: true
      }
    },
    orderBy: { createdAt: "asc" },
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

export async function getWorkspaceForUser(userId: string, role?: Role | null) {
  if (role === "SUPER_ADMIN") {
    return prisma.terraqoWorkspace.findUnique({
      where: { slug: workspace.defaultWorkspaceSlug },
      select: { id: true, slug: true, name: true, active: true }
    });
  }

  const membership = await getActiveWorkspaceMembership(userId);
  return membership?.workspace
    ? {
        id: membership.workspaceId,
        slug: membership.workspace.slug,
        name: membership.workspace.name,
        active: true
      }
    : null;
}
