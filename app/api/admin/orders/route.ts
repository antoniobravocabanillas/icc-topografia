import { prisma } from "@/lib/prisma";
import { getPagination, handleApiError, paginated } from "@/lib/server/api";
import { requireRole } from "@/lib/server/authz";
import { serializeOrder } from "@/lib/server/serializers";
import { getSessionTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

export async function GET(request: Request) {
  const { response } = await requireRole("SALES");
  if (response) return response;

  try {
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    await requireWorkspaceModule("TECHNICAL_STORE", terraqoWorkspaceId);
    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip, take } = getPagination(searchParams);
    const status = searchParams.get("status")?.trim();
    const q = searchParams.get("q")?.trim();
    const where = {
      terraqoWorkspaceId,
      ...(status ? { status: status as "PENDING" } : {}),
      ...(q
        ? {
            OR: [
              { customerName: { contains: q, mode: "insensitive" as const } },
              { customerEmail: { contains: q, mode: "insensitive" as const } },
              { customerPhone: { contains: q, mode: "insensitive" as const } }
            ]
          }
        : {})
    };

    const [orders, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include: { items: { include: { product: true } }, address: true },
        orderBy: { createdAt: "desc" },
        skip,
        take
      }),
      prisma.order.count({ where })
    ]);

    return paginated(orders.map(serializeOrder), { page, pageSize, total, pageCount: Math.ceil(total / pageSize) });
  } catch (error) {
    return handleApiError(error);
  }
}
