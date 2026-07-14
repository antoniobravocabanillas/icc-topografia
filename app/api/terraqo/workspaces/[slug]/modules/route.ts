import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireRole } from "@/lib/server/authz";
import { getWorkspaceWithEntitlements } from "@/lib/terraqo/workspace-repository";
import { setWorkspaceModuleState } from "@/lib/terraqo/workspace-modules";
import { terraqoModuleUpdateSchema } from "@/lib/validations/terraqo";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { response } = await requireRole("SUPER_ADMIN");
  if (response) return response;

  try {
    const { slug } = await context.params;
    const workspace = await getWorkspaceWithEntitlements(slug);
    if (!workspace) return fail("Workspace no encontrado", 404);

    return ok({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        type: workspace.type,
        active: workspace.active,
        plan: workspace.subscriptions[0]?.tier ?? "FREE",
        subscriptionStatus: workspace.subscriptions[0]?.status ?? "CANCELLED"
      },
      modules: workspace.modules
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { response } = await requireRole("SUPER_ADMIN");
  if (response) return response;

  try {
    const { slug } = await context.params;
    const payload = await parseJson(request, terraqoModuleUpdateSchema);
    const config = payload.config as Prisma.InputJsonValue | undefined;
    const workspace = await prisma.terraqoWorkspace.findUnique({ where: { slug }, select: { id: true } });
    if (!workspace) return fail("Workspace no encontrado", 404);

    const requestedMode = payload.config && typeof payload.config === "object" && !Array.isArray(payload.config)
      ? (payload.config as { provisioning?: { mode?: unknown } }).provisioning?.mode
      : undefined;
    const workspaceModule = await setWorkspaceModuleState({
      workspaceId: workspace.id,
      code: payload.code,
      active: payload.active,
      config,
      mode: requestedMode === "template" ? "template" : requestedMode === "blank" ? "blank" : undefined
    });

    return ok(workspaceModule);
  } catch (error) {
    return handleApiError(error);
  }
}
