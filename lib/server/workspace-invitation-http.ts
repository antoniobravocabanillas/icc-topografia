import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { readBoundedJson, BoundedRequestBodyError } from "./bounded-request-body";
import { isSameOriginMutation } from "./same-origin-mutation";
import { createWorkspaceInvitation, manageWorkspaceInvitation, acceptWorkspaceInvitation, listWorkspaceInvitations, WorkspaceInvitationError } from "../terraqo/workspace-invitations";

const id = z.string().min(1).max(160);
const mutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), workspaceId: id, email: z.string().trim().email().max(254), role: z.enum(["VIEWER", "MEMBER", "PROFESSIONAL", "CLIENT"]).default("VIEWER"), operationKey: z.string().uuid() }).strict(),
  z.object({ action: z.enum(["cancel", "rotate"]), workspaceId: id, invitationId: id }).strict(),
  z.object({ action: z.literal("accept"), token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict(),
]);

/** Session identity is supplied by the server, never by a request payload. */
export function workspaceInvitationHandlers(deps: { db: PrismaClient; actor: (request: Request) => Promise<string | null>; enabled: () => boolean }) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  async function handle(request: Request, write: boolean) {
    if (!deps.enabled()) return json({ error: "No disponible." }, 404);
    const actorId = await deps.actor(request);
    if (!actorId) return json({ error: "Inicia sesión para continuar." }, 401);
    try {
      if (!write) {
        const workspaceId = id.parse(new URL(request.url).searchParams.get("workspaceId"));
        return json({ invitations: await listWorkspaceInvitations(deps.db, actorId, workspaceId) });
      }
      // Cookie-authenticated writes require an explicit same-origin browser request.
      if (!isSameOriginMutation(request)) return json({ error: "Origen no permitido." }, 403);
      if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return json({ error: "Usa formato JSON." }, 415);
      const data = mutation.parse(await readBoundedJson(request, 4096));
      if (data.action === "accept") return json(await acceptWorkspaceInvitation(deps.db, actorId, data.token));
      if (data.action === "create") {
        const result = await createWorkspaceInvitation(deps.db, actorId, {
          workspaceId: data.workspaceId, email: data.email,
          role: data.role, operationKey: data.operationKey,
        });
        return json(result, result.replayed ? 200 : 201);
      }
      return json(await manageWorkspaceInvitation(deps.db, actorId, data.workspaceId, data.invitationId, data.action));
    } catch (error) {
      if (error instanceof WorkspaceInvitationError) return json({ error: error.message }, error.status);
      if (error instanceof BoundedRequestBodyError) return json({ error: "Solicitud no válida o demasiado grande." }, error.status);
      if (error instanceof z.ZodError) return json({ error: "Revisa los datos de la invitación." }, 422);
      return json({ error: "No se pudo completar la operación. Vuelve a intentarlo." }, 500);
    }
  }
  return { GET: (request: Request) => handle(request, false), POST: (request: Request) => handle(request, true) };
}
