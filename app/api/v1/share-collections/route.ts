import { created, fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import {
  createShareCollection,
  listShareCollections,
  ScopedSharingError,
} from "@/lib/terraqo/scoped-sharing";
import { terraqoShareCollectionCreateSchema } from "@/lib/validations/terraqo";
import { isValidWorklogOperationKey } from "@/lib/terraqo/worklog-create-operation";

function enabled() {
  return process.env.TERRAQO_SCOPED_SHARING_V1 === "true";
}

export async function GET() {
  if (!enabled()) return fail("Recurso no disponible.", 404);
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    return ok(await listShareCollections(session.user.id));
  } catch (error) {
    if (error instanceof ScopedSharingError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  if (!enabled()) return fail("Recurso no disponible.", 404);
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const operationKey = request.headers.get("Idempotency-Key")?.trim();
    if (!isValidWorklogOperationKey(operationKey))
      return fail("La solicitud no incluye una clave de reintento válida.", 400);
    const payload = await parseJson(request, terraqoShareCollectionCreateSchema);
    return created(await createShareCollection({ userId: session.user.id, operationKey: operationKey!, payload }));
  } catch (error) {
    if (error instanceof ScopedSharingError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
