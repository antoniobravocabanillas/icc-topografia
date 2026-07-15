import { created, fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import { createProfessionalWorklog, getVisibleWorklogs, TerraqoWorklogError } from "@/lib/terraqo/worklog";
import { terraqoWorklogCreateSchema } from "@/lib/validations/terraqo";

export async function GET() {
  const { response, session } = await requireUser();
  if (response) return response;

  try {
    const result = await getVisibleWorklogs(session.user.id, 40);
    return ok(result.worklogs);
  } catch (error) {
    if (error instanceof TerraqoWorklogError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;

  try {
    const payload = await parseJson(request, terraqoWorklogCreateSchema);
    return created(await createProfessionalWorklog({ userId: session.user.id, payload }));
  } catch (error) {
    return handleApiError(error);
  }
}
