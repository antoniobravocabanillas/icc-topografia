import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

type Actor = { workspaceId: string; userId: string; canManage: boolean; canCommercial?: boolean };
type Command = { kind: "outcome"; opportunityId: string; expectedStatus: string; status: string; reason: string; operationKey: string } | { kind: "linkOpportunity"; opportunityId: string } | { kind: "createOpportunity"; companyId: string; title: string; operationKey: string } | { kind: "note"; body: string; operationKey: string } | { kind: "followup"; title: string; dueAt: Date } | { kind: "completeFollowup"; expectedAt: Date } | { kind: "take" } | { kind: "assign"; profileId: string; expectedAssignment: string } | { kind: "close" } | { kind: "reply"; body: string; operationKey: string };
export class ChatOperationError extends Error {}

/** Caller authenticates workspace access. Mutations recheck assignment under the same row lock. */
export async function mutateCustomerChat(db: PrismaClient, actor: Actor, id: string, command: Command) {
  if (!id || id.length > 160) throw new ChatOperationError("Consulta no disponible.");
  if (command.kind === "reply" && (!command.body.trim() || command.body.length > 8000 || !/^[0-9a-f-]{36}$/i.test(command.operationKey))) throw new ChatOperationError("Revisa el mensaje e inténtalo nuevamente.");
  return db.$transaction(async tx => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM icc."ChatConversation" WHERE id = ${id} AND "terraqoWorkspaceId" = ${actor.workspaceId} FOR UPDATE`;
    if (!locked.length) throw new ChatOperationError("Consulta no disponible.");
    const chat = await tx.chatConversation.findUniqueOrThrow({ where: { id } });
    const ownProfile = await tx.staffProfile.findFirst({ where: { userId: actor.userId, terraqoWorkspaceId: actor.workspaceId, active: true }, select: { id: true } });
    const assigned = chat.assignedToId === actor.userId || Boolean(ownProfile && ownProfile.id === chat.assignedProfileId);
    if (!actor.canManage && (!assigned || command.kind === "assign" || command.kind === "take")) throw new ChatOperationError("Esta consulta no está asignada a tu perfil.");
    if (command.kind === "outcome") {
      if (!actor.canCommercial || !["WON", "LOST"].includes(command.status) || command.reason.trim().length < 3 || command.reason.length > 2000 || !/^[0-9a-f-]{36}$/i.test(command.operationKey)) throw new ChatOperationError("Revisa el resultado y su motivo.");
      const linked = await tx.activityLog.findFirst({ where: { terraqoWorkspaceId: actor.workspaceId, entityType: "ChatConversation", entityId: id, action: "CONVERTED", opportunityId: command.opportunityId }, select: { id: true } });
      if (!linked) throw new ChatOperationError("Vincula primero una oportunidad de esta empresa.");
      // Lock the commercial entity too: several conversations may share one opportunity.
      const opportunities = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM icc."Opportunity" WHERE id = ${command.opportunityId} AND "terraqoWorkspaceId" = ${actor.workspaceId} AND "deletedAt" IS NULL FOR UPDATE`;
      if (!opportunities.length) throw new ChatOperationError("Oportunidad no disponible.");
      const receiptId = `chatoutcome_${createHash("sha256").update(JSON.stringify([actor.workspaceId, id, actor.userId, command.operationKey])).digest("hex")}`;
      const signature = JSON.stringify([command.opportunityId, command.expectedStatus, command.status, command.reason.trim()]);
      const receipt = await tx.activityLog.findUnique({ where: { id: receiptId } });
      if (receipt) {
        if (JSON.stringify(receipt.metadata) !== JSON.stringify({ signature })) throw new ChatOperationError("La operación corresponde a otro resultado.");
        return;
      }
      if (opportunities[0].status !== command.expectedStatus || ["WON", "LOST", "ARCHIVED"].includes(opportunities[0].status)) throw new ChatOperationError("El resultado cambió o ya fue cerrado. Actualiza la conversación.");
      await tx.opportunity.update({ where: { id: command.opportunityId }, data: { status: command.status as "WON" | "LOST", probability: command.status === "WON" ? 100 : 0 } });
      await tx.activityLog.create({ data: { id: receiptId, terraqoWorkspaceId: actor.workspaceId, actorId: actor.userId, entityType: "ChatConversation", entityId: id, opportunityId: command.opportunityId, action: "UPDATED", title: command.status === "WON" ? "Venta declarada por el equipo" : "Oportunidad perdida", body: command.reason.trim(), metadata: { signature } } });
      // This records a team declaration only; it never creates a Sale or a payment.
      return;
    }
    if (command.kind === "linkOpportunity" || command.kind === "createOpportunity") {
      if (!actor.canCommercial) throw new ChatOperationError("No tienes permiso para gestionar oportunidades.");
      let opportunityId: string;
      if (command.kind === "createOpportunity") {
        if (!command.title.trim() || command.title.length > 160 || !/^[0-9a-f-]{36}$/i.test(command.operationKey)) throw new ChatOperationError("Revisa la oportunidad.");
        const company = await tx.company.findFirst({ where: { id: command.companyId, terraqoWorkspaceId: actor.workspaceId, deletedAt: null }, select: { id: true } });
        if (!company) throw new ChatOperationError("Selecciona una empresa de este workspace.");
        opportunityId = `chatopp_${createHash("sha256").update(JSON.stringify([actor.workspaceId, id, actor.userId, command.operationKey])).digest("hex")}`;
        const prior = await tx.opportunity.findUnique({ where: { id: opportunityId } });
        if (prior && (prior.companyId !== company.id || prior.title !== command.title.trim())) throw new ChatOperationError("La operación ya corresponde a otra oportunidad.");
        if (!prior) await tx.opportunity.create({ data: { id: opportunityId, code: `CHAT-${opportunityId.slice(8)}`, title: command.title.trim(), companyId: company.id, terraqoWorkspaceId: actor.workspaceId, source: "customer-chat", sellerProfileId: ownProfile?.id || null, interest: chat.topic } });
      } else {
        const opportunity = await tx.opportunity.findFirst({ where: { id: command.opportunityId, terraqoWorkspaceId: actor.workspaceId, deletedAt: null }, select: { id: true } });
        if (!opportunity) throw new ChatOperationError("Oportunidad no disponible en esta empresa.");
        opportunityId = opportunity.id;
      }
      const linkId = `chatlink_${createHash("sha256").update(JSON.stringify([actor.workspaceId, id, opportunityId])).digest("hex")}`;
      await tx.activityLog.upsert({ where: { id: linkId }, update: {}, create: {
        id: linkId, actorId: actor.userId, terraqoWorkspaceId: actor.workspaceId, entityType: "ChatConversation", entityId: id, action: "CONVERTED", opportunityId,
        title: command.kind === "createOpportunity" ? "Oportunidad originada en atención" : "Oportunidad vinculada a atención",
        metadata: { attribution: command.kind === "createOpportunity" ? "originated" : "assisted" },
      } });
      return;
    }
    if (command.kind === "note") {
      if (!command.body.trim() || command.body.length > 4000 || !/^[0-9a-f-]{36}$/i.test(command.operationKey)) throw new ChatOperationError("Revisa la nota.");
      const noteId = `chatnote_${createHash("sha256").update(JSON.stringify([actor.workspaceId, actor.userId, id, command.operationKey])).digest("hex")}`;
      const prior = await tx.activityLog.findUnique({ where: { id: noteId } });
      if (prior) {
        if (prior.body !== command.body.trim()) throw new ChatOperationError("La operación corresponde a otra nota.");
        return;
      }
      await tx.activityLog.create({ data: { id: noteId, actorId: actor.userId, terraqoWorkspaceId: actor.workspaceId, entityType: "ChatConversation", entityId: id, action: "COMMENTED", title: "Nota interna", body: command.body.trim() } });
      return;
    }
    if (command.kind === "followup" || command.kind === "completeFollowup") {
      if (chat.status === "CLOSED") throw new ChatOperationError("La consulta ya está resuelta.");
      if (!chat.assignedToId && !chat.assignedProfileId) throw new ChatOperationError("Asigna un responsable antes de programar el seguimiento.");
      if (command.kind === "followup") {
        if (!command.title.trim() || command.title.length > 240 || !Number.isFinite(command.dueAt.getTime()) || command.dueAt.getTime() <= Date.now()) throw new ChatOperationError("Indica una acción y una fecha futura.");
        await tx.chatConversation.update({ where: { id }, data: { nextAction: command.title.trim(), nextActionAt: command.dueAt, nextActionCompletedAt: null } });
      } else {
        if (!chat.nextActionAt || chat.nextActionAt.getTime() !== command.expectedAt.getTime()) throw new ChatOperationError("El seguimiento cambió. Actualiza antes de completarlo.");
        if (chat.nextActionCompletedAt) return;
        await tx.chatConversation.update({ where: { id }, data: { nextActionCompletedAt: new Date() } });
      }
      await tx.activityLog.create({ data: {
        actorId: actor.userId, terraqoWorkspaceId: actor.workspaceId, entityType: "ChatConversation", entityId: id,
        action: "UPDATED", title: command.kind === "followup" ? "Seguimiento programado" : "Seguimiento completado",
        metadata: command.kind === "followup" ? { nextAction: command.title.trim(), dueAt: command.dueAt.toISOString() } : { dueAt: command.expectedAt.toISOString() },
      } });
      return;
    }
    if (command.kind === "reply") {
      const messageId = `chat_${createHash("sha256").update(JSON.stringify([actor.workspaceId, actor.userId, id, command.operationKey])).digest("hex")}`;
      const previous = await tx.chatMessage.findUnique({ where: { id: messageId } });
      if (previous) {
        if (previous.body !== command.body.trim()) throw new ChatOperationError("La operación ya corresponde a otro mensaje.");
        return;
      }
      if (chat.status === "CLOSED") throw new ChatOperationError("La consulta ya está resuelta. Actualiza la bandeja.");
      await tx.chatConversation.update({ where: { id }, data: {
        status: "ACTIVE",
        // A reply never steals another advisor's assignment.
        ...(!chat.assignedToId && !chat.assignedProfileId ? { assignedToId: actor.userId, assignedProfileId: ownProfile?.id || null } : {}),
        messages: { create: { id: messageId, sender: "admin", body: command.body.trim() } },
      } });
      await tx.activityLog.create({ data: {
        actorId: actor.userId, terraqoWorkspaceId: actor.workspaceId,
        entityType: "ChatConversation", entityId: id, action: "COMMENTED",
        title: "Respuesta enviada", metadata: { messageId },
      } });
      return;
    }
    if (command.kind === "close" && chat.status === "CLOSED") return;
    if (chat.status === "CLOSED") throw new ChatOperationError("La consulta ya está resuelta.");
    if (command.kind === "take") {
      if (chat.assignedToId || chat.assignedProfileId) throw new ChatOperationError("La consulta ya tiene responsable. Actualiza la bandeja.");
      await tx.chatConversation.update({ where: { id }, data: { assignedToId: actor.userId, assignedProfileId: ownProfile?.id || null } });
    } else if (command.kind === "assign") {
      if (command.expectedAssignment !== JSON.stringify([chat.assignedToId, chat.assignedProfileId])) throw new ChatOperationError("El responsable cambió. Actualiza antes de transferir la consulta.");
      const profile = await tx.staffProfile.findFirst({ where: { id: command.profileId, terraqoWorkspaceId: actor.workspaceId, active: true }, select: { id: true, userId: true } });
      if (!profile) throw new ChatOperationError("El responsable no está disponible en esta empresa.");
      await tx.chatConversation.update({ where: { id }, data: { assignedProfileId: profile.id, assignedToId: profile.userId } });
    } else {
      await tx.chatConversation.update({ where: { id }, data: { status: "CLOSED" } });
    }
    await tx.activityLog.create({ data: {
      actorId: actor.userId, terraqoWorkspaceId: actor.workspaceId,
      entityType: "ChatConversation", entityId: id,
      action: command.kind === "close" ? "STATUS_CHANGED" : "ASSIGNED",
      title: command.kind === "close" ? "Consulta resuelta" : "Responsable actualizado",
      metadata: { previousUserId: chat.assignedToId, previousProfileId: chat.assignedProfileId, command: command.kind, ...(command.kind === "assign" ? { profileId: command.profileId } : {}) },
    } });
  }, { isolationLevel: "ReadCommitted" });
}
