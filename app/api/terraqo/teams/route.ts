import { created, fail, handleApiError, parseJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import { createTeam, TerraqoTeamError } from "@/lib/terraqo/teams";
import { terraqoTeamCreateSchema } from "@/lib/validations/terraqo";

export async function POST(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const payload = await parseJson(request, terraqoTeamCreateSchema);
    return created(await createTeam({ userId: session.user.id, payload }));
  } catch (error) {
    if (error instanceof TerraqoTeamError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
