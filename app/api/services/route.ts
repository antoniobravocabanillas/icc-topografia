import { prisma } from "@/lib/prisma";
import { handleApiError, ok } from "@/lib/server/api";
import { getDefaultTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

export async function GET() {
  try {
    const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
    await requireWorkspaceModule("PUBLIC_WEBSITE", terraqoWorkspaceId);
    const services = await prisma.service.findMany({
      where: { isPublished: true, terraqoWorkspaceId },
      orderBy: { title: "asc" }
    });
    return ok(services);
  } catch (error) {
    return handleApiError(error);
  }
}
