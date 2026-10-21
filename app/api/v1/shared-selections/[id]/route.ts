import { fail, handleApiError, ok } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import { getGrantedCollection, ScopedSharingError } from "@/lib/terraqo/scoped-sharing";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  if (process.env.TERRAQO_SCOPED_SHARING_V1 !== "true")
    return fail("Recurso no disponible.", 404);
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    return ok(await getGrantedCollection({
      userId: session.user.id,
      userEmail: session.user.email,
      collectionId: (await params).id,
    }));
  } catch (error) {
    if (error instanceof ScopedSharingError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
