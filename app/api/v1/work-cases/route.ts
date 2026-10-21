import { created, fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import { createWorkCase, listWorkCases, WorkCaseError } from "@/lib/terraqo/work-case";
import { terraqoWorkCaseCreateSchema } from "@/lib/validations/terraqo";

export async function GET() {
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    return ok(await listWorkCases(session.user.id));
  } catch (error) {
    if (error instanceof WorkCaseError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const payload = await parseJson(request, terraqoWorkCaseCreateSchema);
    return created(await createWorkCase({ userId: session.user.id, payload }));
  } catch (error) {
    if (error instanceof WorkCaseError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
