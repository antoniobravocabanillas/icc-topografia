import type { PrismaClient } from "@prisma/client";
import { customerChatSelect } from "./customer-chat-projection";
import { PublicChatError } from "./public-customer-chat";
export async function customerChatHistory(db: PrismaClient, workspaceId: string, id: string, before?: string | null) {
  if (before && before.length > 160) throw new PublicChatError("Referencia de historial no válida", 422);
  const cursor = before ? await db.chatMessage.findFirst({ where: { id: before, conversationId: id, conversation: { terraqoWorkspaceId: workspaceId } }, select: { createdAt: true, id: true } }) : null;
  if (before && !cursor) throw new PublicChatError("Referencia de historial no disponible", 404);
  const chat = await db.chatConversation.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: {
    ...customerChatSelect,
    messages: { ...customerChatSelect.messages, take: 101, ...(cursor ? { where: { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } } : {}) },
  } });
  if (!chat) throw new PublicChatError("Conversación no disponible", 404);
  return { ...chat, hasEarlier: chat.messages.length > 100, messages: chat.messages.slice(0, 100).reverse() };
}
