import { fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import { respondToTeamInvitation, TerraqoTeamError } from "@/lib/terraqo/teams";
import { terraqoTeamInvitationSchema } from "@/lib/validations/terraqo";

export async function POST(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const payload = await parseJson(request, terraqoTeamInvitationSchema);
    return ok(await respondToTeamInvitation({ userId: session.user.id, payload }));
  } catch (error) {
    if (error instanceof TerraqoTeamError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
