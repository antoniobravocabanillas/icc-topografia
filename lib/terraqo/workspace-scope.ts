import { cache } from "react";
import type { TerraqoModuleCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { workspace } from "@/lib/workspace";

export const getDefaultTerraqoWorkspace = cache(async () => {
  return prisma.terraqoWorkspace.findUnique({
    where: { slug: workspace.defaultWorkspaceSlug },
    select: { id: true, slug: true, name: true, active: true }
  });
});

export async function getDefaultTerraqoWorkspaceId() {
  const defaultWorkspace = await getDefaultTerraqoWorkspace();
  return defaultWorkspace?.id;
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

  return tenant?.id ?? getDefaultTerraqoWorkspaceId();
}

export function workspaceWhere(workspaceId?: string | null) {
  return workspaceId ? { terraqoWorkspaceId: workspaceId } : {};
}
