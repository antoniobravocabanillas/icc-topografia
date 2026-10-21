import { fail, handleApiError, ok } from "@/lib/server/api";
import { getPublicCollectionProjection, ScopedSharingError } from "@/lib/terraqo/scoped-sharing";

type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Context) {
  if (process.env.TERRAQO_SCOPED_SHARING_V1 !== "true")
    return fail("Recurso no disponible.", 404);
  try {
    return ok(await getPublicCollectionProjection((await params).slug));
  } catch (error) {
    if (error instanceof ScopedSharingError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
