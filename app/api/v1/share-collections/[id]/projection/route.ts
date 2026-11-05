import { fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import {
  publishCollectionProjection,
  revokeCollectionProjection,
  ScopedSharingError,
} from "@/lib/terraqo/scoped-sharing";
import { publicRequestOrigin } from "@/lib/server/request-origin";
import { workCaseTargetSchema } from "@/lib/terraqo/publication-review-policy";
import { terraqoPublicProjectionSchema } from "@/lib/validations/terraqo";

type Context = { params: Promise<{ id: string }> };
function enabled() { return process.env.TERRAQO_SCOPED_SHARING_V1 === "true"; }

export async function POST(request: Request, { params }: Context) {
  if (!enabled()) return fail("Recurso no disponible.", 404);
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const [{ id }, payload] = await Promise.all([params, parseJson(request, terraqoPublicProjectionSchema.extend({ workCase: workCaseTargetSchema.optional() }).strict())]);
    if (payload.workCase && (request.headers.get("origin") !== publicRequestOrigin(request) ||
        request.headers.get("sec-fetch-site") === "cross-site")) return fail("Origen de solicitud no permitido.", 403);
    return ok(await publishCollectionProjection({ userId: session.user.id, collectionId: id, expectedVersion: payload.expectedVersion, workCase: payload.workCase }));
  } catch (error) {
    if (error instanceof ScopedSharingError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  if (!enabled()) return fail("Recurso no disponible.", 404);
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const [{ id }, payload] = await Promise.all([params, parseJson(request, terraqoPublicProjectionSchema)]);
    return ok(await revokeCollectionProjection({ userId: session.user.id, collectionId: id, expectedVersion: payload.expectedVersion }));
  } catch (error) {
    if (error instanceof ScopedSharingError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
