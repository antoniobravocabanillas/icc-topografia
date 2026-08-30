import { requireUser } from "@/lib/server/authz";
import { fail, handleApiError, ok } from "@/lib/server/api";
import {
  TerraqoFriendshipError,
  updateFriendship,
} from "@/lib/terraqo/friendships";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const [{ id }, body] = await Promise.all([params, request.json()]);
    return ok(
      await updateFriendship(session.user.id, id, String(body.action || "")),
    );
  } catch (error) {
    if (error instanceof TerraqoFriendshipError)
      return fail(error.message, error.status);
    return handleApiError(error);
  }
}
