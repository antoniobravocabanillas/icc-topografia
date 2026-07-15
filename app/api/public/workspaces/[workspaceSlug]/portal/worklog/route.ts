import { created, fail, handleApiError, parseJson } from "@/lib/server/api";
import { getWorkspacePortalToken } from "@/lib/server/workspace-portal-session";
import { createProfessionalWorklog, TerraqoWorklogError } from "@/lib/terraqo/worklog";
import { terraqoWorklogCreateSchema } from "@/lib/validations/terraqo";

type RouteContext = { params: Promise<{ workspaceSlug: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { workspaceSlug } = await params;
  const token = getWorkspacePortalToken(request, workspaceSlug);
  if (!token) return fail("La sesion no es valida o ha vencido.", 401);
  if (token.role !== "PROFESSIONAL") return fail("Esta accion requiere un perfil profesional.", 403);

  try {
    const payload = await parseJson(request, terraqoWorklogCreateSchema);
    return created(await createProfessionalWorklog({ userId: token.sub, payload, requiredWorkspaceId: token.workspaceId }));
  } catch (error) {
    if (error instanceof TerraqoWorklogError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
