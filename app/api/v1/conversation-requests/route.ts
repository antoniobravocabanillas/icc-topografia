import { created, fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import { requireDiscoveryWorkspaceActor } from "@/lib/server/discovery-needs-auth";
import { createConversationRequest, listConversationRequests } from "@/lib/terraqo/contextual-messaging";
import { TerraqoMessagingError } from "@/lib/terraqo/messaging";
import { isValidWorklogOperationKey } from "@/lib/terraqo/worklog-create-operation";
import { terraqoConversationRequestCreateSchema } from "@/lib/validations/terraqo";
import { requireWorkspacePilotFeature } from "@/lib/terraqo/product-entitlements";

export async function GET() {
  if (process.env.TERRAQO_CONTEXTUAL_MESSAGING_V1 !== "true") return fail("Recurso no disponible.", 404);
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    return ok(await listConversationRequests(session.user.id));
  } catch (error) {
    if (error instanceof TerraqoMessagingError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  if (process.env.TERRAQO_CONTEXTUAL_MESSAGING_V1 !== "true") return fail("Recurso no disponible.", 404);
  try {
    const { session, workspace } = await requireDiscoveryWorkspaceActor();
    const operationKey = request.headers.get("Idempotency-Key")?.trim();
    if (!isValidWorklogOperationKey(operationKey)) return fail("Clave de reintento inválida.", 400);
    const payload = await parseJson(request, terraqoConversationRequestCreateSchema);
    await requireWorkspacePilotFeature(session.user.id, workspace.id, "employer_needs");
    return created(await createConversationRequest({ userId: session.user.id, workspaceId: workspace.id, operationKey: operationKey!, payload }));
  } catch (error) {
    if (error instanceof TerraqoMessagingError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
