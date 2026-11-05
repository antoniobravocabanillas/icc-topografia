import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { readBoundedJson, BoundedRequestBodyError } from "./bounded-request-body";
import { isSameOriginMutation } from "./same-origin-mutation";
import type { sendWorkspaceInvitationEmail } from "./workspace-invitation-email";
import type { WorkspaceInvitationIssue } from "../terraqo/workspace-invitations";
import { createWorkspaceInvitation, manageWorkspaceInvitation, acceptWorkspaceInvitation, listWorkspaceInvitations, WorkspaceInvitationError, workspaceInvitationCreateSchema } from "../terraqo/workspace-invitations";

const id = z.string().min(1).max(160);
const mutation = z.discriminatedUnion("action", [
  workspaceInvitationCreateSchema.extend({ action: z.literal("create") }),
  z.object({ action: z.literal("cancel"), workspaceId: id, invitationId: id }).strict(),
  z.object({ action: z.literal("rotate"), workspaceId: id, invitationId: id, expectedResendCount: z.number().int().min(0).max(5).default(0) }).strict(),
  z.object({ action: z.literal("accept"), token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict(),
]);

/** Session identity is supplied by the server, never by a request payload. */
export function workspaceInvitationHandlers(deps: { db: PrismaClient; actor: (request: Request) => Promise<string | null>; enabled: () => boolean; deliver: typeof sendWorkspaceInvitationEmail }) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  async function deliver(issue: WorkspaceInvitationIssue) {
    try {
      return await deps.deliver(issue);
    } catch {
      // The mutation committed. A timeout can also mean the provider accepted the message.
      return "unconfirmed";
    }
  }
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
          role: data.role, canReadEvaluations: data.canReadEvaluations, operationKey: data.operationKey,
        });
        if (result.token === null) return json({ id: result.id, token: null, replayed: true, delivery: "skipped" });
        return json({ id: result.id, token: result.token, replayed: false, delivery: await deliver(result) }, 201);
      }
      const result = await manageWorkspaceInvitation(deps.db, actorId, data.workspaceId, data.invitationId, data.action, data.action === "rotate" ? data.expectedResendCount : undefined);
      if (result.token === null) return json({ token: null });
      return json({ token: result.token, delivery: await deliver(result) });
    } catch (error) {
      if (error instanceof WorkspaceInvitationError) return json({ error: error.message }, error.status);
      if (error instanceof BoundedRequestBodyError) return json({ error: "Solicitud no válida o demasiado grande." }, error.status);
      if (error instanceof z.ZodError) return json({ error: "Revisa los datos de la invitación." }, 422);
      return json({ error: "No se pudo completar la operación. Vuelve a intentarlo." }, 500);
    }
  }
  return { GET: (request: Request) => handle(request, false), POST: (request: Request) => handle(request, true) };
}
