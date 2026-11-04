import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { customerChatSelect, chronologicalChat } from "./customer-chat-projection";
import { routeNewCustomerChat } from "./customer-attention-routing";
import { attentionState, attentionContactRule } from "../terraqo/customer-attention-config";
export class PublicChatError extends Error { constructor(message: string, readonly status: number) { super(message); } }
const inputSchema = z.object({
 conversationId: z.string().max(160).optional(), operationKey: z.string().uuid().optional(),
 body: z.string().trim().min(1).max(8000), name: z.string().trim().max(160).optional(),
 email: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
 phone: z.string().trim().max(40).optional(), topic: z.string().trim().max(160).optional(),
}).strict();
const digest = (parts: string[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
export async function postCustomerChat(db: PrismaClient, workspaceId: string, input: unknown, secureVisitor = true) {
 const data = inputSchema.parse(input);
 const key = data.operationKey || randomUUID(); // Compatibility for existing installed widgets.
 const id = data.conversationId || `${secureVisitor ? "visitor2" : "visitor"}_${digest([workspaceId, key])}`;
 const messageId = `visitor_msg_${digest([workspaceId, id, key])}`;
 return db.$transaction(async tx => {
  if (!data.conversationId) {
   if (!data.name) throw new PublicChatError("Nombre requerido", 422);
   const workspace = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM icc."TerraqoWorkspace" WHERE id = ${workspaceId} AND active = true AND "deletedAt" IS NULL FOR UPDATE`;
   if (!workspace.length) throw new PublicChatError("Atención no disponible", 404);
   const prior = await tx.chatConversation.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { customerName: true, customerEmail: true, customerPhone: true, topic: true, messages: { where: { id: messageId }, select: { body: true } } } });
   if (prior) {
    if (prior.customerName !== data.name || (prior.customerEmail || "") !== (data.email || "") || (prior.customerPhone || "") !== (data.phone || "") || (prior.topic || "") !== (data.topic || "") || prior.messages[0]?.body !== data.body) throw new PublicChatError("La operación corresponde a otra consulta.", 409);
    return { conversationId: id, conversation: chronologicalChat(await tx.chatConversation.findUniqueOrThrow({ where: { id }, select: customerChatSelect })) };
   }
   // The workspace lock serializes publication with intake. Replays above keep
   // their original receipt even when the company publishes a new policy.
   const company = await tx.terraqoWorkspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true, settings: true } });
   const published = attentionState(company.settings, company.name).published;
   if (published?.contactRules.length) {
    if (!data.topic || !published.topics.includes(data.topic)) throw new PublicChatError("Selecciona un motivo de contacto vigente.", 422);
    const rule = attentionContactRule(published, data.topic);
    for (const field of ["email", "phone"] as const) {
     const label = field === "email" ? "correo electrónico" : "teléfono";
     if (rule[field] === "required" && !data[field]) throw new PublicChatError(`Completa el ${label} para este motivo.`, 422);
     if (rule[field] === "hidden" && data[field]) throw new PublicChatError(`Este motivo no solicita ${label}. Actualiza el formulario.`, 422);
    }
   }
   const recent = await tx.chatConversation.count({ where: { terraqoWorkspaceId: workspaceId, createdAt: { gte: new Date(Date.now() - 60000) } } });
   if (recent >= 30) throw new PublicChatError("Estamos recibiendo muchas consultas. Inténtalo en un minuto.", 429);
   const conversation = await tx.chatConversation.create({ data: { id, terraqoWorkspaceId: workspaceId, customerName: data.name, customerEmail: data.email || null, customerPhone: data.phone || null, topic: data.topic || null, messages: { create: { id: messageId, sender: "customer", body: data.body } } }, select: customerChatSelect });
   await tx.notification.create({ data: { terraqoWorkspaceId: workspaceId, type: "CHAT", title: "Nueva consulta", body: data.name, href: `/admin/chat?conversation=${id}` } });
   await routeNewCustomerChat(tx, workspaceId, id);
   return { conversationId: id, conversation: chronologicalChat(await tx.chatConversation.findUniqueOrThrow({ where: { id: conversation.id }, select: customerChatSelect })) };
  }
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM icc."ChatConversation" WHERE id = ${id} AND "terraqoWorkspaceId" = ${workspaceId} FOR UPDATE`;
  if (!locked.length) throw new PublicChatError("Conversación no encontrada", 404);
  const prior = await tx.chatMessage.findUnique({ where: { id: messageId } });
  if (prior) {
   if (prior.body !== data.body) throw new PublicChatError("La operación corresponde a otro mensaje.", 409);
   return { conversationId: id, message: prior };
  }
  const chat = await tx.chatConversation.findUniqueOrThrow({ where: { id }, select: { status: true } });
  if (chat.status === "CLOSED") throw new PublicChatError("La consulta fue resuelta. Puedes iniciar una nueva.", 409);
  const recent = await tx.chatMessage.count({ where: { conversationId: id, sender: "customer", createdAt: { gte: new Date(Date.now() - 60000) } } });
  if (recent >= 20) throw new PublicChatError("Espera un minuto antes de enviar más mensajes.", 429);
  const message = await tx.chatMessage.create({ data: { id: messageId, conversationId: id, sender: "customer", body: data.body } });
  await tx.chatConversation.update({ where: { id }, data: { status: "WAITING", updatedAt: new Date() } });
  await tx.notification.create({ data: { terraqoWorkspaceId: workspaceId, type: "CHAT", title: "Nuevo mensaje de cliente", body: data.body.slice(0, 240), href: `/admin/chat?conversation=${id}` } });
  return { conversationId: id, message };
 }, { isolationLevel: "ReadCommitted" });
}
