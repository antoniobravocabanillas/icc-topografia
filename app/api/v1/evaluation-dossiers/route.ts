import { created, fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireDiscoveryWorkspaceActor } from "@/lib/server/discovery-needs-auth";
import { createEvaluationDossier, DiscoveryNeedsError, listEvaluationDossiers } from "@/lib/terraqo/discovery-needs";
import { isValidWorklogOperationKey } from "@/lib/terraqo/worklog-create-operation";
import { terraqoEvaluationDossierCreateSchema } from "@/lib/validations/terraqo";
import { requireWorkspacePilotFeature } from "@/lib/terraqo/product-entitlements";

export async function GET() {
  if (process.env.TERRAQO_DISCOVERY_NEEDS_V1 !== "true") return fail("Recurso no disponible.", 404);
  try {
    const { session, workspace } = await requireDiscoveryWorkspaceActor();
    return ok(await listEvaluationDossiers({ userId: session.user.id, workspaceId: workspace.id }));
  } catch (error) {
    if (error instanceof DiscoveryNeedsError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  if (process.env.TERRAQO_DISCOVERY_NEEDS_V1 !== "true") return fail("Recurso no disponible.", 404);
  try {
    const { session, workspace } = await requireDiscoveryWorkspaceActor();
    const operationKey = request.headers.get("Idempotency-Key")?.trim();
    if (!isValidWorklogOperationKey(operationKey)) return fail("Clave de reintento inválida.", 400);
    const payload = await parseJson(request, terraqoEvaluationDossierCreateSchema);
    await requireWorkspacePilotFeature(session.user.id, workspace.id, "employer_needs");
    return created(await createEvaluationDossier({
      userId: session.user.id,
      workspaceId: workspace.id,
      operationKey: operationKey!,
      payload,
    }));
  } catch (error) {
    if (error instanceof DiscoveryNeedsError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
