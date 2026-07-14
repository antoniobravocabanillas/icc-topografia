import { prisma } from "@/lib/prisma";
import { handleApiError, ok } from "@/lib/server/api";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

export async function GET() {
  try {
    const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
    const categories = await prisma.category.findMany({
      where: { terraqoWorkspaceId },
      include: { _count: { select: { products: true } } },
      orderBy: { name: "asc" }
    });
    return ok(categories);
  } catch (error) {
    return handleApiError(error);
  }
}
