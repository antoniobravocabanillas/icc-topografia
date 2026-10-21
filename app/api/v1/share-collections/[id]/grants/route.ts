import { z } from "zod";
import { created, fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import {
  createCollectionGrant,
  revokeCollectionGrant,
  ScopedSharingError,
} from "@/lib/terraqo/scoped-sharing";
import { terraqoAccessGrantCreateSchema } from "@/lib/validations/terraqo";
import { isValidWorklogOperationKey } from "@/lib/terraqo/worklog-create-operation";

type Context = { params: Promise<{ id: string }> };
const revokeSchema = z.object({
  grantId: z.string().cuid(),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().max(500).optional(),
});

function enabled() {
  return process.env.TERRAQO_SCOPED_SHARING_V1 === "true";
}

export async function POST(request: Request, { params }: Context) {
  if (!enabled()) return fail("Recurso no disponible.", 404);
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const operationKey = request.headers.get("Idempotency-Key")?.trim();
    if (!isValidWorklogOperationKey(operationKey))
      return fail("La solicitud no incluye una clave de reintento válida.", 400);
    const [{ id }, payload] = await Promise.all([
      params,
      parseJson(request, terraqoAccessGrantCreateSchema),
    ]);
    return created(await createCollectionGrant({ userId: session.user.id, collectionId: id, operationKey: operationKey!, payload }));
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
    const [{ id }, payload] = await Promise.all([params, parseJson(request, revokeSchema)]);
    return ok(await revokeCollectionGrant({
      userId: session.user.id,
      collectionId: id,
      ...payload,
    }));
  } catch (error) {
    if (error instanceof ScopedSharingError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
