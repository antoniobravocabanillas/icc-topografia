import { prisma } from "@/lib/prisma";
import { getPagination, handleApiError, paginated } from "@/lib/server/api";
import { serializeProduct } from "@/lib/server/serializers";
import { getDefaultTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip, take } = getPagination(searchParams);
    const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
    await requireWorkspaceModule("TECHNICAL_STORE", terraqoWorkspaceId);
    const q = searchParams.get("q")?.trim();
    const category = searchParams.get("category")?.trim();

    const where = {
      AND: [
        { isActive: true, isVisible: true },
        terraqoWorkspaceId ? { terraqoWorkspaceId } : {},
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { brand: { contains: q, mode: "insensitive" as const } },
                { model: { contains: q, mode: "insensitive" as const } },
                { summary: { contains: q, mode: "insensitive" as const } }
              ]
            }
          : {},
        category ? { category: { slug: category } } : {}
      ]
    };

    const [products, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: { category: true, variants: true },
        orderBy: { createdAt: "desc" },
        skip,
        take
      }),
      prisma.product.count({ where })
    ]);

    return paginated(products.map(serializeProduct), {
      page,
      pageSize,
      total,
      pageCount: Math.ceil(total / pageSize)
    });
  } catch (error) {
    return handleApiError(error);
  }
}
