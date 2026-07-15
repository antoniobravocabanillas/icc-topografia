import { fail } from "@/lib/server/api";
import { uploadProfessionalDocuments } from "@/lib/server/professional-document-upload";
import { getWorkspacePortalToken } from "@/lib/server/workspace-portal-session";

type RouteContext = { params: Promise<{ workspaceSlug: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { workspaceSlug } = await params;
  const token = getWorkspacePortalToken(request, workspaceSlug);
  if (!token) return fail("La sesion no es valida o ha vencido.", 401);
  if (token.role !== "PROFESSIONAL") return fail("Esta carga requiere un perfil profesional.", 403);

  return uploadProfessionalDocuments(request, token.sub, token.workspaceId);
}
