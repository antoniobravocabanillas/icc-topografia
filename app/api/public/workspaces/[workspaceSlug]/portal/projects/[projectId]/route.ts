import { fail, handleApiError, ok } from "@/lib/server/api";
import { getWorkspacePortalToken } from "@/lib/server/workspace-portal-session";
import { getPortalProject } from "@/lib/server/portal-project";
import { hasWorkspaceModule } from "@/lib/terraqo/workspace-scope";

type RouteContext = { params: Promise<{ workspaceSlug: string; projectId: string }> };
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { workspaceSlug, projectId } = await params;
    const token = await getWorkspacePortalToken(request, workspaceSlug);
    if (!token) return fail("La sesion no es valida o ha vencido.", 401);
    if (!["ADMIN", "CLIENT", "PROFESSIONAL"].includes(token.role)) return fail("Tu rol no permite consultar proyectos.", 403);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(projectId)) return fail("Proyecto no disponible.", 404);
    if (!await hasWorkspaceModule("PROJECTS", token.workspaceId)) return fail("El modulo de proyectos no esta habilitado.", 403);
    const project = await getPortalProject(token, projectId);
    if (!project) return fail("Proyecto no disponible.", 404);
    return ok({ schemaVersion: 1, workspaceSlug, project }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleApiError(error); }
}
