import { DiscoveryNeedsError } from "@/lib/terraqo/discovery-needs";
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
    const params = new URL(request.url).searchParams;
    const workspaceView = params.get("view") === "workspace";
    const collaborationId = params.get("collaborationId") ?? undefined;
    if (collaborationId !== undefined && !/^[a-zA-Z0-9_-]{1,128}$/.test(collaborationId))
      return fail("Colaboración inválida.", 400);
    if (workspaceView) {
      const { session, workspace } = await requireDiscoveryWorkspaceActor();
      return ok(await listCollaborations({ userId: session.user.id, workspaceId: workspace.id, collaborationId }));
    }
    const { response, session } = await requireUser();
    if (response) return response;
    return ok(await listCollaborations({ userId: session.user.id, collaborationId }));
  } catch (error) {
    if (error instanceof TerraqoMessagingError || error instanceof DiscoveryNeedsError) return fail(error.message, error.status);
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
    if (error instanceof TerraqoMessagingError || error instanceof DiscoveryNeedsError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
