import { Prisma } from "@prisma/client";
import { z } from "zod";
import { fail, handleApiError, ok } from "./api";
import {
  BoundedRequestBodyError,
  readBoundedJson,
} from "./bounded-request-body";
import { publicRequestOrigin } from "./request-origin";
import { publicationDecisionSchema } from "@/lib/terraqo/publication-review-policy";
import { PublicationReviewError } from "@/lib/terraqo/publication-review";
import type * as Service from "@/lib/terraqo/publication-review";

const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);
const requestSchema = z
  .object({ collectionId: id, expectedVersion: z.number().int().positive() })
  .strict();
const decisionSchema = z
  .object({ reviewId: id, payload: publicationDecisionSchema })
  .strict();
const revokeSchema = z
  .object({ reviewId: id, reason: z.string().trim().min(3).max(2000) })
  .strict();
type Dependencies = {
  enabled: () => boolean;
  authenticate: () => Promise<{ userId: string } | null>;
  list: typeof Service.listPublicationReviews;
  request: typeof Service.requestPublicationReviews;
  decide: typeof Service.decidePublicationReview;
  revoke: typeof Service.revokePublicationReview;
};

/** Same-origin browser mutation boundary. Authenticate before consuming any body. */
export function publicationReviewHandlers(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (!deps.enabled()) return fail("Recurso no disponible.", 404);
    try {
      const actor = await deps.authenticate();
      if (!actor) return fail("Autenticación requerida.", 401);
      if (request.method === "GET") {
        const workspaceId = new URL(request.url).searchParams.get(
          "workspaceId",
        );
        return ok(
          await deps.list(
            actor.userId,
            workspaceId ? id.parse(workspaceId) : undefined,
          ),
          { headers: { "Cache-Control": "private, no-store" } },
        );
      }
      if (!["POST", "PATCH", "DELETE"].includes(request.method))
        return fail("Método no permitido.", 405);
      const origin = request.headers.get("origin");
      if (
        !origin ||
        origin !== publicRequestOrigin(request) ||
        request.headers.get("sec-fetch-site") === "cross-site"
      )
        return fail("Origen de solicitud no permitido.", 403);
      if (
        request.headers
          .get("content-type")
          ?.split(";")[0]
          .trim()
          .toLowerCase() !== "application/json"
      )
        return fail("Se requiere contenido JSON.", 415);
      const body = await readBoundedJson(request, 16_384);
      let result: unknown;
      if (request.method === "POST")
        result = await deps.request({
          userId: actor.userId,
          ...requestSchema.parse(body),
        });
      else if (request.method === "PATCH")
        result = await deps.decide({
          userId: actor.userId,
          ...decisionSchema.parse(body),
        });
      else
        result = await deps.revoke({
          userId: actor.userId,
          ...revokeSchema.parse(body),
        });
      return ok(result, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      if (error instanceof PublicationReviewError)
        return fail(error.message, error.status);
      if (error instanceof BoundedRequestBodyError)
        return fail(
          "El cuerpo de la solicitud no es válido o supera el límite permitido.",
          error.status,
        );
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2002"].includes(error.code)
      )
        return fail(
          "Otra operación cambió la solicitud. Recarga y vuelve a intentarlo.",
          409,
          { retryable: true },
        );
      return handleApiError(error);
    }
  };
}
