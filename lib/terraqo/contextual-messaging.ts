import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { terraqoConversationRequestCreateSchema, terraqoConversationRequestDecisionSchema } from "@/lib/validations/terraqo";
import { TerraqoMessagingError } from "@/lib/terraqo/messaging";

type RequestCreate = z.infer<typeof terraqoConversationRequestCreateSchema>;
type RequestDecision = z.infer<typeof terraqoConversationRequestDecisionSchema>;

function fingerprint(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function createConversationRequest(input: {
  userId: string;
  workspaceId: string;
  operationKey: string;
  payload: RequestCreate;
}) {
  const operationFingerprint = fingerprint(input.payload);
  return prisma.$transaction(async (tx) => {
    const replay = await tx.terraqoConversationRequest.findUnique({
      where: { requesterId_operationKey: { requesterId: input.userId, operationKey: input.operationKey } },
    });
    if (replay) {
      if (replay.operationFingerprint !== operationFingerprint || replay.workspaceId !== input.workspaceId)
        throw new TerraqoMessagingError("La clave de reintento ya fue usada con otra solicitud.", 409);
      return replay;
    }
    const dossier = await tx.terraqoEvaluationDossier.findFirst({
      where: { id: input.payload.dossierId, workspaceId: input.workspaceId, lifecycle: { not: "ARCHIVED" } },
      select: {
        id: true,
        professionalProfile: { select: { userId: true } },
        needRevision: { select: { title: true } },
        workspace: { select: { modules: { where: { code: "PROFESSIONAL_MESSAGING", active: true }, select: { id: true } } } },
      },
    });
    if (!dossier) throw new TerraqoMessagingError("Expediente no disponible.", 404);
    if (!dossier.workspace.modules.length) throw new TerraqoMessagingError("El módulo de mensajería no está activo.", 403);
    if (dossier.professionalProfile.userId === input.userId)
      throw new TerraqoMessagingError("No puedes enviarte una solicitud a ti mismo.", 422);
    const requestKey = `${input.workspaceId}:${dossier.professionalProfile.userId}:${dossier.id}`;
    const blocked = await tx.terraqoConversationRequest.findFirst({
      where: { workspaceId: input.workspaceId, recipientId: dossier.professionalProfile.userId, status: "BLOCKED" },
      select: { id: true },
    });
    if (blocked) throw new TerraqoMessagingError("El profesional no acepta nuevas solicitudes de este workspace.", 403);
    const pending = await tx.terraqoConversationRequest.findFirst({
      where: { requestKey, status: "PENDING" },
      select: { id: true },
    });
    if (pending) throw new TerraqoMessagingError("Ya existe una solicitud pendiente para este expediente.", 409);
    return tx.terraqoConversationRequest.create({
      data: {
        requestKey,
        workspaceId: input.workspaceId,
        dossierId: dossier.id,
        requesterId: input.userId,
        recipientId: dossier.professionalProfile.userId,
        note: input.payload.note,
        operationKey: input.operationKey,
        operationFingerprint,
      },
    });
  }, { isolationLevel: "Serializable" });
}

export async function listConversationRequests(userId: string) {
  const requests = await prisma.terraqoConversationRequest.findMany({
    where: { OR: [{ requesterId: userId }, { recipientId: userId }] },
    include: {
      workspace: { select: { id: true, name: true } },
      requester: { select: { id: true, name: true, image: true } },
      recipient: { select: { id: true, name: true, image: true } },
      dossier: { select: { id: true, needRevision: { select: { title: true, revisionNo: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 120,
  });
  return requests.map((request) => {
    const outgoing = request.requesterId === userId;
    return {
      id: request.id,
      direction: outgoing ? "OUTGOING" as const : "INCOMING" as const,
      status: request.status,
      version: request.version,
      note: request.note,
      workspace: request.workspace,
      requester: request.requester,
      recipient: request.recipient,
      conversationId: request.conversationId,
      createdAt: request.createdAt,
      respondedAt: request.respondedAt,
      context: outgoing && request.dossier
        ? { kind: "EVALUATION" as const, title: request.dossier.needRevision.title, revisionNo: request.dossier.needRevision.revisionNo }
        : { kind: "PROTECTED" as const, title: "Contexto profesional protegido", revisionNo: null },
    };
  });
}

export async function decideConversationRequest(input: {
  userId: string;
  requestId: string;
  payload: RequestDecision;
}) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.terraqoConversationRequest.findFirst({
      where: { id: input.requestId, recipientId: input.userId },
      include: { dossier: { select: { needRevision: { select: { title: true } } } } },
    });
    if (!request) throw new TerraqoMessagingError("Solicitud no disponible.", 404);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoConversationRequest" WHERE id=${request.id} FOR UPDATE`);
    const locked = await tx.terraqoConversationRequest.findUnique({ where: { id: request.id }, select: { status: true, version: true } });
    if (!locked || locked.status !== "PENDING") throw new TerraqoMessagingError("La solicitud ya fue resuelta.", 409);
    if (locked.version !== input.payload.expectedVersion) throw new TerraqoMessagingError("La solicitud cambió en otra sesión.", 409);

    if (input.payload.action === "ACCEPT") {
      const conversation = await tx.terraqoConversation.create({
        data: {
          type: "COMPANY",
          directKey: `request:${request.id}`,
          workspaceId: request.workspaceId,
          createdById: request.requesterId,
          participants: {
            create: [
              { userId: request.requesterId, role: "OWNER", lastReadAt: new Date() },
              { userId: request.recipientId, role: "MEMBER", lastReadAt: new Date() },
            ],
          },
          ...(request.dossierId ? {
            contexts: { create: { kind: "EVALUATION", referenceId: request.dossierId, labelSnapshot: request.dossier?.needRevision.title, createdById: request.requesterId } },
          } : {}),
        },
        select: { id: true },
      });
      return tx.terraqoConversationRequest.update({
        where: { id: request.id },
        data: { status: "ACCEPTED", conversationId: conversation.id, respondedAt: new Date(), version: { increment: 1 } },
      });
    }
    const blocked = input.payload.action === "BLOCK" || input.payload.action === "REPORT";
    return tx.terraqoConversationRequest.update({
      where: { id: request.id },
      data: {
        status: blocked ? "BLOCKED" : "REJECTED",
        respondedAt: new Date(),
        blockedAt: blocked ? new Date() : null,
        reportedAt: input.payload.action === "REPORT" ? new Date() : null,
        reportReason: input.payload.action === "REPORT" || input.payload.action === "BLOCK" ? input.payload.reason : null,
        version: { increment: 1 },
      },
    });
  }, { isolationLevel: "Serializable" });
}
