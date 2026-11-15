import { fail, handleApiError, ok } from "@/lib/server/api";
import { requireDiscoveryWorkspaceActor } from "@/lib/server/discovery-needs-auth";
import { discoverEvidenceForNeed, DiscoveryNeedsError } from "@/lib/terraqo/discovery-needs";
import { requireWorkspaceNeedsAccess } from "@/lib/terraqo/product-entitlements";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (process.env.TERRAQO_DISCOVERY_NEEDS_V1 !== "true") return fail("Recurso no disponible.", 404);
  try {
    const [{ id }, { session, workspace }] = await Promise.all([context.params, requireDiscoveryWorkspaceActor()]);
    await requireWorkspaceNeedsAccess(session.user.id, workspace.id);
    return ok(await discoverEvidenceForNeed(workspace.id, id));
  } catch (error) {
    if (error instanceof DiscoveryNeedsError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
