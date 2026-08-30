import { requireUser } from "@/lib/server/authz";
import { fail, handleApiError, ok } from "@/lib/server/api";
import { uploadMessageAttachment } from "@/lib/server/message-attachments";
import { TerraqoMessagingError } from "@/lib/terraqo/messaging";

export async function POST(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    return ok(await uploadMessageAttachment(request, session.user.id));
  } catch (error) {
    if (error instanceof TerraqoMessagingError)
      return fail(error.message, error.status);
    return handleApiError(error);
  }
}
