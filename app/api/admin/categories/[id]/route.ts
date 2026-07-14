import { prisma } from "@/lib/prisma";
import { handleApiError, ok, parseJson, slugify } from "@/lib/server/api";
import { requireRole } from "@/lib/server/authz";
import { idSchema } from "@/lib/validations/common";
import { categoryUpdateSchema } from "@/lib/validations/product";
import { getSessionTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

type CategoryAdminRouteProps = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: CategoryAdminRouteProps) {
  const { response } = await requireRole("EDITOR");
  if (response) return response;

  try {
    const { id } = idSchema.parse(await params);
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    const owned = await prisma.category.findFirst({ where: { id, terraqoWorkspaceId }, select: { id: true } });
    if (!owned) return ok({ error: "Categoria no encontrada" }, { status: 404 });
    const payload = await parseJson(request, categoryUpdateSchema);
    const category = await prisma.category.update({
      where: { id },
      data: { ...payload, slug: payload.slug ?? (payload.name ? slugify(payload.name) : undefined) }
    });
    return ok(category);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: CategoryAdminRouteProps) {
  const { response } = await requireRole("ADMIN");
  if (response) return response;

  try {
    const { id } = idSchema.parse(await params);
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    const owned = await prisma.category.findFirst({ where: { id, terraqoWorkspaceId }, select: { id: true } });
    if (!owned) return ok({ error: "Categoria no encontrada" }, { status: 404 });
    await prisma.category.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
