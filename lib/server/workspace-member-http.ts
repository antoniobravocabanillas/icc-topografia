import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { readBoundedJson, BoundedRequestBodyError } from "./bounded-request-body";
import { changeWorkspaceMember, WorkspaceMemberManagementError } from "../terraqo/workspace-member-management";
import { LastWorkspaceAdministratorError } from "../terraqo/workspace-membership-guard";
import { isSameOriginMutation } from "./same-origin-mutation";

export function workspaceMemberHandler(deps: { db: PrismaClient; actor: () => Promise<string | null>; enabled: () => boolean }) {
  const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  return async (request: Request) => {
    if (!deps.enabled()) return json({ error: "No disponible." }, 404);
    try {
      const actor = await deps.actor();
      if (!actor) return json({ error: "Inicia sesión para continuar." }, 401);
      if (!isSameOriginMutation(request)) return json({ error: "Origen no permitido." }, 403);
      if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return json({ error: "Usa formato JSON." }, 415);
      return json(await changeWorkspaceMember(deps.db, actor, await readBoundedJson(request, 4096)), 200);
    } catch (error) {
      if (error instanceof WorkspaceMemberManagementError) return json({ error: error.message }, error.status);
      if (error instanceof LastWorkspaceAdministratorError) return json({ error: error.message }, 409);
      if (error instanceof BoundedRequestBodyError) return json({ error: "Solicitud no válida o demasiado grande." }, error.status);
      if (error instanceof z.ZodError) return json({ error: "Revisa los datos del acceso." }, 422);
      return json({ error: "No se pudo guardar el acceso. Vuelve a intentarlo." }, 500);
    }
  };
}
