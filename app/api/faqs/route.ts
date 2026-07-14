import { prisma } from "@/lib/prisma";
import { handleApiError, ok } from "@/lib/server/api";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

export async function GET() {
  try {
    const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
    const faqs = await prisma.faq.findMany({
      where: { active: true, terraqoWorkspaceId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }]
    });
    return ok(faqs);
  } catch (error) {
    return handleApiError(error);
  }
}
