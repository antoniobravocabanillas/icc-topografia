import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { PublicChatError } from "./public-customer-chat";
import { routeNewCustomerChat } from "./customer-attention-routing";
export const customerBotInputSchema = z.object({ question: z.string().trim().min(1).max(8000), conversationId: z.string().max(160).optional(), operationKey: z.string().uuid().optional(), name: z.string().max(160).optional(), email: z.union([z.string().email().max(254), z.literal("")]).optional(), phone: z.string().max(40).optional() }).strict();
type Answer = { answer: string; source: string; confidence: number; shouldEscalate: boolean };
const hash = (...parts: string[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
export async function postCustomerBot(db: PrismaClient, workspaceId: string, input: unknown, secure: boolean, answer: (question: string, tx: Prisma.TransactionClient) => Promise<Answer>) {
  const data = customerBotInputSchema.parse(input);
  const key = data.operationKey || randomUUID();
  const id = data.conversationId || `${secure ? "bot2" : "bot"}_${hash(workspaceId, key)}`;
  const questionId = `botq_${hash(workspaceId, id, key)}`;
  const answerId = `bota_${hash(workspaceId, id, key)}`;
  return db.$transaction(async tx => {
    if (!data.conversationId) {
      const workspace = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM icc."TerraqoWorkspace" WHERE id = ${workspaceId} AND active = true AND "deletedAt" IS NULL FOR UPDATE`;
      if (!workspace.length) throw new PublicChatError("Atención no disponible", 404);
      const existing = await tx.botConversation.findUnique({ where: { id }, select: { id: true } });
      if (!existing) {
        if (await tx.botConversation.count({ where: { terraqoWorkspaceId: workspaceId, createdAt: { gte: new Date(Date.now() - 60000) } } }) >= 30) throw new PublicChatError("Inténtalo en un minuto", 429);
        await tx.botConversation.create({ data: { id, terraqoWorkspaceId: workspaceId, customerName: data.name, customerEmail: data.email || null } });
      }
    }
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM icc."BotConversation" WHERE id = ${id} AND "terraqoWorkspaceId" = ${workspaceId} FOR UPDATE`;
    if (!locked.length) throw new PublicChatError("Consulta no disponible", 404);
    const bot = await tx.botConversation.findUniqueOrThrow({ where: { id } });
    const previousQuestion = await tx.botMessage.findUnique({ where: { id: questionId } });
    if (previousQuestion) {
      if (previousQuestion.body !== data.question) throw new PublicChatError("La operación pertenece a otra pregunta", 409);
      const previous = await tx.botMessage.findUniqueOrThrow({ where: { id: answerId } });
      return { conversationId: id, answer: previous.body, source: previous.source, confidence: Number(previous.confidence), shouldEscalate: Boolean(bot.escalatedChatId), escalatedChatId: bot.escalatedChatId };
    }
    if (bot.escalatedChatId) throw new PublicChatError("La conversación ya continúa con el equipo de atención", 409);
    const count = await tx.botMessage.count({ where: { conversationId: id } });
    const recent = await tx.botMessage.count({ where: { conversationId: id, sender: "customer", createdAt: { gte: new Date(Date.now() - 60000) } } });
    if (recent >= 20 || count >= 200) throw new PublicChatError("Continúa tu consulta con un asesor", 429);
    await tx.botMessage.create({ data: { id: questionId, conversationId: id, sender: "customer", body: data.question } });
    const result = await answer(data.question, tx);
    await tx.botMessage.create({ data: { id: answerId, conversationId: id, sender: "bot", body: result.answer, source: result.source, confidence: result.confidence } });
    let escalatedChatId: string | null = null;
    if (result.shouldEscalate) {
      escalatedChatId = `${secure ? "visitor2" : "visitor"}_${hash(workspaceId, id, "handoff")}`;
      const messages = await tx.botMessage.findMany({ where: { conversationId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 202 });
      await tx.chatConversation.create({ data: {
        id: escalatedChatId, terraqoWorkspaceId: workspaceId, customerName: bot.customerName || data.name || "Visitante web", customerEmail: bot.customerEmail || data.email || null, customerPhone: data.phone || null, topic: "Consulta iniciada con el asistente",
        messages: { create: messages.map(message => ({ id: `handoff_${hash(workspaceId, message.id)}`, sender: message.sender, body: message.body, createdAt: message.createdAt })) },
      } });
      await routeNewCustomerChat(tx, workspaceId, escalatedChatId);
      await tx.notification.create({ data: { terraqoWorkspaceId: workspaceId, type: "CHAT", title: "Consulta derivada al equipo", body: data.question.slice(0, 240), href: `/admin/chat?conversation=${escalatedChatId}` } });
      await tx.botConversation.update({ where: { id }, data: { status: "human_handoff", escalatedChatId } });
    }
    return { conversationId: id, ...result, escalatedChatId };
  }, { isolationLevel: "ReadCommitted", timeout: 15000 });
}
