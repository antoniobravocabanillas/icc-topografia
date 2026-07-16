import { fail } from "@/lib/server/api";
import { getWorkspacePortalToken } from "@/lib/server/workspace-portal-session";
import { uploadWorklogEvidence } from "@/lib/server/worklog-evidence";

type RouteContext = { params: Promise<{ workspaceSlug: string; id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { workspaceSlug, id } = await params;
  const token = getWorkspacePortalToken(request, workspaceSlug);
  if (!token) return fail("La sesion no es valida o ha vencido.", 401);
  if (token.role !== "PROFESSIONAL") return fail("Esta carga requiere un perfil profesional.", 403);
  return uploadWorklogEvidence(request, token.sub, id, token.workspaceId);
}
