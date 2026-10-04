import { fail, handleApiError, ok } from "@/lib/server/api";
import { getWorkspacePortalToken, revokePortalToken } from "@/lib/server/workspace-portal-session";

export async function POST(request: Request, { params }: { params: Promise<{ workspaceSlug: string }> }) {
  try {
    const { workspaceSlug } = await params;
    const token = await getWorkspacePortalToken(request, workspaceSlug);
    if (!token) return fail("La sesión ya no está activa.", 401);
    const revoked = await revokePortalToken(token);
    return ok({ revoked, legacyExpiresAt: revoked ? null : new Date(token.exp * 1000).toISOString() },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleApiError(error); }
}
