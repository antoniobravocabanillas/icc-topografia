import { fail, handleApiError, ok } from "@/lib/server/api";
import { requireDiscoveryWorkspaceActor } from "@/lib/server/discovery-needs-auth";
import { DiscoveryNeedsError } from "@/lib/terraqo/discovery-needs";
import { dispatchEvidenceAnalysisJob, failEvidenceAnalysisDispatch } from "@/lib/server/evidence-analysis-dispatch";
import { EvidenceAnalysisError, getEvidenceAnalysisJob, retryEvidenceAnalysisJob } from "@/lib/terraqo/evidence-analysis";
import { requireWorkspacePilotFeature } from "@/lib/terraqo/product-entitlements";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (process.env.TERRAQO_DISCOVERY_NEEDS_V1 !== "true" || process.env.TERRAQO_EVIDENCE_ANALYSIS_V1 !== "true") return fail("Recurso no disponible.", 404);
  try {
    const [{ id }, { session, workspace }] = await Promise.all([context.params, requireDiscoveryWorkspaceActor()]);
    await requireWorkspacePilotFeature(session.user.id, workspace.id, "evidence_analysis");
    await retryEvidenceAnalysisJob({ actorId: session.user.id, workspaceId: workspace.id, jobId: id });
    try {
      await dispatchEvidenceAnalysisJob(id);
    } catch (error) {
      await failEvidenceAnalysisDispatch(id, error);
      throw error;
    }
    return ok(await getEvidenceAnalysisJob({ actorId: session.user.id, workspaceId: workspace.id, jobId: id }));
  } catch (error) {
    if (error instanceof DiscoveryNeedsError) return fail(error.message, error.status);
    if (error instanceof EvidenceAnalysisError) return fail(error.message, error.status, { code: error.code, retryable: error.retryable });
    return handleApiError(error);
  }
}
