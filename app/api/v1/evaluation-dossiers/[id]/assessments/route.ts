import { created, fail, handleApiError, parseJson } from "@/lib/server/api";
import { requireDiscoveryWorkspaceActor } from "@/lib/server/discovery-needs-auth";
import { DiscoveryNeedsError, saveEvaluationAssessment } from "@/lib/terraqo/discovery-needs";
import { isValidWorklogOperationKey } from "@/lib/terraqo/worklog-create-operation";
import { terraqoEvaluationAssessmentSchema } from "@/lib/validations/terraqo";
import { requireWorkspacePilotFeature } from "@/lib/terraqo/product-entitlements";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (process.env.TERRAQO_DISCOVERY_NEEDS_V1 !== "true") return fail("Recurso no disponible.", 404);
  try {
    const [{ id }, { session, workspace }] = await Promise.all([context.params, requireDiscoveryWorkspaceActor()]);
    const operationKey = request.headers.get("Idempotency-Key")?.trim();
    if (!isValidWorklogOperationKey(operationKey)) return fail("Clave de reintento inválida.", 400);
    const payload = await parseJson(request, terraqoEvaluationAssessmentSchema);
    await requireWorkspacePilotFeature(session.user.id, workspace.id, "employer_needs");
    return created(await saveEvaluationAssessment({ userId: session.user.id, workspaceId: workspace.id, dossierId: id, operationKey: operationKey!, payload }));
  } catch (error) {
    if (error instanceof DiscoveryNeedsError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
