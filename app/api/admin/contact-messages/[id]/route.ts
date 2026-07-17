import { prisma } from "@/lib/prisma";
import { handleApiError, ok } from "@/lib/server/api";
import { requireRole } from "@/lib/server/authz";
import { idSchema } from "@/lib/validations/common";
import { getSessionTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

type ContactMessageAdminRouteProps = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, { params }: ContactMessageAdminRouteProps) {
  const { response } = await requireRole("ADMIN");
  if (response) return response;

  try {
    const { id } = idSchema.parse(await params);
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    await requireWorkspaceModule("CRM", terraqoWorkspaceId);
    const owned = await prisma.contactMessage.findFirst({ where: { id, terraqoWorkspaceId }, select: { id: true } });
    if (!owned) return ok({ error: "Mensaje no encontrado" }, { status: 404 });
    await prisma.contactMessage.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
