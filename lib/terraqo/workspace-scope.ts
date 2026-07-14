import { cache } from "react";
import type { Role, TerraqoModuleCode } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForUser } from "@/lib/terraqo/workspace-access";
import { workspace } from "@/lib/workspace";

export const getDefaultTerraqoWorkspace = cache(async () => {
  return prisma.terraqoWorkspace.findUnique({
    where: { slug: workspace.defaultWorkspaceSlug },
    select: { id: true, slug: true, name: true, active: true }
  });
});

export async function getDefaultTerraqoWorkspaceId() {
  const defaultWorkspace = await getDefaultTerraqoWorkspace();
  if (!defaultWorkspace?.active) throw new Error("Workspace publico inexistente o inactivo.");
  return defaultWorkspace.id;
}

export async function getSessionTerraqoWorkspace() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Sesion requerida.");

  const activeWorkspace = await getWorkspaceForUser(
    session.user.id,
    session.user.role as Role | undefined
  );

  if (!activeWorkspace?.active) throw new Error("Workspace inexistente o inactivo.");
  return activeWorkspace;
}

export async function getSessionTerraqoWorkspaceId() {
  return (await getSessionTerraqoWorkspace()).id;
}

export const getDefaultWorkspaceEntitlements = cache(async () => {
  return prisma.terraqoWorkspace.findUnique({
    where: { slug: workspace.defaultWorkspaceSlug },
    select: {
      id: true,
      slug: true,
      active: true,
      modules: {
        where: { active: true },
        select: { code: true, active: true }
      },
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { tier: true, status: true }
      }
    }
  });
});

export async function hasWorkspaceModule(code: TerraqoModuleCode, workspaceId?: string | null) {
  if (workspaceId) {
    const workspaceModule = await prisma.terraqoWorkspaceModule.findUnique({
      where: { workspaceId_code: { workspaceId, code } },
      select: { active: true }
    });
    return Boolean(workspaceModule?.active);
  }

  const entitlements = await getDefaultWorkspaceEntitlements();
  return Boolean(entitlements?.active && entitlements.modules.some((workspaceModule) => workspaceModule.code === code));
}

export async function requireWorkspaceModule(code: TerraqoModuleCode, workspaceId?: string | null) {
  const enabled = await hasWorkspaceModule(code, workspaceId);
  if (!enabled) {
    throw new Error(`Modulo Terraqo no activo: ${code}`);
  }
}

export async function getWorkspaceIdBySlug(slug?: string | null) {
  if (!slug) return getDefaultTerraqoWorkspaceId();

  const tenant = await prisma.terraqoWorkspace.findUnique({
    where: { slug },
    select: { id: true }
  });

  if (!tenant) throw new Error("Workspace no encontrado.");
  return tenant.id;
}

export function workspaceWhere(workspaceId?: string | null) {
  return workspaceId ? { terraqoWorkspaceId: workspaceId } : {};
}
