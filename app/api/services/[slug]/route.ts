import { prisma } from "@/lib/prisma";
import { fail, handleApiError, ok } from "@/lib/server/api";
import { getDefaultTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";
import { slugParamSchema } from "@/lib/validations/common";

type ServiceRouteProps = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, { params }: ServiceRouteProps) {
  try {
    const { slug } = slugParamSchema.parse(await params);
    const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
    await requireWorkspaceModule("PUBLIC_WEBSITE", terraqoWorkspaceId);
    const service = await prisma.service.findFirst({ where: { slug, terraqoWorkspaceId } });
    if (!service || !service.isPublished) return fail("Servicio no encontrado", 404);
    return ok(service);
  } catch (error) {
    return handleApiError(error);
  }
}
