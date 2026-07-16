import { fail } from "@/lib/server/api";
import { getWorkspacePortalToken } from "@/lib/server/workspace-portal-session";
import { getWorklogEvidenceFile } from "@/lib/server/worklog-evidence";

type RouteContext = { params: Promise<{ workspaceSlug: string; id: string }> };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, { params }: RouteContext) {
  const { workspaceSlug, id } = await params;
  const token = getWorkspacePortalToken(request, workspaceSlug);
  if (!token) return fail("La sesion no es valida o ha vencido.", 401);
  if (token.role !== "PROFESSIONAL") return fail("Esta evidencia requiere un perfil profesional.", 403);
  return getWorklogEvidenceFile(token.sub, id, token.workspaceId);
}
