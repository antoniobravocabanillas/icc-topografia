import { fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import {
  publishCollectionProjection,
  revokeCollectionProjection,
  ScopedSharingError,
} from "@/lib/terraqo/scoped-sharing";
import { terraqoPublicProjectionSchema } from "@/lib/validations/terraqo";

type Context = { params: Promise<{ id: string }> };
function enabled() { return process.env.TERRAQO_SCOPED_SHARING_V1 === "true"; }

export async function POST(request: Request, { params }: Context) {
  if (!enabled()) return fail("Recurso no disponible.", 404);
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const [{ id }, payload] = await Promise.all([params, parseJson(request, terraqoPublicProjectionSchema)]);
    return ok(await publishCollectionProjection({ userId: session.user.id, collectionId: id, expectedVersion: payload.expectedVersion }));
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
