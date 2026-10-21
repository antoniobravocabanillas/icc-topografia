import { fail, handleApiError, ok } from "@/lib/server/api";
import { requireDiscoveryWorkspaceActor } from "@/lib/server/discovery-needs-auth";
import { DiscoveryNeedsError } from "@/lib/terraqo/discovery-needs";
import { getWorkspaceProductEntitlements } from "@/lib/terraqo/product-entitlements";

export async function GET() {
  try {
    const { session, workspace } = await requireDiscoveryWorkspaceActor();
    return ok(await getWorkspaceProductEntitlements(session.user.id, workspace.id));
  } catch (error) {
    if (error instanceof DiscoveryNeedsError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
