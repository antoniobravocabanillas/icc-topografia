import { z } from "zod";
import { fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import { ScopedEndorsementError, sendEndorsementRequest } from "@/lib/terraqo/scoped-endorsement";

type Context = { params: Promise<{ id: string }> };
const sendSchema = z.object({ expectedVersion: z.number().int().positive() });

export async function PATCH(request: Request, { params }: Context) {
  if (process.env.TERRAQO_SCOPED_ENDORSEMENTS_V1 !== "true") return fail("Recurso no disponible.", 404);
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const [{ id }, payload] = await Promise.all([params, parseJson(request, sendSchema)]);
    return ok(await sendEndorsementRequest({ userId: session.user.id, requestId: id, expectedVersion: payload.expectedVersion }));
  } catch (error) {
    if (error instanceof ScopedEndorsementError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
