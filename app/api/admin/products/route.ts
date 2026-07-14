import { prisma } from "@/lib/prisma";
import { created, fail, getPagination, handleApiError, paginated, parseJson, slugify } from "@/lib/server/api";
import { requireRole } from "@/lib/server/authz";
import { serializeProduct } from "@/lib/server/serializers";
import { getSessionTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";
import { productInputSchema } from "@/lib/validations/product";

export async function GET(request: Request) {
  const { response } = await requireRole("SALES");
  if (response) return response;

  try {
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    await requireWorkspaceModule("TECHNICAL_STORE", terraqoWorkspaceId);
    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip, take } = getPagination(searchParams);
    const q = searchParams.get("q")?.trim();
    const where = {
      AND: [
        { isActive: true },
        terraqoWorkspaceId ? { terraqoWorkspaceId } : {},
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { sku: { contains: q, mode: "insensitive" as const } },
                { brand: { contains: q, mode: "insensitive" as const } }
              ]
            }
          : {}
      ]
    };

    const [products, total] = await prisma.$transaction([
      prisma.product.findMany({ where, include: { category: true, variants: true }, orderBy: { updatedAt: "desc" }, skip, take }),
      prisma.product.count({ where })
    ]);

    return paginated(products.map(serializeProduct), { page, pageSize, total, pageCount: Math.ceil(total / pageSize) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  const { response } = await requireRole("EDITOR");
  if (response) return response;

  try {
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    await requireWorkspaceModule("TECHNICAL_STORE", terraqoWorkspaceId);
    const payload = await parseJson(request, productInputSchema);
    const category = await prisma.category.findFirst({ where: { id: payload.categoryId, terraqoWorkspaceId }, select: { id: true } });
    if (!category) return fail("Categoria no encontrada", 404);
    const product = await prisma.product.create({
      data: {
        ...payload,
        terraqoWorkspaceId,
        slug: payload.slug ?? slugify(payload.name),
        requiresQuote: payload.requiresQuote || !payload.price,
        specifications: payload.specifications
      },
      include: { category: true, variants: true }
    });

    return created(serializeProduct(product));
  } catch (error) {
    return handleApiError(error);
  }
}
