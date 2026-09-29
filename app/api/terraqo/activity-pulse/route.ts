import { prisma } from "@/lib/prisma";
import { fail, handleApiError, ok } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response, session } = await requireUser();
  if (response) return response;
  const userId = session.user.id;
  if (!userId) return fail("Sesión inválida.", 401);

  try {
    const participants = await prisma.terraqoConversationParticipant.findMany({
      where: { userId, leftAt: null, mutedAt: null },
      select: { conversationId: true, lastReadAt: true, joinedAt: true },
    });
    const unreadWindows = participants.map((participant) => ({
      conversationId: participant.conversationId,
      createdAt: { gt: participant.lastReadAt || participant.joinedAt },
    }));

    const notificationScope: Prisma.NotificationWhereInput = {
      OR: [
        { userId },
        {
          userId: null,
          terraqoWorkspace: {
            members: { some: { userId, active: true } },
          },
        },
      ],
    };

    const [unreadMessages, latestMessage, unreadNotifications, latestNotification] =
      await Promise.all([
        unreadWindows.length
          ? prisma.terraqoDirectMessage.count({
              where: {
                deletedAt: null,
                senderId: { not: userId },
                OR: unreadWindows,
              },
            })
          : 0,
        participants.length
          ? prisma.terraqoDirectMessage.findFirst({
              where: {
                deletedAt: null,
                senderId: { not: userId },
                conversationId: { in: participants.map((item) => item.conversationId) },
              },
              select: {
                id: true,
                body: true,
                createdAt: true,
                conversationId: true,
                sender: { select: { name: true, email: true } },
                attachmentItems: { select: { kind: true }, take: 1 },
              },
              orderBy: { createdAt: "desc" },
            })
          : null,
        prisma.notification.count({
          where: { ...notificationScope, readAt: null },
        }),
        prisma.notification.findFirst({
          where: notificationScope,
          select: {
            id: true,
            title: true,
            body: true,
            type: true,
            href: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    const messageEvent = latestMessage
      ? {
          id: `message:${latestMessage.id}`,
          channel: "message" as const,
          title: latestMessage.sender.name || latestMessage.sender.email,
          body:
            latestMessage.body ||
            (latestMessage.attachmentItems[0]?.kind === "AUDIO"
              ? "Envió un mensaje de voz"
              : "Compartió un archivo"),
          href: `/portal/mensajes?conversation=${latestMessage.conversationId}`,
          createdAt: latestMessage.createdAt,
        }
      : null;
    const notificationEvent = latestNotification
      ? {
          id: `notification:${latestNotification.id}`,
          channel: "notification" as const,
          title: latestNotification.title,
          body: latestNotification.body || latestNotification.type,
          href: latestNotification.href || "/portal#actividad",
          createdAt: latestNotification.createdAt,
        }
      : null;
    const latestEvent = [messageEvent, notificationEvent]
      .filter((event): event is NonNullable<typeof event> => Boolean(event))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];

    return ok({
      unreadMessages,
      unreadNotifications,
      latestEvent: latestEvent
        ? {
            ...latestEvent,
            body: latestEvent.body.slice(0, 180),
            createdAt: latestEvent.createdAt.toISOString(),
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
