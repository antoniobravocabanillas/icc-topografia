import type { Prisma } from "@prisma/client";

// The public widget must never receive complete User or StaffProfile records.
export const customerChatSelect = {
  id: true, status: true, topic: true,
  assignedTo: { select: { name: true, image: true } },
  assignedProfile: { select: { displayName: true, roleTitle: true, avatar: true, department: true } },
  messages: { select: { id: true, sender: true, body: true, createdAt: true }, orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], take: 100 },
} satisfies Prisma.ChatConversationSelect;

export function chronologicalChat<T extends { messages: unknown[] }>(chat: T): T {
  return { ...chat, messages: [...chat.messages].reverse() };
}
