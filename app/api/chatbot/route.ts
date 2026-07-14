import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { answerWithLocalKnowledge } from "@/lib/server/chatbot";
import { fail, handleApiError } from "@/lib/server/api";
import { getDefaultTerraqoWorkspaceId, hasWorkspaceModule } from "@/lib/terraqo/workspace-scope";

export async function POST(request: Request) {
  try {
    const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
    const chatEnabled = await hasWorkspaceModule("CUSTOMER_CHAT", terraqoWorkspaceId);
    if (!chatEnabled) return fail("Chat no disponible para este workspace", 403);

    const payload = await request.json().catch(() => null);
    const question = String(payload?.question || "").trim();
    const conversationId = String(payload?.conversationId || "").trim();
    if (!question) return fail("Pregunta requerida", 422);

    const conversation = conversationId
      ? await prisma.botConversation.findFirst({ where: { id: conversationId, terraqoWorkspaceId } })
      : await prisma.botConversation.create({
          data: {
            customerName: payload?.name ? String(payload.name) : undefined,
            customerEmail: payload?.email ? String(payload.email) : undefined,
            terraqoWorkspaceId
          }
        });

    if (!conversation) return fail("Conversacion no encontrada", 404);

    await prisma.botMessage.create({
      data: {
        conversationId: conversation.id,
        sender: "customer",
        body: question
      }
    });

    const answer = await answerWithLocalKnowledge(question);
    let escalatedChatId: string | null = null;

    if (answer.shouldEscalate) {
      const chat = await prisma.chatConversation.create({
        data: {
          customerName: payload?.name ? String(payload.name) : "Visitante web",
          customerEmail: payload?.email ? String(payload.email) : undefined,
          customerPhone: payload?.phone ? String(payload.phone) : undefined,
          topic: "Derivado desde chatbot",
          terraqoWorkspace: { connect: { id: terraqoWorkspaceId } },
          status: "WAITING",
          messages: {
            create: {
              sender: "customer",
              body: question
            }
          }
        }
      });
      escalatedChatId = chat.id;
      await prisma.notification.create({
        data: {
          type: "CHAT",
          title: "Chat derivado desde bot",
          body: question,
          href: "/admin/chat",
          terraqoWorkspaceId
        }
      });
      await prisma.botConversation.update({
        where: { id: conversation.id },
        data: { status: "human_handoff", escalatedChatId }
      });
    }

    await prisma.botMessage.create({
      data: {
        conversationId: conversation.id,
        sender: "bot",
        body: answer.answer,
        source: answer.source,
        confidence: answer.confidence
      }
    });

    return NextResponse.json({
      conversationId: conversation.id,
      answer: answer.answer,
      source: answer.source,
      confidence: answer.confidence,
      shouldEscalate: answer.shouldEscalate,
      escalatedChatId
    });
  } catch (error) {
    return handleApiError(error);
  }
}
