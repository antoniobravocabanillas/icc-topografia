import { requireUser } from "@/lib/server/authz";
import { fail, handleApiError, ok } from "@/lib/server/api";
import {
  friendshipList,
  requestFriendship,
  TerraqoFriendshipError,
} from "@/lib/terraqo/friendships";

export async function GET() {
  const { response, session } = await requireUser();
  if (response) return response;
  return ok(await friendshipList(session.user.id));
}

export async function POST(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const body = await request.json();
    return ok(
      await requestFriendship(session.user.id, String(body.recipientId || "")),
    );
  } catch (error) {
    if (error instanceof TerraqoFriendshipError)
      return fail(error.message, error.status);
    return handleApiError(error);
  }
}
