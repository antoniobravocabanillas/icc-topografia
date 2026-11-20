import { fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import { decideConversationRequest } from "@/lib/terraqo/contextual-messaging";
import { TerraqoMessagingError } from "@/lib/terraqo/messaging";
import { terraqoConversationRequestDecisionSchema } from "@/lib/validations/terraqo";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (process.env.TERRAQO_CONTEXTUAL_MESSAGING_V1 !== "true") return fail("Recurso no disponible.", 404);
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const { id } = await context.params;
    const payload = await parseJson(request, terraqoConversationRequestDecisionSchema);
    const result = await decideConversationRequest({ userId: session.user.id, requestId: id, payload });
    // Accepting a conversation must not expose the company's private dossier pointer.
    return ok({ id: result.id, status: result.status, version: result.version,
      conversationId: result.conversationId, respondedAt: result.respondedAt });
  } catch (error) {
    if (error instanceof TerraqoMessagingError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
