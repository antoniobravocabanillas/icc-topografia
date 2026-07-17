import { prisma } from "@/lib/prisma";
import { fail, handleApiError, ok, parseJson, slugify } from "@/lib/server/api";
import { requireRole } from "@/lib/server/authz";
import { serializeProduct } from "@/lib/server/serializers";
import { idSchema } from "@/lib/validations/common";
import { productUpdateSchema } from "@/lib/validations/product";
import { getSessionTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

type ProductAdminRouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: ProductAdminRouteProps) {
  const { response } = await requireRole("SALES");
  if (response) return response;

  try {
    const { id } = idSchema.parse(await params);
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    await requireWorkspaceModule("TECHNICAL_STORE", terraqoWorkspaceId);
    const product = await prisma.product.findFirst({ where: { id, terraqoWorkspaceId }, include: { category: true, variants: true } });
    if (!product) return fail("Producto no encontrado", 404);
    return ok(serializeProduct(product));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: ProductAdminRouteProps) {
  const { response } = await requireRole("EDITOR");
  if (response) return response;

  try {
    const { id } = idSchema.parse(await params);
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    await requireWorkspaceModule("TECHNICAL_STORE", terraqoWorkspaceId);
    const owned = await prisma.product.findFirst({ where: { id, terraqoWorkspaceId }, select: { id: true } });
    if (!owned) return fail("Producto no encontrado", 404);
    const payload = await parseJson(request, productUpdateSchema);
    if (payload.categoryId) {
      const category = await prisma.category.findFirst({ where: { id: payload.categoryId, terraqoWorkspaceId }, select: { id: true } });
      if (!category) return fail("Categoria no encontrada", 404);
    }
    const product = await prisma.product.update({
      where: { id },
      data: {
        ...payload,
        slug: payload.slug ?? (payload.name ? slugify(payload.name) : undefined),
        requiresQuote: payload.requiresQuote ?? (payload.price === null ? true : undefined)
      },
      include: { category: true, variants: true }
    });

    return ok(serializeProduct(product));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: ProductAdminRouteProps) {
  const { response } = await requireRole("ADMIN");
  if (response) return response;

  try {
    const { id } = idSchema.parse(await params);
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    await requireWorkspaceModule("TECHNICAL_STORE", terraqoWorkspaceId);
    const owned = await prisma.product.findFirst({ where: { id, terraqoWorkspaceId }, select: { id: true } });
    if (!owned) return fail("Producto no encontrado", 404);
    await prisma.product.update({ where: { id }, data: { isActive: false } });
    return ok({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
