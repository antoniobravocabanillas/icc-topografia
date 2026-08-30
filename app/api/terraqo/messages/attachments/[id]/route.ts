import { requireUser } from "@/lib/server/authz";
import { fail, handleApiError } from "@/lib/server/api";
import { downloadMessageAttachment } from "@/lib/server/message-attachments";
import { TerraqoMessagingError } from "@/lib/terraqo/messaging";

export async function GET(
  _: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const { id } = await context.params;
    const { attachment, data } = await downloadMessageAttachment(
      session.user.id,
      id,
    );
    const inline = attachment.kind === "AUDIO" || attachment.kind === "IMAGE";
    return new Response(data, {
      headers: {
        "content-type": attachment.contentType,
        "content-length": String(attachment.size),
        "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof TerraqoMessagingError)
      return fail(error.message, error.status);
    return handleApiError(error);
  }
}
