import { created, fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import {
  createEndorsementRequest,
  listEndorsementRequests,
  ScopedEndorsementError,
} from "@/lib/terraqo/scoped-endorsement";
import { isValidWorklogOperationKey } from "@/lib/terraqo/worklog-create-operation";
import { terraqoEndorsementRequestCreateSchema } from "@/lib/validations/terraqo";

function enabled() {
  return process.env.TERRAQO_SCOPED_ENDORSEMENTS_V1 === "true";
}

export async function GET() {
  if (!enabled()) return fail("Recurso no disponible.", 404);
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    return ok(await listEndorsementRequests(session.user.id, session.user.email));
  } catch (error) {
    if (error instanceof ScopedEndorsementError) return fail(error.message, error.status);
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
    const payload = await parseJson(request, terraqoEndorsementRequestCreateSchema);
    return created(await createEndorsementRequest({
      userId: session.user.id,
      userEmail: session.user.email,
      operationKey: operationKey!,
      payload,
    }));
  } catch (error) {
    if (error instanceof ScopedEndorsementError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
