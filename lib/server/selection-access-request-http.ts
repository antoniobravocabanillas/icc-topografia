import { Prisma } from "@prisma/client";
import { fail, handleApiError, ok } from "./api";
import { BoundedRequestBodyError, readBoundedJson } from "./bounded-request-body";
import { publicRequestOrigin } from "./request-origin";
import { selectionAccessRequestSchema, selectionAccessTargetSchema, selectionAccessDecisionSchema, SelectionAccessRequestError } from "@/lib/terraqo/selection-access-request-policy";
import type * as Service from "@/lib/terraqo/selection-access-request";

type Dependencies = {
  enabled: () => boolean;
  authenticate: () => Promise<{ userId: string; verified: boolean } | null>;
  list: typeof Service.listSelectionAccessRequests;
  resolve: typeof Service.resolveRequestedSelectionAccess;
  request: typeof Service.requestSelectionAccess;
  decide: typeof Service.decideSelectionAccess;
};

export function selectionAccessRequestHandlers(deps: Dependencies) {
  async function handle(request: Request) {
    if (!deps.enabled()) return fail("Recurso no disponible.", 404);
    try {
      const actor = await deps.authenticate();
      if (!actor) return fail("Autenticación requerida.", 401);
      if (!actor.verified) return fail("Verifica tu correo antes de gestionar accesos.", 403);
      if (request.method === "GET") {
        const params = new URL(request.url).searchParams;
        if (params.size) {
          if (params.size !== 2 || params.getAll("target").length !== 1 || params.getAll("targetType").length !== 1) return fail("Consulta inválida.", 422);
          return ok(await deps.resolve(actor.userId, selectionAccessTargetSchema.parse(Object.fromEntries(params))));
        }
        return ok(await deps.list(actor.userId));
      }
      if (!["POST", "PATCH"].includes(request.method)) return fail("Método no permitido.", 405);
      if (!request.headers.get("origin") || request.headers.get("origin") !== publicRequestOrigin(request) || request.headers.get("sec-fetch-site") === "cross-site") return fail("Origen no permitido.", 403);
      if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return fail("Se requiere JSON.", 415);
      const body = await readBoundedJson(request, 4096);
      if (request.method === "POST") return ok(await deps.request(actor.userId, selectionAccessRequestSchema.parse(body)), { status: 202 });
      return ok(await deps.decide(actor.userId, selectionAccessDecisionSchema.parse(body)));
    } catch (error) {
      if (error instanceof SelectionAccessRequestError) return fail(error.message, error.status);
      if (error instanceof BoundedRequestBodyError) return fail("Solicitud inválida o demasiado grande.", error.status);
      // PostgreSQL lock/serialization failures from $queryRaw use P2010, not P2034.
      if (error instanceof Prisma.PrismaClientKnownRequestError && (
        ["P2034", "P2002"].includes(error.code) ||
        (error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code)))
      )) return fail("Otra operación modificó el acceso. Reintenta la acción.", 409);
      return handleApiError(error);
    }
  }
  return async (request: Request) => {
    const response = await handle(request);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  };
}
