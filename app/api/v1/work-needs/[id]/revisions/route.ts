import { fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireDiscoveryWorkspaceActor } from "@/lib/server/discovery-needs-auth";
import { DiscoveryNeedsError, reviseWorkspaceNeed } from "@/lib/terraqo/discovery-needs";
import { terraqoWorkNeedRevisionSchema } from "@/lib/validations/terraqo";
import { isValidWorklogOperationKey } from "@/lib/terraqo/worklog-create-operation";
import { requireWorkspacePilotFeature } from "@/lib/terraqo/product-entitlements";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (process.env.TERRAQO_DISCOVERY_NEEDS_V1 !== "true") return fail("Recurso no disponible.", 404);
  try {
    const [{ id }, { session, workspace }] = await Promise.all([context.params, requireDiscoveryWorkspaceActor()]);
    const operationKey = request.headers.get("Idempotency-Key")?.trim();
    if (!isValidWorklogOperationKey(operationKey)) return fail("Clave de reintento inválida.", 400);
    const payload = await parseJson(request, terraqoWorkNeedRevisionSchema);
    await requireWorkspacePilotFeature(session.user.id, workspace.id, "employer_needs");
    return ok(await reviseWorkspaceNeed({ userId: session.user.id, workspaceId: workspace.id, needId: id, operationKey: operationKey!, payload }));
  } catch (error) {
    if (error instanceof DiscoveryNeedsError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
