import { created, fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import {
  createProfessionalWorklog,
  getVisibleWorklogs,
  setWorklogContinuity,
  TerraqoWorklogError,
} from "@/lib/terraqo/worklog";
import {
  terraqoWorklogContinuitySchema,
  terraqoWorklogCreateSchema,
} from "@/lib/validations/terraqo";
import { isValidWorklogOperationKey } from "@/lib/terraqo/worklog-create-operation";

export async function GET() {
  const { response, session } = await requireUser();
  if (response) return response;

  try {
    const result = await getVisibleWorklogs(session.user.id, 40);
    return ok(result.worklogs);
  } catch (error) {
    if (error instanceof TerraqoWorklogError)
      return fail(error.message, error.status);
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;

  try {
    const payload = await parseJson(request, terraqoWorklogCreateSchema);
    const operationKey = request.headers.get("Idempotency-Key")?.trim();
    if (!isValidWorklogOperationKey(operationKey))
      return fail("La solicitud no incluye una clave de reintento válida.", 400);
    return created(
      await createProfessionalWorklog({
        userId: session.user.id,
        payload,
        operationKey,
      }),
    );
  } catch (error) {
    if (error instanceof TerraqoWorklogError)
      return fail(error.message, error.status);
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;

  try {
    const payload = await parseJson(request, terraqoWorklogContinuitySchema);
    return ok(
      await setWorklogContinuity({ userId: session.user.id, ...payload }),
    );
  } catch (error) {
    if (error instanceof TerraqoWorklogError)
      return fail(error.message, error.status);
    return handleApiError(error);
  }
}
