import { prisma } from "@/lib/prisma";
import { handleApiError, ok } from "@/lib/server/api";
import { requireRole } from "@/lib/server/authz";
import { getSessionTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

export async function GET() {
  const { response } = await requireRole("SALES");
  if (response) return response;

  try {
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    const [
      productCount,
      pendingOrders,
      newLeads,
      unreadMessages,
      recentLeads,
      recentOrders
    ] = await prisma.$transaction([
      prisma.product.count({ where: { terraqoWorkspaceId } }),
      prisma.order.count({ where: { status: "PENDING", terraqoWorkspaceId } }),
      prisma.lead.count({ where: { status: "NEW", terraqoWorkspaceId } }),
      prisma.contactMessage.count({ where: { terraqoWorkspaceId } }),
      prisma.lead.findMany({ where: { terraqoWorkspaceId }, orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.order.findMany({ where: { terraqoWorkspaceId }, orderBy: { createdAt: "desc" }, take: 5 })
    ]);

    return ok({
      counters: {
        productCount,
        pendingOrders,
        newLeads,
        unreadMessages
      },
      recentLeads,
      recentOrders: recentOrders.map((order) => ({ ...order, total: Number(order.total) }))
    });
  } catch (error) {
    return handleApiError(error);
  }
}
