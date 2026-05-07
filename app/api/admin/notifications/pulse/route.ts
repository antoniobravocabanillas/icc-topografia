import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";

const adminRoles = new Set(["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT"]);

export async function GET() {
  const { response, session } = await requireUser();
  if (response) return response;
  if (!adminRoles.has(session.user.role || "")) {
    return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
  }

  try {
    const unreadNotifications = await prisma.notification.count({
      where: {
        readAt: null,
        OR: [{ userId: session.user.id }, { userId: null }]
      }
    });
    const latestNotification = await prisma.notification.findFirst({
      where: { OR: [{ userId: session.user.id }, { userId: null }] },
      orderBy: { createdAt: "desc" }
    });
    const latestCustomerMessage = await prisma.chatMessage.findFirst({
      where: { sender: "customer" },
      include: { conversation: true },
      orderBy: { createdAt: "desc" }
    });
    const latestInternalMessage = await prisma.internalChatMessage.findFirst({
      where: { userId: { not: session.user.id } },
      include: { channel: true, user: true },
      orderBy: { createdAt: "desc" }
    });

    const events = [
      latestNotification
        ? {
            id: `notification:${latestNotification.id}`,
            type: "notification",
            title: latestNotification.title,
            body: latestNotification.body || latestNotification.type,
            href: latestNotification.href || "/admin/notificaciones",
            createdAt: latestNotification.createdAt
          }
        : null,
      latestCustomerMessage
        ? {
            id: `chat:${latestCustomerMessage.id}`,
            type: "chat",
            title: "Nuevo mensaje de cliente",
            body: `${latestCustomerMessage.conversation.customerName}: ${latestCustomerMessage.body}`,
            href: "/admin/chat",
            createdAt: latestCustomerMessage.createdAt
          }
        : null,
      latestInternalMessage
        ? {
            id: `internal:${latestInternalMessage.id}`,
            type: "internal",
            title: `Nuevo mensaje en ${latestInternalMessage.channel.name}`,
            body: `${latestInternalMessage.user?.name || latestInternalMessage.user?.email || "Equipo ICC"}: ${latestInternalMessage.body}`,
            href: "/admin/chat-interno",
            createdAt: latestInternalMessage.createdAt
          }
        : null
    ].filter((event): event is NonNullable<typeof event> => Boolean(event))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return NextResponse.json({
      unreadNotifications,
      latestEvent: events[0]
        ? {
            ...events[0],
            body: events[0].body.slice(0, 180),
            createdAt: events[0].createdAt.toISOString()
          }
        : null
    });
  } catch (error) {
    return handleApiError(error);
  }
}
