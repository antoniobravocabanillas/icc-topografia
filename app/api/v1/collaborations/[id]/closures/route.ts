import { created, fail, handleApiError, parseJson } from "@/lib/server/api";
import { requireDiscoveryWorkspaceActor } from "@/lib/server/discovery-needs-auth";
import { saveClosureDraft } from "@/lib/terraqo/closure";
import { TerraqoMessagingError } from "@/lib/terraqo/messaging";
import { isValidWorklogOperationKey } from "@/lib/terraqo/worklog-create-operation";
import { terraqoClosureDraftSchema } from "@/lib/validations/terraqo";
import { requireWorkspacePilotFeature } from "@/lib/terraqo/product-entitlements";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (process.env.TERRAQO_CLOSURE_V1 !== "true")
    return fail("Recurso no disponible.", 404);
  try {
    const { session, workspace } = await requireDiscoveryWorkspaceActor();
    const operationKey = request.headers.get("Idempotency-Key")?.trim();
    if (!isValidWorklogOperationKey(operationKey))
      return fail("Clave de reintento inválida.", 400);
    const { id } = await context.params;
    const payload = await parseJson(request, terraqoClosureDraftSchema);
    await requireWorkspacePilotFeature(session.user.id, workspace.id, "collaboration_closure");
    return created(await saveClosureDraft({
      userId: session.user.id,
      workspaceId: workspace.id,
      collaborationId: id,
      operationKey: operationKey!,
      payload,
    }));
  } catch (error) {
    if (error instanceof TerraqoMessagingError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
