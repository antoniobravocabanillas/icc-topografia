import { fail, handleApiError, ok } from "@/lib/server/api";
import { BoundedRequestBodyError, readBoundedJson } from "@/lib/server/bounded-request-body";
import { requireDiscoveryWorkspaceActor } from "@/lib/server/discovery-needs-auth";
import { DiscoveryNeedsError } from "@/lib/terraqo/discovery-needs";
import { cancelCollaboration } from "@/lib/terraqo/collaboration";
import { TerraqoMessagingError } from "@/lib/terraqo/messaging";
import { requireWorkspacePilotFeature } from "@/lib/terraqo/product-entitlements";
import { isValidWorklogOperationKey } from "@/lib/terraqo/worklog-create-operation";
import { terraqoCollaborationCancellationSchema } from "@/lib/validations/terraqo";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (process.env.TERRAQO_COLLABORATION_V1 !== "true") return fail("Recurso no disponible.", 404);
  try {
    const { session, workspace } = await requireDiscoveryWorkspaceActor();
    const operationKey = request.headers.get("Idempotency-Key")?.trim();
    if (!isValidWorklogOperationKey(operationKey)) return fail("Clave de reintento inválida.", 400);
    const { id } = await context.params;
    const payload = terraqoCollaborationCancellationSchema.parse(await readBoundedJson(request, 8 * 1024));
    await requireWorkspacePilotFeature(session.user.id, workspace.id, "collaboration_closure");
    return ok(await cancelCollaboration({
      userId: session.user.id, workspaceId: workspace.id, collaborationId: id, operationKey: operationKey!, payload,
    }));
  } catch (error) {
    if (error instanceof BoundedRequestBodyError) return fail("Solicitud no válida o demasiado grande.", error.status);
    if (error instanceof TerraqoMessagingError || error instanceof DiscoveryNeedsError) return fail(error.message, error.status);
    if (error instanceof SyntaxError) return fail("JSON inválido.", 400);
    return handleApiError(error);
  }
}
