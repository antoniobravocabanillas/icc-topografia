import { selectionAccessSnapshot } from "@/lib/server/selection-access-snapshot";
import { fail, handleApiError, ok } from "@/lib/server/api";
import { auth } from "@/auth";
import { getGrantedCollection, ScopedSharingError } from "@/lib/terraqo/scoped-sharing";

type Context = { params: Promise<{ id: string }> };

async function handleGET(request: Request, { params }: Context) {
  if (process.env.TERRAQO_SCOPED_SHARING_V1 !== "true")
    return fail("Recurso no disponible.", 404);
  const session = await auth();
  if (!session?.user?.id) return fail("Inicia sesión para abrir esta selección.", 401);
  try {
    const selection = await getGrantedCollection({
      userId: session.user.id,
      collectionId: (await params).id,
    });
    return ok(new URL(request.url).searchParams.get("access") === "check" ? selectionAccessSnapshot(selection) : selection);
  } catch (error) {
    if (error instanceof ScopedSharingError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}

export async function GET(request: Request, context: Context) {
  const response = await handleGET(request, context);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
