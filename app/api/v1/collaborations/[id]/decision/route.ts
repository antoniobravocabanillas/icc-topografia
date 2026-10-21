import { fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import { isValidWorklogOperationKey } from "@/lib/terraqo/worklog-create-operation";
import { decideCollaborationProposal } from "@/lib/terraqo/collaboration";
import { TerraqoMessagingError } from "@/lib/terraqo/messaging";
import { terraqoCollaborationDecisionSchema } from "@/lib/validations/terraqo";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (process.env.TERRAQO_COLLABORATION_V1 !== "true")
    return fail("Recurso no disponible.", 404);
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const operationKey = request.headers.get("Idempotency-Key")?.trim();
    if (!isValidWorklogOperationKey(operationKey))
      return fail("Clave de reintento inválida.", 400);
    const { id } = await context.params;
    const payload = await parseJson(request, terraqoCollaborationDecisionSchema);
    return ok(await decideCollaborationProposal({
      userId: session.user.id,
      collaborationId: id,
      operationKey: operationKey!,
      payload,
    }));
  } catch (error) {
    if (error instanceof TerraqoMessagingError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
