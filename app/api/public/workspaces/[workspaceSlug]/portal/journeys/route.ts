import { fail, handleApiError, ok } from "@/lib/server/api";
import { listPortalJourneys, PortalJourneyError } from "@/lib/server/portal-journeys";
import { getWorkspacePortalToken } from "@/lib/server/workspace-portal-session";

type RouteContext = { params: Promise<{ workspaceSlug: string }> };
const cache = { headers: { "Cache-Control": "private, no-store" } };

export async function GET(request: Request, { params }: RouteContext) {
  const { workspaceSlug } = await params;
  const token = await getWorkspacePortalToken(request, workspaceSlug);
  if (!token) return fail("La sesión no es válida o ha vencido.", 401);

  const cursor = new URL(request.url).searchParams.get("cursor") || undefined;
  if (cursor && !/^[a-zA-Z0-9_-]{1,100}$/.test(cursor)) return fail("Página no válida.", 422);

  try {
    return ok(await listPortalJourneys(token, cursor), cache);
  } catch (error) {
    if (error instanceof PortalJourneyError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
