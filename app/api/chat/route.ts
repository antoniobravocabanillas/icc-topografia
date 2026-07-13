import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, handleApiError } from "@/lib/server/api";
import { getDefaultTerraqoWorkspaceId, hasWorkspaceModule } from "@/lib/terraqo/workspace-scope";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
    const chatEnabled = await hasWorkspaceModule("CUSTOMER_CHAT", terraqoWorkspaceId);
    if (!chatEnabled) return fail("Chat no disponible para este workspace", 403);

    const conversationId = String(formData.get("conversationId") || "");
    const body = String(formData.get("body") || "").trim();

    if (!body) return fail("Mensaje requerido", 422);

    if (conversationId) {
      const conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
        select: { status: true }
      });
      if (!conversation) return fail("Conversacion no encontrada", 404);
      if (conversation.status === "CLOSED") return fail("La conversacion fue cerrada. Inicia un nuevo chat.", 409);

      const message = await prisma.chatMessage.create({
        data: { conversationId, sender: "customer", body }
      });
      await prisma.notification.create({
        data: {
          type: "CHAT",
          title: "Nuevo mensaje de cliente",
          body,
          href: "/admin/chat"
        }
      });
      return NextResponse.json({ conversationId, message }, { status: 201 });
    }

    const customerName = String(formData.get("name") || "").trim();
    const customerEmail = String(formData.get("email") || "").trim() || undefined;
    const customerPhone = String(formData.get("phone") || "").trim() || undefined;
    const topic = String(formData.get("topic") || "").trim() || undefined;
    if (!customerName) return fail("Nombre requerido", 422);

    const conversation = await prisma.chatConversation.create({
      data: {
        customerName,
        customerEmail,
        customerPhone,
        topic,
        terraqoWorkspace: terraqoWorkspaceId ? { connect: { id: terraqoWorkspaceId } } : undefined,
        status: "WAITING",
        messages: { create: { sender: "customer", body } }
      },
      include: {
        assignedProfile: true,
        assignedTo: true,
        messages: { orderBy: { createdAt: "asc" } }
      }
    });
    await prisma.notification.create({
      data: {
        type: "CHAT",
        title: "Nuevo chat web",
        body: `${customerName}${topic ? ` - ${topic}` : ""}`,
        href: "/admin/chat"
      }
    });

    return NextResponse.json({ conversationId: conversation.id, conversation }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
    const chatEnabled = await hasWorkspaceModule("CUSTOMER_CHAT", terraqoWorkspaceId);
    if (!chatEnabled) return fail("Chat no disponible para este workspace", 403);

    const id = searchParams.get("conversationId");
    if (!id) return fail("conversationId requerido", 422);

    const conversation = await prisma.chatConversation.findUnique({
      where: { id },
      include: {
        assignedProfile: true,
        assignedTo: true,
        messages: { orderBy: { createdAt: "asc" } }
      }
    });
    if (!conversation) return fail("Conversacion no encontrada", 404);
    return NextResponse.json({ conversation });
  } catch (error) {
    return handleApiError(error);
  }
}
