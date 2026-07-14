import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handleApiError, ok, parseJson, slugify } from "@/lib/server/api";
import { requireRole } from "@/lib/server/authz";
import { idSchema } from "@/lib/validations/common";
import { serviceUpdateSchema } from "@/lib/validations/content";
import { getSessionTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

type ServiceAdminRouteProps = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: ServiceAdminRouteProps) {
  const { response } = await requireRole("EDITOR");
  if (response) return response;

  try {
    const { id } = idSchema.parse(await params);
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    const owned = await prisma.service.findFirst({ where: { id, terraqoWorkspaceId }, select: { id: true } });
    if (!owned) return ok({ error: "Servicio no encontrado" }, { status: 404 });
    const payload = await parseJson(request, serviceUpdateSchema);
    const service = await prisma.service.update({
      where: { id },
      data: {
        ...payload,
        slug: payload.slug ?? (payload.title ? slugify(payload.title) : undefined),
        content: payload.content as Prisma.InputJsonValue | undefined
      }
    });
    return ok(service);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: ServiceAdminRouteProps) {
  const { response } = await requireRole("ADMIN");
  if (response) return response;

  try {
    const { id } = idSchema.parse(await params);
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    const owned = await prisma.service.findFirst({ where: { id, terraqoWorkspaceId }, select: { id: true } });
    if (!owned) return ok({ error: "Servicio no encontrado" }, { status: 404 });
    await prisma.service.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
