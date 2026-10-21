import { z } from "zod";
import { fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import {
  decideEndorsementRequest,
  revokeEndorsementRequest,
  ScopedEndorsementError,
} from "@/lib/terraqo/scoped-endorsement";
import { isValidWorklogOperationKey } from "@/lib/terraqo/worklog-create-operation";
import { terraqoEndorsementDecisionSchema } from "@/lib/validations/terraqo";

type Context = { params: Promise<{ id: string }> };
const revokeSchema = z.object({ expectedVersion: z.number().int().positive() });

function enabled() {
  return process.env.TERRAQO_SCOPED_ENDORSEMENTS_V1 === "true";
}

export async function POST(request: Request, { params }: Context) {
  if (!enabled()) return fail("Recurso no disponible.", 404);
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const operationKey = request.headers.get("Idempotency-Key")?.trim();
    if (!isValidWorklogOperationKey(operationKey))
      return fail("La decisión no incluye una clave de reintento válida.", 400);
    const [{ id }, payload] = await Promise.all([
      params,
      parseJson(request, terraqoEndorsementDecisionSchema),
    ]);
    return ok(await decideEndorsementRequest({
      userId: session.user.id,
      userEmail: session.user.email,
      requestId: id,
      operationKey: operationKey!,
      payload,
    }));
  } catch (error) {
    if (error instanceof ScopedEndorsementError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  if (!enabled()) return fail("Recurso no disponible.", 404);
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const [{ id }, payload] = await Promise.all([params, parseJson(request, revokeSchema)]);
    return ok(await revokeEndorsementRequest({
      userId: session.user.id,
      requestId: id,
      expectedVersion: payload.expectedVersion,
    }));
  } catch (error) {
    if (error instanceof ScopedEndorsementError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
