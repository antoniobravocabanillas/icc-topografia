import { fail, handleApiError, ok } from "@/lib/server/api";
import { requireDiscoveryWorkspaceActor } from "@/lib/server/discovery-needs-auth";
import { DiscoveryNeedsError, readEvaluationSource } from "@/lib/terraqo/discovery-needs";

export async function GET(_request: Request, context: {
  params: Promise<{ id: string; sourceId: string }>;
}) {
  if (process.env.TERRAQO_DISCOVERY_NEEDS_V1 !== "true") return fail("Recurso no disponible.", 404);
  try {
    const [{ id, sourceId }, { session, workspace }] = await Promise.all([
      context.params, requireDiscoveryWorkspaceActor(),
    ]);
    const response = ok(await readEvaluationSource({
      userId: session.user.id, workspaceId: workspace.id, dossierId: id, sourceId,
    }));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    if (error instanceof DiscoveryNeedsError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
