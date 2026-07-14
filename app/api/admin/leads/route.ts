import { prisma } from "@/lib/prisma";
import { getPagination, handleApiError, paginated } from "@/lib/server/api";
import { requireRole } from "@/lib/server/authz";
import { getSessionTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

export async function GET(request: Request) {
  const { response } = await requireRole("SALES");
  if (response) return response;

  try {
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    await requireWorkspaceModule("CRM", terraqoWorkspaceId);
    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip, take } = getPagination(searchParams);
    const status = searchParams.get("status")?.trim();
    const q = searchParams.get("q")?.trim();
    const where = {
      ...(status ? { status: status as "NEW" } : {}),
      terraqoWorkspaceId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
              { company: { contains: q, mode: "insensitive" as const } },
              { message: { contains: q, mode: "insensitive" as const } }
            ]
          }
        : {})
    };

    const [leads, total] = await prisma.$transaction([
      prisma.lead.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.lead.count({ where })
    ]);

    return paginated(leads, { page, pageSize, total, pageCount: Math.ceil(total / pageSize) });
  } catch (error) {
    return handleApiError(error);
  }
}
