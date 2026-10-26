import { createHash } from "node:crypto";
import { Prisma, type TerraqoMemberRole } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  terraqoEndorsementDecisionSchema,
  terraqoEndorsementRequestCreateSchema,
} from "@/lib/validations/terraqo";
import { deriveEndorsementStatus } from "@/lib/terraqo/endorsement-policy";

const ORGANIZATION_REVIEWER_ROLES: TerraqoMemberRole[] = ["OWNER", "ADMIN", "MANAGER"];

export class ScopedEndorsementError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "ScopedEndorsementError";
  }
}

const requestInclude = {
  revision: {
    select: {
      id: true,
      revisionNo: true,
      title: true,
      summary: true,
      outcome: true,
      contributionRole: true,
      responsibilities: true,
      methods: true,
      tools: true,
      contentHash: true,
      createdAt: true,
      worklog: { select: { id: true, occurredAt: true, locationLabel: true, workspaceId: true } },
    },
  },
  requester: { select: { id: true, name: true, image: true } },
  reviewerUser: { select: { id: true, name: true, email: true, image: true } },
  organization: { select: { id: true, name: true, brandName: true, logoUrl: true } },
  decisions: {
    orderBy: { decidedAt: "desc" },
    include: { reviewer: { select: { id: true, name: true, image: true } } },
  },
} satisfies Prisma.TerraqoEndorsementRequestInclude;

function hashOperation(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isRetryableDecisionConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2002" || error.code === "P2034") return true;
  if (error.code !== "P2010") return false;
  const metadata = error.meta as { code?: unknown; message?: unknown } | undefined;
  return metadata?.code === "40001" || (
    typeof metadata?.message === "string" &&
    /could not serialize access/i.test(metadata.message)
  );
}

async function professionalProfile(userId: string) {
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) throw new ScopedEndorsementError("Completa tu perfil profesional.", 409);
  return profile;
}

export async function listEndorsementRequests(userId: string, email: string) {
  return prisma.terraqoEndorsementRequest.findMany({
    where: {
      OR: [
        { requesterId: userId },
        { reviewerUserId: userId },
        { reviewerEmail: email.toLowerCase() },
      ],
    },
    include: requestInclude,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
}

export async function createEndorsementRequest(input: {
  userId: string;
  userEmail: string;
  operationKey: string;
  payload: z.infer<typeof terraqoEndorsementRequestCreateSchema>;
}) {
  const profile = await professionalProfile(input.userId);
  const expiresAt = new Date(input.payload.expiresAt);
  const now = new Date();
  if (expiresAt.getTime() <= now.getTime() + 60 * 60_000)
    throw new ScopedEndorsementError("La solicitud debe tener al menos una hora de vigencia.", 422);
  if (expiresAt.getTime() > now.getTime() + 30 * 86_400_000)
    throw new ScopedEndorsementError("La vigencia máxima de una solicitud es de 30 días.", 422);
  if (input.payload.reviewerUserId === input.userId || input.payload.reviewerEmail === input.userEmail.toLowerCase())
    throw new ScopedEndorsementError("El autor no puede respaldar su propia evidencia.", 422);

  const operationFingerprint = hashOperation(input.payload);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile" WHERE id=${profile.id} FOR UPDATE`);
    const existing = await tx.terraqoEndorsementRequest.findUnique({
      where: { requesterId_operationKey: { requesterId: input.userId, operationKey: input.operationKey } },
      include: requestInclude,
    });
    if (existing) {
      if (existing.operationFingerprint !== operationFingerprint)
        throw new ScopedEndorsementError("La clave de reintento ya fue usada con otra solicitud.", 409);
      return existing;
    }

    const revision = await tx.terraqoWorklogRevision.findFirst({
      where: {
        id: input.payload.revisionId,
        worklog: {
          professionalProfileId: profile.id,
          authorId: input.userId,
          deletedAt: null,
        },
      },
      select: { id: true, contentHash: true, worklog: { select: { workspaceId: true } } },
    });
    if (!revision) throw new ScopedEndorsementError("Revisión no disponible.", 404);

    if (input.payload.organizationId) {
      if (!input.payload.reviewerUserId)
        throw new ScopedEndorsementError("El respaldo empresarial requiere un usuario identificado.", 422);
      if (revision.worklog.workspaceId !== input.payload.organizationId)
        throw new ScopedEndorsementError("La organización no corresponde al contexto de la evidencia.", 422);
      const authority = await tx.terraqoWorkspaceMember.findFirst({
        where: {
          workspaceId: input.payload.organizationId,
          userId: input.payload.reviewerUserId,
          active: true,
          role: { in: ORGANIZATION_REVIEWER_ROLES },
        },
        select: { id: true },
      });
      if (!authority)
        throw new ScopedEndorsementError("El revisor no tiene autoridad empresarial vigente.", 403);
    } else if (input.payload.reviewerUserId) {
      const reviewer = await tx.user.findUnique({ where: { id: input.payload.reviewerUserId }, select: { id: true } });
      if (!reviewer) throw new ScopedEndorsementError("Revisor no disponible.", 404);
    }

    return tx.terraqoEndorsementRequest.create({
      data: {
        revisionId: revision.id,
        professionalProfileId: profile.id,
        requesterId: input.userId,
        reviewerUserId: input.payload.reviewerUserId,
        reviewerEmail: input.payload.reviewerEmail,
        organizationId: input.payload.organizationId,
        relationshipLabel: input.payload.relationshipLabel,
        requestedScope: input.payload.requestedScope,
        revisionHash: revision.contentHash,
        status: input.payload.sendNow ? "PENDING" : "DRAFT",
        sentAt: input.payload.sendNow ? now : null,
        operationKey: input.operationKey,
        operationFingerprint,
        expiresAt,
      },
      include: requestInclude,
    });
  }, { isolationLevel: "Serializable" });
}

export async function decideEndorsementRequest(input: {
  userId: string;
  userEmail: string;
  requestId: string;
  operationKey: string;
  payload: z.infer<typeof terraqoEndorsementDecisionSchema>;
}) {
  const operationFingerprint = hashOperation(input.payload);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        // La identidad se valida sin filtrar por estado. Esto permite resolver
        // un replay idempotente incluso si el primer intento ya dejó la
        // solicitud en un estado terminal.
        const current = await tx.terraqoEndorsementRequest.findFirst({
          where: {
            id: input.requestId,
            OR: [
              { reviewerUserId: input.userId },
              { reviewerUserId: null, reviewerEmail: input.userEmail.toLowerCase() },
            ],
          },
          select: {
            id: true,
            requestedScope: true,
            revisionHash: true,
            organizationId: true,
          },
        });
        if (!current) throw new ScopedEndorsementError("Solicitud no disponible.", 404);
        await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoEndorsementRequest" WHERE id=${current.id} FOR UPDATE`);

        const priorDecision = await tx.terraqoEndorsementDecision.findUnique({
          where: { requestId_operationKey: { requestId: current.id, operationKey: input.operationKey } },
          include: { request: { include: requestInclude } },
        });
        if (priorDecision) {
          if (priorDecision.operationFingerprint !== operationFingerprint)
            throw new ScopedEndorsementError("La clave de reintento ya fue usada con otra decisión.", 409);
          return priorDecision.request;
        }

        const locked = await tx.terraqoEndorsementRequest.findUnique({
          where: { id: current.id },
          select: { version: true, status: true, expiresAt: true },
        });
        if (!locked || locked.version !== input.payload.expectedVersion)
          throw new ScopedEndorsementError("La solicitud cambió en otra sesión. Revisa la versión actual.", 409);
        if (!(["PENDING", "IN_REVIEW"] as string[]).includes(locked.status))
          throw new ScopedEndorsementError("La solicitud ya fue resuelta.", 409);
        if (locked.expiresAt.getTime() <= Date.now())
          throw new ScopedEndorsementError("La solicitud caducó y ya no admite decisiones.", 410);

        const responseFields = input.payload.responses.map((response) => response.field);
        const responseFieldSet = new Set<string>(responseFields);
        if (
          responseFields.length !== current.requestedScope.length ||
          current.requestedScope.some((field) => !responseFieldSet.has(field))
        )
          throw new ScopedEndorsementError("Responde exactamente los aspectos solicitados.", 422);

        let authoritySnapshot: Prisma.InputJsonValue = { kind: "PERSONAL" };
        if (current.organizationId) {
          const membership = await tx.terraqoWorkspaceMember.findFirst({
            where: {
              workspaceId: current.organizationId,
              userId: input.userId,
              active: true,
              role: { in: ORGANIZATION_REVIEWER_ROLES },
            },
            select: { workspaceId: true, role: true, title: true, updatedAt: true },
          });
          if (!membership)
            throw new ScopedEndorsementError("Tu autoridad empresarial ya no está vigente.", 403);
          authoritySnapshot = {
            kind: "ORGANIZATION",
            workspaceId: membership.workspaceId,
            role: membership.role,
            title: membership.title,
            observedAt: new Date().toISOString(),
            membershipUpdatedAt: membership.updatedAt.toISOString(),
          };
        }

        const nextStatus = deriveEndorsementStatus(
          input.payload.responses.map((response) => response.decision),
        );

        await tx.terraqoEndorsementDecision.create({
          data: {
            requestId: current.id,
            reviewerId: input.userId,
            responses: input.payload.responses,
            summaryComment: input.payload.summaryComment,
            revisionHash: current.revisionHash,
            authoritySnapshot,
            operationKey: input.operationKey,
            operationFingerprint,
          },
        });
        return tx.terraqoEndorsementRequest.update({
          where: { id: current.id },
          data: { status: nextStatus, version: { increment: 1 } },
          include: requestInclude,
        });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (isRetryableDecisionConflict(error) && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new ScopedEndorsementError("No se pudo completar la decisión concurrente.", 503);
}

export async function sendEndorsementRequest(input: {
  userId: string;
  requestId: string;
  expectedVersion: number;
}) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.terraqoEndorsementRequest.findFirst({
      where: { id: input.requestId, requesterId: input.userId },
      select: { id: true },
    });
    if (!request) throw new ScopedEndorsementError("Solicitud no disponible.", 404);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoEndorsementRequest" WHERE id=${request.id} FOR UPDATE`);
    const locked = await tx.terraqoEndorsementRequest.findUnique({
      where: { id: request.id },
      select: { version: true, status: true, expiresAt: true },
    });
    if (!locked || locked.version !== input.expectedVersion)
      throw new ScopedEndorsementError("La solicitud cambió en otra sesión.", 409);
    if (locked.status !== "DRAFT")
      throw new ScopedEndorsementError("Solo un borrador puede enviarse.", 409);
    if (locked.expiresAt.getTime() <= Date.now())
      throw new ScopedEndorsementError("Actualiza la vigencia antes de enviar.", 410);
    return tx.terraqoEndorsementRequest.update({
      where: { id: request.id },
      data: { status: "PENDING", sentAt: new Date(), version: { increment: 1 } },
      include: requestInclude,
    });
  }, { isolationLevel: "Serializable" });
}

export async function revokeEndorsementRequest(input: {
  userId: string;
  requestId: string;
  expectedVersion: number;
}) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.terraqoEndorsementRequest.findFirst({
      where: { id: input.requestId, requesterId: input.userId },
      select: { id: true },
    });
    if (!request) throw new ScopedEndorsementError("Solicitud no disponible.", 404);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoEndorsementRequest" WHERE id=${request.id} FOR UPDATE`);
    const locked = await tx.terraqoEndorsementRequest.findUnique({ where: { id: request.id }, select: { version: true, status: true } });
    if (!locked || locked.version !== input.expectedVersion)
      throw new ScopedEndorsementError("La solicitud cambió en otra sesión.", 409);
    if (["REVOKED", "CANCELLED", "EXPIRED"].includes(locked.status))
      throw new ScopedEndorsementError("La solicitud ya no está activa.", 409);
    return tx.terraqoEndorsementRequest.update({
      where: { id: request.id },
      data: { status: "REVOKED", revokedAt: new Date(), version: { increment: 1 } },
      include: requestInclude,
    });
  }, { isolationLevel: "Serializable" });
}
