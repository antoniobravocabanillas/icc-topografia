import { z } from "zod";
import { requireUser } from "@/lib/server/authz";
import { requireDiscoveryWorkspaceActor } from "@/lib/server/discovery-needs-auth";
import { DiscoveryNeedsError } from "@/lib/terraqo/discovery-needs";
import { TerraqoMessagingError } from "@/lib/terraqo/messaging";
import { fail, handleApiError } from "@/lib/server/api";

export const referenceView = z.enum(["workspace", "professional"]).default("professional");
export const referenceId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export function noStore<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}
export function referenceError(error: unknown) {
  return noStore(error instanceof TerraqoMessagingError || error instanceof DiscoveryNeedsError
    ? fail(error.status === 401 ? "Sesión requerida." : "Referencia no disponible.", error.status === 403 ? 404 : error.status)
    : handleApiError(error));
}
export async function referenceActor(view: "workspace" | "professional") {
  if (view === "workspace") {
    const { session, workspace } = await requireDiscoveryWorkspaceActor();
    return { actor: { userId: session.user.id, workspaceId: workspace.id } };
  }
  const { session, response } = await requireUser();
  if (response) return { response: noStore(response) };
  return { actor: { userId: session.user.id } };
}
