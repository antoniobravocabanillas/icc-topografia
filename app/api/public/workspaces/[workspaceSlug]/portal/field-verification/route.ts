import { FieldVerificationError } from "@/lib/terraqo/field-verification";
import { fail, handleApiError, ok } from "@/lib/server/api";
import { runFieldVerificationAction } from "@/lib/server/field-verification-api";
import { getWorkspacePortalToken } from "@/lib/server/workspace-portal-session";

type RouteContext = { params: Promise<{ workspaceSlug: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { workspaceSlug } = await params;
  const token = getWorkspacePortalToken(request, workspaceSlug);
  if (!token) return fail("La sesion no es valida o ha vencido.", 401);

  try {
    return ok(await runFieldVerificationAction({
      request,
      userId: token.sub,
      workspaceId: token.workspaceId,
      portalOrigin: request.headers.get("x-terraqo-portal-origin")
    }));
  } catch (error) {
    if (error instanceof FieldVerificationError) return fail(error.message, error.status, error.details);
    return handleApiError(error);
  }
}
