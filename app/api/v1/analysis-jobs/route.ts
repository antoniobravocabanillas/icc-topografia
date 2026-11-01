import { created, fail, handleApiError, parseJson } from "@/lib/server/api";
import { requireDiscoveryWorkspaceActor } from "@/lib/server/discovery-needs-auth";
import { DiscoveryNeedsError } from "@/lib/terraqo/discovery-needs";
import { dispatchEvidenceAnalysisJob, failEvidenceAnalysisDispatch } from "@/lib/server/evidence-analysis-dispatch";
import { EvidenceAnalysisError, getEvidenceAnalysisJob, queueEvidenceAnalysisJob } from "@/lib/terraqo/evidence-analysis";
import { isValidWorklogOperationKey } from "@/lib/terraqo/worklog-create-operation";
import { terraqoAnalysisJobCreateSchema } from "@/lib/validations/terraqo";
import { requireWorkspacePilotFeature } from "@/lib/terraqo/product-entitlements";

export async function POST(request: Request) {
  if (process.env.TERRAQO_DISCOVERY_NEEDS_V1 !== "true" || process.env.TERRAQO_EVIDENCE_ANALYSIS_V1 !== "true") return fail("Recurso no disponible.", 404);
  try {
    const { session, workspace } = await requireDiscoveryWorkspaceActor();
    const operationKey = request.headers.get("Idempotency-Key")?.trim();
    if (!isValidWorklogOperationKey(operationKey)) return fail("Clave de reintento inválida.", 400);
    const payload = await parseJson(request, terraqoAnalysisJobCreateSchema);
    const entitlement = await requireWorkspacePilotFeature(session.user.id, workspace.id, "evidence_analysis");
    const queued = await queueEvidenceAnalysisJob({
      actorId: session.user.id,
      workspaceId: workspace.id,
      operationKey: operationKey!,
      payload,
      monthlyLimit: entitlement.limit ?? undefined,
    });
    if (queued.dispatchRequired) {
      try {
        await dispatchEvidenceAnalysisJob(queued.job.id);
      } catch (error) {
        await failEvidenceAnalysisDispatch(queued.job.id, error);
        throw error;
      }
    }
    return created(await getEvidenceAnalysisJob({ actorId: session.user.id, workspaceId: workspace.id, jobId: queued.job.id }));
  } catch (error) {
    if (error instanceof DiscoveryNeedsError) return fail(error.message, error.status);
    if (error instanceof EvidenceAnalysisError) return fail(error.message, error.status, { code: error.code, retryable: error.retryable });
    return handleApiError(error);
  }
}
