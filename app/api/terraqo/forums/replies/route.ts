import { created, fail, handleApiError, parseJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import { createForumReply, TerraqoForumError } from "@/lib/terraqo/forums";
import { terraqoForumReplyCreateSchema } from "@/lib/validations/terraqo";

export async function POST(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;

  try {
    const payload = await parseJson(request, terraqoForumReplyCreateSchema);
    return created(await createForumReply({ userId: session.user.id, payload }));
  } catch (error) {
    if (error instanceof TerraqoForumError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
