import { authorizeResource, PortalResourceError } from "@/lib/server/portal-resources";
import { fail } from "@/lib/server/api";
import { uploadProfessionalDocuments } from "@/lib/server/professional-document-upload";
import { getWorkspacePortalToken } from "@/lib/server/workspace-portal-session";

type RouteContext = { params: Promise<{ workspaceSlug: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { workspaceSlug } = await params;
  const token = await getWorkspacePortalToken(request, workspaceSlug);
  if (!token) return fail("La sesion no es valida o ha vencido.", 401);
  if (token.role !== "PROFESSIONAL") return fail("Esta carga requiere un perfil profesional.", 403);

  try {
    await authorizeResource(token, "professionalDocuments");
    return await uploadProfessionalDocuments(request, token.sub, token.workspaceId);
  } catch (error) {
    if (error instanceof PortalResourceError) return fail(error.message, error.status);
    throw error;
  }
}
