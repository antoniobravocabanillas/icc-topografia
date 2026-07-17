import { prisma } from "@/lib/prisma";
import { created, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireRole } from "@/lib/server/authz";
import { faqInputSchema } from "@/lib/validations/content";
import { getSessionTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

export async function GET() {
  const { response } = await requireRole("EDITOR");
  if (response) return response;

  try {
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    await requireWorkspaceModule("PUBLIC_WEBSITE", terraqoWorkspaceId);
    const faqs = await prisma.faq.findMany({ where: { terraqoWorkspaceId }, orderBy: [{ position: "asc" }, { createdAt: "desc" }] });
    return ok(faqs);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  const { response } = await requireRole("EDITOR");
  if (response) return response;

  try {
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    await requireWorkspaceModule("PUBLIC_WEBSITE", terraqoWorkspaceId);
    const payload = await parseJson(request, faqInputSchema);
    const faq = await prisma.faq.create({ data: { ...payload, terraqoWorkspaceId } });
    return created(faq);
  } catch (error) {
    return handleApiError(error);
  }
}
