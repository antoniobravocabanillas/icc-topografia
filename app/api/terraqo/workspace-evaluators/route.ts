import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/authz";
import { readBoundedJson, BoundedRequestBodyError } from "@/lib/server/bounded-request-body";
import { isSameOriginMutation } from "@/lib/server/same-origin-mutation";
import { listWorkspaceEvaluators, updateWorkspaceEvaluator, WorkspaceEvaluatorError } from "@/lib/terraqo/workspace-evaluators";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function withActor(action: (userId: string) => Promise<Response>) {
  if (process.env.TERRAQO_WORKSPACE_INVITATIONS_V1 !== "true" || process.env.TERRAQO_WORKSPACE_EVALUATORS_V1 !== "true") return json({ error: "No disponible." }, 404);
  try {
    const session = await requireUser();
    if (session.response) return json({ error: "Inicia sesión para continuar." }, 401);
    return await action(session.session.user.id);
  } catch (error) {
    if (error instanceof WorkspaceEvaluatorError) return json({ error: error.message }, error.status);
    if (error instanceof BoundedRequestBodyError) return json({ error: "Solicitud no válida o demasiado grande." }, error.status);
    return json({ error: "No se pudo completar la operación." }, 500);
  }
}

export function GET(request: Request) {
  return withActor(async userId => {
    const workspaceId = new URL(request.url).searchParams.get("workspaceId") ?? "";
    return json(await listWorkspaceEvaluators(prisma, userId, workspaceId));
  });
}

export function PATCH(request: Request) {
  return withActor(async userId => {
    if (!isSameOriginMutation(request)) return json({ error: "Origen no permitido." }, 403);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return json({ error: "Usa formato JSON." }, 415);
    await updateWorkspaceEvaluator(prisma, userId, await readBoundedJson(request, 49152));
    return json({ saved: true });
  });
}
