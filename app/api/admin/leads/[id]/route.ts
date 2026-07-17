import { prisma } from "@/lib/prisma";
import { handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireRole } from "@/lib/server/authz";
import { idSchema } from "@/lib/validations/common";
import { leadStatusSchema } from "@/lib/validations/crm";
import { getSessionTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

type LeadAdminRouteProps = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: LeadAdminRouteProps) {
  const { response } = await requireRole("SALES");
  if (response) return response;

  try {
    const { id } = idSchema.parse(await params);
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    await requireWorkspaceModule("CRM", terraqoWorkspaceId);
    const owned = await prisma.lead.findFirst({ where: { id, terraqoWorkspaceId }, select: { id: true } });
    if (!owned) return ok({ error: "Lead no encontrado" }, { status: 404 });
    const payload = await parseJson(request, leadStatusSchema);
    const lead = await prisma.lead.update({ where: { id }, data: payload });
    return ok(lead);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: LeadAdminRouteProps) {
  const { response } = await requireRole("ADMIN");
  if (response) return response;

  try {
    const { id } = idSchema.parse(await params);
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    await requireWorkspaceModule("CRM", terraqoWorkspaceId);
    const owned = await prisma.lead.findFirst({ where: { id, terraqoWorkspaceId }, select: { id: true } });
    if (!owned) return ok({ error: "Lead no encontrado" }, { status: 404 });
    await prisma.lead.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
