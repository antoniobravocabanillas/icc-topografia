import { FieldVerificationError } from "@/lib/terraqo/field-verification";
import { getActiveWorkspaceMembership } from "@/lib/terraqo/workspace-access";
import { fail, handleApiError, ok } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import { runFieldVerificationAction } from "@/lib/server/field-verification-api";

export async function POST(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;

  try {
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    const membership = await getActiveWorkspaceMembership(session.user.id, workspaceId);
    if (!membership) return fail("No tienes un workspace activo para esta operacion.", 403);
    return ok(await runFieldVerificationAction({ request, userId: session.user.id, workspaceId: membership.workspaceId }));
  } catch (error) {
    if (error instanceof FieldVerificationError) return fail(error.message, error.status, error.details);
    return handleApiError(error);
  }
}
