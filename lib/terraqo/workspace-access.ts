import type { Role, TerraqoMemberRole } from "@prisma/client";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const ADMIN_WORKSPACE_COOKIE = "terraqo_admin_workspace";
export const workspaceAdminMemberRoles: TerraqoMemberRole[] = ["OWNER", "ADMIN", "MANAGER"];

async function preferredWorkspaceFromRequest() {
  try {
    return (await cookies()).get(ADMIN_WORKSPACE_COOKIE)?.value || null;
  } catch {
    return null;
  }
}

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
  return Boolean(await prisma.terraqoWorkspaceMember.findFirst({
    where: {
      userId,
      active: true,
      role: { in: workspaceAdminMemberRoles },
      workspace: { active: true, deletedAt: null }
    },
    select: { id: true }
  }));
}

export async function getWorkspaceForUser(userId: string, role?: Role | null, preferredWorkspaceId?: string | null) {
  const selectedWorkspaceId = preferredWorkspaceId || await preferredWorkspaceFromRequest();

  if (role === "SUPER_ADMIN") {
    const selected = selectedWorkspaceId
      ? await prisma.terraqoWorkspace.findFirst({
          where: { id: selectedWorkspaceId, active: true, deletedAt: null },
          select: { id: true, slug: true, name: true, active: true }
        })
      : null;
    if (selected) return selected;

    return prisma.terraqoWorkspace.findFirst({
      where: { active: true, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, slug: true, name: true, active: true }
    });
  }

  const membership = await prisma.terraqoWorkspaceMember.findFirst({
    where: {
      userId,
      active: true,
      role: { in: workspaceAdminMemberRoles },
      ...(selectedWorkspaceId ? { workspaceId: selectedWorkspaceId } : {}),
      workspace: { active: true, deletedAt: null }
    },
    orderBy: { createdAt: "asc" },
    select: {
      workspaceId: true,
      workspace: { select: { slug: true, name: true } }
    }
  });
  return membership?.workspace
    ? {
        id: membership.workspaceId,
        slug: membership.workspace.slug,
        name: membership.workspace.name,
        active: true
      }
    : null;
}

export async function getAdminWorkspaceOptions(userId: string, role?: Role | null) {
  if (role === "SUPER_ADMIN") {
    return prisma.terraqoWorkspace.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true }
    });
  }

  const memberships = await prisma.terraqoWorkspaceMember.findMany({
    where: {
      userId,
      active: true,
      role: { in: workspaceAdminMemberRoles },
      workspace: { active: true, deletedAt: null }
    },
    orderBy: { workspace: { name: "asc" } },
    select: { workspace: { select: { id: true, name: true, slug: true } } }
  });
  return memberships.map((membership) => membership.workspace);
}
