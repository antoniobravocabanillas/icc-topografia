import { fail, handleApiError, ok } from "@/lib/server/api";
import { requireDiscoveryWorkspaceActor } from "@/lib/server/discovery-needs-auth";
import { EvidenceAnalysisError, getEvidenceAnalysisJob } from "@/lib/terraqo/evidence-analysis";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (process.env.TERRAQO_DISCOVERY_NEEDS_V1 !== "true" || process.env.TERRAQO_EVIDENCE_ANALYSIS_V1 !== "true") return fail("Recurso no disponible.", 404);
  try {
    const [{ id }, { session, workspace }] = await Promise.all([context.params, requireDiscoveryWorkspaceActor()]);
    return ok(await getEvidenceAnalysisJob({ actorId: session.user.id, workspaceId: workspace.id, jobId: id }));
  } catch (error) {
    if (error instanceof EvidenceAnalysisError) return fail(error.message, error.status, { code: error.code, retryable: error.retryable });
    return handleApiError(error);
  }
}
