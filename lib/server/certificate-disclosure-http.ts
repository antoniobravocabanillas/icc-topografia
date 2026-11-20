import { z } from "zod";
import { requireUser } from "./authz";
import { requireDiscoveryWorkspaceActor } from "./discovery-needs-auth";
import { BoundedRequestBodyError, readBoundedJson } from "./bounded-request-body";
import { isSameOriginMutation } from "./same-origin-mutation";
import { fail, handleApiError } from "./api";
import { TerraqoMessagingError } from "../terraqo/messaging";
import { DiscoveryNeedsError } from "../terraqo/discovery-needs";
import { isValidWorklogOperationKey } from "../terraqo/worklog-create-operation";
export const disclosureId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export function disclosureResponse<T extends Response>(r: T): T {
  r.headers.set("Cache-Control", "private, no-store"); r.headers.set("Vary", "Cookie");
  r.headers.set("Referrer-Policy", "no-referrer"); return r;
}
export async function disclosureActor(request: Request, collaborationId: string) {
  const view = z.enum(["workspace", "professional"]).parse(new URL(request.url).searchParams.get("view") || "professional");
  if (view === "workspace") {
    const { session, workspace } = await requireDiscoveryWorkspaceActor();
    return { userId: session.user.id, workspaceId: workspace.id, collaborationId, view };
  }
  const { session } = await requireUser();
  if (!session) throw new TerraqoMessagingError("Inicia sesión para continuar.", 401);
  return { userId: session.user.id, collaborationId, view };
}
export async function disclosureMutation(request: Request) {
  if (!isSameOriginMutation(request)) throw new TerraqoMessagingError("Origen no permitido.", 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    throw new TerraqoMessagingError("Usa formato JSON.", 415);
  const operationKey = request.headers.get("Idempotency-Key")?.trim();
  if (!isValidWorklogOperationKey(operationKey)) throw new TerraqoMessagingError("Clave de reintento inválida.", 400);
  return { operationKey: operationKey!, payload: await readBoundedJson(request, 4096) };
}
export function disclosureError(error: unknown) {
  return disclosureResponse(error instanceof BoundedRequestBodyError ? fail("El contenido no pudo procesarse.", error.status)
    : error instanceof TerraqoMessagingError || error instanceof DiscoveryNeedsError ? fail(error.message, error.status)
    : handleApiError(error));
}
