import { prisma } from "@/lib/prisma";
import { fail, handleApiError, ok } from "@/lib/server/api";
import { serializeProduct } from "@/lib/server/serializers";
import { getDefaultTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";
import { slugParamSchema } from "@/lib/validations/common";

type ProductRouteProps = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, { params }: ProductRouteProps) {
  try {
    const { slug } = slugParamSchema.parse(await params);
    const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
    await requireWorkspaceModule("TECHNICAL_STORE", terraqoWorkspaceId);
    const product = await prisma.product.findFirst({
      where: { slug, isActive: true, isVisible: true, terraqoWorkspaceId },
      include: { category: true, variants: true }
    });

    if (!product) return fail("Producto no encontrado", 404);
    return ok(serializeProduct(product));
  } catch (error) {
    return handleApiError(error);
  }
}
