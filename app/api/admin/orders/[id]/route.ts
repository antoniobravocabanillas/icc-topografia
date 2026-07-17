import { prisma } from "@/lib/prisma";
import { fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireRole } from "@/lib/server/authz";
import { serializeOrder } from "@/lib/server/serializers";
import { idSchema } from "@/lib/validations/common";
import { orderStatusSchema } from "@/lib/validations/commerce";
import { getSessionTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

type OrderAdminRouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: OrderAdminRouteProps) {
  const { response } = await requireRole("SALES");
  if (response) return response;

  try {
    const { id } = idSchema.parse(await params);
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    await requireWorkspaceModule("TECHNICAL_STORE", terraqoWorkspaceId);
    const order = await prisma.order.findFirst({
      where: { id, terraqoWorkspaceId },
      include: { items: { include: { product: true } }, address: true }
    });
    if (!order) return fail("Pedido no encontrado", 404);
    return ok(serializeOrder(order));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: OrderAdminRouteProps) {
  const { response } = await requireRole("SALES");
  if (response) return response;

  try {
    const { id } = idSchema.parse(await params);
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    await requireWorkspaceModule("TECHNICAL_STORE", terraqoWorkspaceId);
    const owned = await prisma.order.findFirst({ where: { id, terraqoWorkspaceId }, select: { id: true } });
    if (!owned) return fail("Pedido no encontrado", 404);
    const payload = await parseJson(request, orderStatusSchema);
    const order = await prisma.order.update({
      where: { id },
      data: payload,
      include: { items: { include: { product: true } }, address: true }
    });
    return ok(serializeOrder(order));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: OrderAdminRouteProps) {
  const { response } = await requireRole("ADMIN");
  if (response) return response;

  try {
    const { id } = idSchema.parse(await params);
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    await requireWorkspaceModule("TECHNICAL_STORE", terraqoWorkspaceId);
    const owned = await prisma.order.findFirst({ where: { id, terraqoWorkspaceId }, select: { id: true } });
    if (!owned) return fail("Pedido no encontrado", 404);
    await prisma.order.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
