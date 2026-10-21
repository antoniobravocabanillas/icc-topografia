import { created, fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import { requireDiscoveryWorkspaceActor } from "@/lib/server/discovery-needs-auth";
import { isValidWorklogOperationKey } from "@/lib/terraqo/worklog-create-operation";
import { createCollaboration, listCollaborations } from "@/lib/terraqo/collaboration";
import { TerraqoMessagingError } from "@/lib/terraqo/messaging";
import { terraqoCollaborationCreateSchema } from "@/lib/validations/terraqo";
import { requireWorkspacePilotFeature } from "@/lib/terraqo/product-entitlements";

function enabled() {
  return process.env.TERRAQO_COLLABORATION_V1 === "true";
}

export async function GET(request: Request) {
  if (!enabled()) return fail("Recurso no disponible.", 404);
  try {
    const workspaceView = new URL(request.url).searchParams.get("view") === "workspace";
    if (workspaceView) {
      const { session, workspace } = await requireDiscoveryWorkspaceActor();
      return ok(await listCollaborations({ userId: session.user.id, workspaceId: workspace.id }));
    }
    const { response, session } = await requireUser();
    if (response) return response;
    return ok(await listCollaborations({ userId: session.user.id }));
  } catch (error) {
    if (error instanceof TerraqoMessagingError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  if (!enabled()) return fail("Recurso no disponible.", 404);
  try {
    const { session, workspace } = await requireDiscoveryWorkspaceActor();
    const operationKey = request.headers.get("Idempotency-Key")?.trim();
    if (!isValidWorklogOperationKey(operationKey))
      return fail("Clave de reintento inválida.", 400);
    const payload = await parseJson(request, terraqoCollaborationCreateSchema);
    await requireWorkspacePilotFeature(session.user.id, workspace.id, "collaboration_closure");
    return created(await createCollaboration({
      userId: session.user.id,
      workspaceId: workspace.id,
      operationKey: operationKey!,
      payload,
    }));
  } catch (error) {
    if (error instanceof TerraqoMessagingError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
