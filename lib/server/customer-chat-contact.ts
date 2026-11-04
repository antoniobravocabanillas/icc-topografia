import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { attentionContactRule, attentionState } from "../terraqo/customer-attention-config";
import { PublicChatError } from "./public-customer-chat";

const contactInput = z.object({
  operationKey: z.string().uuid(),
  email: z.string().trim().email().max(254).optional(),
  phone: z.string().trim().min(3).max(40).optional(),
}).strict().refine(input => Boolean(input.email || input.phone), "Comparte al menos un dato de contacto.");
const hash = (parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");

/** Caller must verify the signed visitor capability, including legacy IDs. */
export async function updateCustomerChatContact(db: PrismaClient, workspaceId: string, conversationId: string, input: unknown) {
  const data = contactInput.parse(input);
  const receiptId = `contact_${hash([workspaceId, conversationId, data.operationKey])}`;
  const fingerprint = hash([workspaceId, conversationId, data.operationKey, data.email ?? null, data.phone ?? null]);
  return db.$transaction(async tx => {
    // Match intake lock order. Publication cannot change the policy mid-write.
    const companyLock = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM icc."TerraqoWorkspace" WHERE id = ${workspaceId} AND active = true AND "deletedAt" IS NULL FOR SHARE`;
    if (!companyLock.length) throw new PublicChatError("Atención no disponible", 404);
    const chatLock = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM icc."ChatConversation" WHERE id = ${conversationId} AND "terraqoWorkspaceId" = ${workspaceId} FOR UPDATE`;
    if (!chatLock.length) throw new PublicChatError("Conversación no disponible", 404);
    const receipt = await tx.activityLog.findUnique({ where: { id: receiptId }, select: { metadata: true } });
    if (receipt) {
      const metadata = receipt.metadata as { fingerprint?: string } | null;
      if (metadata?.fingerprint !== fingerprint) throw new PublicChatError("La operación corresponde a otros datos.", 409);
      return { saved: true as const };
    }
    const chat = await tx.chatConversation.findUniqueOrThrow({ where: { id: conversationId }, select: { status: true, topic: true } });
    if (chat.status === "CLOSED") throw new PublicChatError("La consulta ya está resuelta.", 409);
    const company = await tx.terraqoWorkspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true, settings: true } });
    const published = attentionState(company.settings, company.name).published;
    const rule = attentionContactRule(published, chat.topic || "");
    for (const field of ["email", "phone"] as const) {
      if (data[field] && rule[field] === "hidden") throw new PublicChatError("Ese dato no se solicita para este motivo. Actualiza la conversación.", 422);
    }
    const recent = await tx.activityLog.count({ where: { terraqoWorkspaceId: workspaceId, entityType: "ChatConversation", entityId: conversationId, title: "Contacto compartido por visitante", createdAt: { gte: new Date(Date.now() - 60000) } } });
    if (recent >= 5) throw new PublicChatError("Espera un minuto antes de actualizar tus datos.", 429);
    // Omitted fields remain unchanged; sharing contact neither sends messages
    // nor grants marketing consent, verifies ownership, or reopens a chat.
    await tx.chatConversation.update({ where: { id: conversationId }, data: {
      ...(data.email ? { customerEmail: data.email } : {}),
      ...(data.phone ? { customerPhone: data.phone } : {}),
    } });
    await tx.activityLog.create({ data: {
      id: receiptId, terraqoWorkspaceId: workspaceId, entityType: "ChatConversation", entityId: conversationId,
      action: "UPDATED", title: "Contacto compartido por visitante",
      metadata: { fingerprint, fields: [data.email ? "email" : null, data.phone ? "phone" : null].filter(Boolean) },
    } });
    return { saved: true as const };
  });
}
