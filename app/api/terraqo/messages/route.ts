import { requireUser } from "@/lib/server/authz";
import { fail, handleApiError, ok } from "@/lib/server/api";
import {
  getConversationHub,
  sendMessage,
  startConversation,
  TerraqoMessagingError,
} from "@/lib/terraqo/messaging";

export async function GET(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;
  const selected =
    new URL(request.url).searchParams.get("conversation") || undefined;
  try {
    return ok(await getConversationHub(session.user.id, selected));
  } catch (error) {
    if (error instanceof TerraqoMessagingError)
      return fail(error.message, error.status);
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const body = await request.json();
    if (body.action === "start")
      return ok(
        await startConversation({
          actorUserId: session.user.id,
          recipientUserId: String(body.recipientUserId || ""),
          workspaceId: body.workspaceId || undefined,
        }),
      );
    if (body.action === "send")
      return ok(
        await sendMessage({
          userId: session.user.id,
          conversationId: String(body.conversationId || ""),
          body: String(body.body || ""),
        }),
      );
    return fail("Accion no valida.", 400);
  } catch (error) {
    if (error instanceof TerraqoMessagingError)
      return fail(error.message, error.status);
    return handleApiError(error);
  }
}
