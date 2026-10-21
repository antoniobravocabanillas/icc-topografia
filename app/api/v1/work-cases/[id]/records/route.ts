import { z } from "zod";
import { fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import { addWorkCaseRecord, removeWorkCaseRecord, WorkCaseError } from "@/lib/terraqo/work-case";
import { terraqoWorkCaseRecordSchema } from "@/lib/validations/terraqo";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const [{ id }, payload] = await Promise.all([
      params,
      parseJson(request, terraqoWorkCaseRecordSchema),
    ]);
    return ok(await addWorkCaseRecord({ userId: session.user.id, workCaseId: id, payload }));
  } catch (error) {
    if (error instanceof WorkCaseError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}

const removeSchema = z.object({
  worklogId: z.string().cuid(),
  expectedVersion: z.number().int().positive(),
});

export async function DELETE(request: Request, { params }: Context) {
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const [{ id }, payload] = await Promise.all([
      params,
      parseJson(request, removeSchema),
    ]);
    return ok(await removeWorkCaseRecord({
      userId: session.user.id,
      workCaseId: id,
      worklogId: payload.worklogId,
      expectedVersion: payload.expectedVersion,
    }));
  } catch (error) {
    if (error instanceof WorkCaseError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
