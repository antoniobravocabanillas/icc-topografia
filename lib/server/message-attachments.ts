import { prisma } from "@/lib/prisma";
import {
  ALLOWED_MESSAGE_ATTACHMENT_TYPES,
  createMessageAttachmentKey,
  getMessageAttachmentStore,
  MAX_MESSAGE_ATTACHMENT_SIZE,
} from "@/lib/server/media";
import { TerraqoMessagingError } from "@/lib/terraqo/messaging";

async function activeParticipant(userId: string, conversationId: string) {
  const participant = await prisma.terraqoConversationParticipant.findFirst({
    where: { userId, conversationId, leftAt: null },
    select: {
      id: true,
      conversation: {
        select: {
          workspace: {
            select: {
              modules: {
                where: { code: "PROFESSIONAL_MESSAGING", active: true },
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });
  if (!participant)
    throw new TerraqoMessagingError(
      "No tienes acceso a esta conversación.",
      403,
    );
  if (
    participant.conversation.workspace &&
    !participant.conversation.workspace.modules.length
  )
    throw new TerraqoMessagingError(
      "El módulo de mensajería no está activo.",
      403,
    );
  return participant;
}

export async function uploadMessageAttachment(
  request: Request,
  userId: string,
) {
  const form = await request.formData();
  const conversationId = String(form.get("conversationId") || "");
  const body = String(form.get("body") || "")
    .trim()
    .slice(0, 4000);
  const durationMs =
    Math.max(0, Math.min(Number(form.get("durationMs") || 0), 3_600_000)) ||
    null;
  const file = form.get("file");
  if (!conversationId || !(file instanceof File))
    throw new TerraqoMessagingError("Selecciona un archivo válido.");
  if (!file.size || file.size > MAX_MESSAGE_ATTACHMENT_SIZE)
    throw new TerraqoMessagingError("El archivo debe pesar como máximo 20 MB.");
  const contentType =
    file.type.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
  if (!ALLOWED_MESSAGE_ATTACHMENT_TYPES.has(contentType))
    throw new TerraqoMessagingError("Este tipo de archivo no está permitido.");

  const participant = await activeParticipant(userId, conversationId);
  const kind = contentType.startsWith("audio/")
    ? "AUDIO"
    : contentType.startsWith("image/")
      ? "IMAGE"
      : "FILE";
  const storageKey = createMessageAttachmentKey(conversationId, file.name);
  const store = getMessageAttachmentStore();
  await store.set(storageKey, await file.arrayBuffer(), {
    metadata: {
      conversationId,
      uploadedBy: userId,
      contentType,
      originalName: file.name,
      size: file.size,
      kind,
    },
  });

  try {
    return await prisma.$transaction(async (tx) => {
      const message = await tx.terraqoDirectMessage.create({
        data: {
          conversationId,
          senderId: userId,
          body,
          attachmentItems: {
            create: {
              storageKey,
              fileName: file.name.slice(0, 180),
              contentType,
              size: file.size,
              kind,
              durationMs,
            },
          },
        },
        include: { attachmentItems: true },
      });
      await tx.terraqoConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: message.createdAt },
      });
      await tx.terraqoConversationParticipant.update({
        where: { id: participant.id },
        data: { lastReadAt: message.createdAt },
      });
      return message;
    });
  } catch (error) {
    await store.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function downloadMessageAttachment(
  userId: string,
  attachmentId: string,
) {
  const attachment = await prisma.terraqoMessageAttachment.findFirst({
    where: {
      id: attachmentId,
      message: {
        conversation: { participants: { some: { userId, leftAt: null } } },
      },
    },
  });
  if (!attachment)
    throw new TerraqoMessagingError("Archivo no encontrado.", 404);
  const entry = await getMessageAttachmentStore().getWithMetadata(
    attachment.storageKey,
    { type: "arrayBuffer" },
  );
  if (!entry)
    throw new TerraqoMessagingError("El archivo ya no está disponible.", 404);
  return { attachment, data: entry.data };
}
