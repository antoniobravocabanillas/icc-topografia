import { assertClosureReferenceWorkspaceActor } from "./closure-reference-access";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type {
  terraqoCollaborationCreateSchema,
  terraqoCollaborationDecisionSchema,
  terraqoCollaborationRevisionSchema,
} from "@/lib/validations/terraqo";
import { TerraqoMessagingError } from "@/lib/terraqo/messaging";
import { terraqoCollaborationCancellationSchema } from "@/lib/validations/terraqo";
import { workspaceAdminMemberRoles } from "@/lib/terraqo/workspace-roles";
import { isValidWorklogOperationKey } from "@/lib/terraqo/worklog-create-operation";
import {
  closureProjectionInclude,
  projectAuthorizedClosure,
  type ClosureAudience,
} from "@/lib/terraqo/closure-projection";

type CollaborationCreate = z.infer<typeof terraqoCollaborationCreateSchema>;
type CollaborationRevision = z.infer<typeof terraqoCollaborationRevisionSchema>;
type CollaborationDecision = z.infer<typeof terraqoCollaborationDecisionSchema>;

// Every scope mutation serializes on the parent before reading closure/proposal state.
const closureReviewGuard = {
  select: { revisions: { where: { status: "SUBMITTED" as const }, take: 1, select: { id: true } } },
};

function assertScopeCanChange(collaboration: {
  status: string;
  closure: { revisions: { id: string }[] } | null;
}) {
  if (collaboration.status === "CLOSURE_PROPOSED" || collaboration.closure?.revisions.length)
    throw new TerraqoMessagingError("Resuelve el cierre enviado antes de modificar el alcance.", 409);
  if (collaboration.status === "CLOSED" || collaboration.status === "CANCELLED")
    throw new TerraqoMessagingError("La colaboración cerrada o cancelada no admite cambios de alcance.", 409);
}

const collaborationInclude = {
  workspace: { select: { id: true, name: true } },
  professional: { select: { id: true, name: true, image: true } },
  conversation: { select: { id: true } },
  closure: { include: closureProjectionInclude },
  proposals: {
    orderBy: { revisionNo: "desc" as const },
    include: {
      createdBy: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
      acceptances: {
        orderBy: { acceptedAt: "asc" as const },
        include: { actor: { select: { id: true, name: true } } },
      },
    },
  },
};

export function collaborationOperationFingerprint(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

const cancellationReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("COLLABORATION_CANCELLED"),
  workspaceId: z.string(),
  operationKey: z.string(),
  operationFingerprint: z.string(),
  actor: z.object({ id: z.string(), name: z.string().nullable(), role: z.string(), workspaceRole: z.string().nullable() }),
  previousStatus: z.string(),
  previousVersion: z.number().int().positive(),
  result: z.object({
    id: z.string(), workspaceId: z.string(), status: z.literal("CANCELLED"),
    version: z.number().int().positive(), cancelledAt: z.string().datetime(), cancellationReason: z.string(),
  }),
});

function isCancellationWriteConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return error.code === "P2002" || error.code === "P2034" ||
    (error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code)));
}

export async function cancelCollaboration(input: {
  userId: string;
  workspaceId: string;
  collaborationId: string;
  operationKey: string;
  payload: z.infer<typeof terraqoCollaborationCancellationSchema>;
}) {
  // Validate at the service boundary too: scripts must not bypass the HTTP contract.
  const payload = terraqoCollaborationCancellationSchema.parse(input.payload);
  const operationKey = input.operationKey?.trim().toLowerCase();
  if (!isValidWorklogOperationKey(operationKey))
    throw new TerraqoMessagingError("Clave de reintento inválida.", 400);
  const receiptId = `collaboration-cancel:v1:${collaborationOperationFingerprint([
    input.workspaceId, input.userId, operationKey,
  ])}`;
  const operationFingerprint = collaborationOperationFingerprint({
    collaborationId: input.collaborationId, reason: payload.reason, expectedVersion: payload.expectedVersion,
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Match closure lock order. Never inspect terminal/review state before this lock.
        const parents = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT id FROM icc."TerraqoCollaboration"
          WHERE id=${input.collaborationId} AND "workspaceId"=${input.workspaceId} FOR UPDATE`);

        // Reauthorize every attempt, including replays. Shared row locks order this
        // operation against concurrent role, membership and workspace revocation.
        await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."User" WHERE id=${input.userId} FOR SHARE`);
        await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoWorkspace" WHERE id=${input.workspaceId} FOR SHARE`);
        await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoWorkspaceMember"
          WHERE "workspaceId"=${input.workspaceId} AND "userId"=${input.userId} FOR SHARE`);
        const actor = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true, name: true, role: true } });
        const membership = await tx.terraqoWorkspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
          select: { role: true, active: true },
        });
        const workspace = await tx.terraqoWorkspace.findFirst({
          where: { id: input.workspaceId, active: true, deletedAt: null }, select: { id: true },
        });
        if (!actor || !workspace || (actor.role !== "SUPER_ADMIN" &&
            (!membership?.active || !workspaceAdminMemberRoles.includes(membership.role))))
          throw new TerraqoMessagingError("No tienes autorización para cancelar colaboraciones de este workspace.", 403);
        if (!parents.length) throw new TerraqoMessagingError("Colaboración no disponible.", 404);

        const replay = await tx.activityLog.findUnique({ where: { id: receiptId } });
        if (replay) {
          const parsed = cancellationReceiptSchema.safeParse(replay.metadata);
          const receipt = parsed.success ? parsed.data : null;
          if (!receipt || replay.terraqoWorkspaceId !== input.workspaceId || replay.action !== "STATUS_CHANGED" || replay.entityType !== "TerraqoCollaboration" ||
              replay.entityId !== input.collaborationId || receipt.workspaceId !== input.workspaceId ||
              receipt.actor.id !== input.userId || receipt.operationKey !== operationKey ||
              receipt.operationFingerprint !== operationFingerprint || receipt.previousVersion !== payload.expectedVersion ||
              receipt.result.id !== input.collaborationId || receipt.result.workspaceId !== input.workspaceId ||
              receipt.result.version !== payload.expectedVersion + 1 || receipt.result.cancellationReason !== payload.reason)
            throw new TerraqoMessagingError("La clave de reintento ya fue usada con otra cancelación.", 409);
          // Return the committed receipt, never a fresh projection of mutable history.
          return receipt.result;
        }

        const collaboration = await tx.terraqoCollaboration.findUniqueOrThrow({
          where: { id: input.collaborationId },
          include: { closure: { select: {
            certificate: { select: { id: true } },
            revisions: { where: { status: "SUBMITTED" }, take: 1, select: { id: true } },
          } } },
        });
        assertScopeCanChange(collaboration);
        if (collaboration.closure?.certificate)
          throw new TerraqoMessagingError("Una colaboración certificada no admite cancelación.", 409);
        if (collaboration.version !== payload.expectedVersion)
          throw new TerraqoMessagingError("La colaboración cambió en otra sesión.", 409);

        const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
        const result = {
          id: collaboration.id, workspaceId: input.workspaceId, status: "CANCELLED" as const,
          version: collaboration.version + 1, cancelledAt: clock.now.toISOString(), cancellationReason: payload.reason,
        };
        await tx.terraqoCollaboration.update({
          where: { id: collaboration.id },
          data: { status: "CANCELLED", version: { increment: 1 }, cancelledAt: clock.now, cancellationReason: payload.reason },
        });
        // The unique audit event IS the receipt. Audit failure rolls back the state
        // change; no proposal, acceptance, closure or certificate is removed.
        await tx.activityLog.create({ data: {
          id: receiptId, terraqoWorkspaceId: input.workspaceId, actorId: actor.id, action: "STATUS_CHANGED", entityType: "TerraqoCollaboration",
          entityId: collaboration.id, title: "Colaboración cancelada", body: payload.reason, createdAt: clock.now,
          metadata: {
            schemaVersion: 1, kind: "COLLABORATION_CANCELLED", workspaceId: input.workspaceId,
            operationKey, operationFingerprint, actor: { ...actor, workspaceRole: membership?.active ? membership.role : null },
            previousStatus: collaboration.status, previousVersion: collaboration.version, result,
          },
        } });
        return result;
      }, { isolationLevel: "Serializable", timeout: 45_000 });
    } catch (error) {
      if (!isCancellationWriteConflict(error)) throw error;
      // Retry the entire transaction and its live authority checks, never an
      // out-of-transaction receipt lookup after a serialization/unique abort.
      if (attempt === 2) throw new TerraqoMessagingError("La colaboración cambió en otra sesión. Reintenta la operación.", 409);
    }
  }
  throw new TerraqoMessagingError("No se pudo completar la cancelación.", 409);
}

export function proposalDecisionState(
  action: CollaborationDecision["action"],
) {
  if (action === "ACCEPT")
    return { proposalStatus: "ACCEPTED" as const, collaborationStatus: "ACCEPTED" as const };
  if (action === "REQUEST_CHANGES")
    return { proposalStatus: "CHANGES_REQUESTED" as const, collaborationStatus: "CHANGES_REQUESTED" as const };
  return { proposalStatus: "REJECTED" as const, collaborationStatus: "CHANGES_REQUESTED" as const };
}

function proposalFields(payload: CollaborationCreate | CollaborationRevision) {
  return {
    scope: payload.scope,
    roleTitle: payload.roleTitle,
    deliverables: payload.deliverables,
    startsOn: payload.startsOn ? new Date(`${payload.startsOn}T00:00:00.000Z`) : null,
    endsOn: payload.endsOn ? new Date(`${payload.endsOn}T00:00:00.000Z`) : null,
    conditions: payload.conditions || null,
  };
}

type CollaborationSource = Prisma.TerraqoCollaborationGetPayload<{
  include: typeof collaborationInclude;
}>;

async function projectCollaboration(collaboration: CollaborationSource, audience: ClosureAudience) {
  return {
    ...collaboration,
    closure: await projectAuthorizedClosure(prisma, collaboration.closure, audience, collaboration.professionalUserId),
  };
}

async function getCollaboration(id: string, audience: ClosureAudience) {
  const collaboration = await prisma.terraqoCollaboration.findUnique({
    where: { id },
    include: collaborationInclude,
  });
  if (!collaboration)
    throw new TerraqoMessagingError("Colaboración no disponible.", 404);
  return projectCollaboration(collaboration, audience);
}

export async function listCollaborations(input: {
  userId: string;
  workspaceId?: string;
  collaborationId?: string;
}) {
  if (input.workspaceId) await assertClosureReferenceWorkspaceActor(prisma, input);
  const collaborations = await prisma.terraqoCollaboration.findMany({
    where: {
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : { professionalUserId: input.userId }),
      ...(input.collaborationId ? { id: input.collaborationId } : {}),
    },
    include: collaborationInclude,
    orderBy: { updatedAt: "desc" },
    take: input.collaborationId ? 1 : 100,
  });
  // Only fetch events for collaborations already selected by the authorized GET
  // workspace/professional scope. Never infer a historical actor from live users.
  const cancelled = collaborations.filter(item => item.status === "CANCELLED");
  const events = cancelled.length ? await prisma.activityLog.findMany({
    where: { action: "STATUS_CHANGED", entityType: "TerraqoCollaboration",
      entityId: { in: cancelled.map(item => item.id) },
      terraqoWorkspaceId: { in: [...new Set(cancelled.map(item => item.workspaceId))] },
      id: { startsWith: "collaboration-cancel:v1:" },
    },
    select: { id: true, entityId: true, terraqoWorkspaceId: true, metadata: true },
  }) : [];
  return Promise.all(collaborations.map(async (collaboration) => {
    const actors = events.flatMap(event => {
      if (event.entityId !== collaboration.id || event.terraqoWorkspaceId !== collaboration.workspaceId) return [];
      const parsed = cancellationReceiptSchema.safeParse(event.metadata);
      if (!parsed.success) return [];
      const receipt = parsed.data;
      if (receipt.workspaceId !== collaboration.workspaceId || receipt.result.id !== collaboration.id ||
          receipt.result.workspaceId !== collaboration.workspaceId || receipt.result.version !== collaboration.version ||
          receipt.result.cancelledAt !== collaboration.cancelledAt?.toISOString() ||
          receipt.result.cancellationReason !== collaboration.cancellationReason ||
          event.id !== `collaboration-cancel:v1:${collaborationOperationFingerprint([
            receipt.workspaceId, receipt.actor.id, receipt.operationKey,
          ])}`) return [];
      return [{ id: receipt.actor.id, name: receipt.actor.name }];
    });
    return { ...await projectCollaboration(collaboration, input.workspaceId ? "workspace" : "professional"),
      cancellationActor: actors.length === 1 ? actors[0] : null,
    };
  }));
}

export async function createCollaboration(input: {
  userId: string;
  workspaceId: string;
  operationKey: string;
  payload: CollaborationCreate;
}) {
  const operationFingerprint = collaborationOperationFingerprint(input.payload);
  try {
    const collaborationId = await prisma.$transaction(async (tx) => {
      const replay = await tx.terraqoCollaborationProposal.findUnique({
        where: {
          createdById_operationKey: {
            createdById: input.userId,
            operationKey: input.operationKey,
          },
        },
        select: { collaborationId: true, operationFingerprint: true },
      });
      if (replay) {
        if (replay.operationFingerprint !== operationFingerprint)
          throw new TerraqoMessagingError(
            "La clave de reintento ya fue usada con otra propuesta.",
            409,
          );
        return replay.collaborationId;
      }

      const conversation = await tx.terraqoConversation.findFirst({
        where: {
          id: input.payload.conversationId,
          workspaceId: input.workspaceId,
          archivedAt: null,
          participants: { some: { userId: input.userId, leftAt: null } },
          requests: { some: { status: "ACCEPTED" } },
        },
        select: {
          id: true,
          requests: {
            where: { status: "ACCEPTED" },
            orderBy: { respondedAt: "desc" },
            take: 1,
            select: { recipientId: true },
          },
          participants: {
            where: { leftAt: null },
            select: { userId: true },
          },
        },
      });
      const professionalUserId = conversation?.requests[0]?.recipientId;
      if (
        !conversation ||
        !professionalUserId ||
        !conversation.participants.some(
          (participant) => participant.userId === professionalUserId,
        )
      )
        throw new TerraqoMessagingError(
          "La propuesta requiere una conversación aceptada con el profesional.",
          422,
        );

      const existing = await tx.terraqoCollaboration.findUnique({
        where: {
          workspaceId_conversationId_professionalUserId: {
            workspaceId: input.workspaceId,
            conversationId: conversation.id,
            professionalUserId,
          },
        },
        select: { id: true },
      });
      if (existing)
        throw new TerraqoMessagingError(
          "Ya existe una colaboración para esta conversación. Crea una nueva revisión.",
          409,
        );

      const collaboration = await tx.terraqoCollaboration.create({
        data: {
          workspaceId: input.workspaceId,
          conversationId: conversation.id,
          professionalUserId,
          proposals: {
            create: {
              revisionNo: 1,
              ...proposalFields(input.payload),
              createdById: input.userId,
              operationKey: input.operationKey,
              operationFingerprint,
              acceptances: {
                create: { party: "WORKSPACE", actorId: input.userId },
              },
            },
          },
        },
        select: { id: true },
      });
      return collaboration.id;
    }, { isolationLevel: "Serializable" });
    return getCollaboration(collaborationId, "workspace");
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      const replay = await prisma.terraqoCollaborationProposal.findUnique({
        where: {
          createdById_operationKey: {
            createdById: input.userId,
            operationKey: input.operationKey,
          },
        },
        select: { collaborationId: true, operationFingerprint: true },
      });
      if (replay?.operationFingerprint === operationFingerprint)
        return getCollaboration(replay.collaborationId, "workspace");
    }
    throw error;
  }
}

export async function reviseCollaboration(input: {
  userId: string;
  workspaceId: string;
  collaborationId: string;
  operationKey: string;
  payload: CollaborationRevision;
}) {
  const operationFingerprint = collaborationOperationFingerprint(input.payload);
  const collaborationId = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM icc."TerraqoCollaboration" WHERE id=${input.collaborationId} AND "workspaceId"=${input.workspaceId} FOR UPDATE`,
    );
    const replay = await tx.terraqoCollaborationProposal.findUnique({
      where: {
        createdById_operationKey: {
          createdById: input.userId,
          operationKey: input.operationKey,
        },
      },
      select: { collaborationId: true, operationFingerprint: true, collaboration: { select: { workspaceId: true } } },
    });
    if (replay) {
      if (
        replay.operationFingerprint !== operationFingerprint ||
        replay.collaborationId !== input.collaborationId ||
        replay.collaboration.workspaceId !== input.workspaceId
      )
        throw new TerraqoMessagingError(
          "La clave de reintento ya fue usada con otra revisión.",
          409,
        );
      return replay.collaborationId;
    }

    const collaboration = await tx.terraqoCollaboration.findFirst({
      where: { id: input.collaborationId, workspaceId: input.workspaceId },
      include: {
        closure: closureReviewGuard,
        proposals: {
          orderBy: { revisionNo: "desc" },
          take: 1,
          select: { revisionNo: true },
        },
      },
    });
    if (!collaboration)
      throw new TerraqoMessagingError("Colaboración no disponible.", 404);
    assertScopeCanChange(collaboration);
    if (collaboration.version !== input.payload.expectedVersion)
      throw new TerraqoMessagingError(
        "La colaboración cambió en otra sesión.",
        409,
      );

    await tx.terraqoCollaborationProposal.updateMany({
      where: { collaborationId: collaboration.id, status: "PENDING" },
      data: { status: "SUPERSEDED" },
    });
    await tx.terraqoCollaborationProposal.create({
      data: {
        collaborationId: collaboration.id,
        revisionNo: (collaboration.proposals[0]?.revisionNo || 0) + 1,
        ...proposalFields(input.payload),
        createdById: input.userId,
        operationKey: input.operationKey,
        operationFingerprint,
        acceptances: {
          create: { party: "WORKSPACE", actorId: input.userId },
        },
      },
    });
    await tx.terraqoCollaboration.update({
      where: { id: collaboration.id },
      data: {
        version: { increment: 1 },
        ...(collaboration.acceptedRevisionNo
          ? { status: "IN_PROGRESS" }
          : { status: "PROPOSAL_PENDING" }),
      },
    });
    return collaboration.id;
  }, { isolationLevel: "Serializable" });
  return getCollaboration(collaborationId, "workspace");
}

export async function decideCollaborationProposal(input: {
  userId: string;
  collaborationId: string;
  operationKey: string;
  payload: CollaborationDecision;
}) {
  const decisionFingerprint = collaborationOperationFingerprint(input.payload);
  const collaborationId = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM icc."TerraqoCollaboration" WHERE id=${input.collaborationId} AND "professionalUserId"=${input.userId} FOR UPDATE`,
    );
    const collaboration = await tx.terraqoCollaboration.findFirst({
      where: {
        id: input.collaborationId,
        professionalUserId: input.userId,
      },
      include: {
        closure: closureReviewGuard,
        proposals: {
          orderBy: { revisionNo: "desc" },
          take: 1,
        },
      },
    });
    const proposal = collaboration?.proposals[0];
    if (!collaboration || !proposal)
      throw new TerraqoMessagingError("Propuesta no disponible.", 404);

    if (proposal.status !== "PENDING") {
      if (
        proposal.revisionNo === input.payload.expectedRevisionNo &&
        proposal.decisionOperationKey === input.operationKey &&
        proposal.decisionFingerprint === decisionFingerprint
      )
        return collaboration.id;
      throw new TerraqoMessagingError(
        "La propuesta ya fue resuelta o sustituida.",
        409,
      );
    }
    if (proposal.revisionNo !== input.payload.expectedRevisionNo)
      throw new TerraqoMessagingError(
        "Existe una versión más reciente de la propuesta.",
        409,
      );

    // A matching replay above is read-only and must still work during/after review.
    assertScopeCanChange(collaboration);

    const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const now = clock.now;
    if (input.payload.action === "ACCEPT") {
      await tx.terraqoCollaborationAcceptance.create({
        data: {
          proposalId: proposal.id,
          party: "PROFESSIONAL",
          actorId: input.userId,
          acceptedAt: now,
        },
      });
      await tx.terraqoCollaborationProposal.update({
        where: { id: proposal.id },
        data: {
          status: "ACCEPTED",
          decidedById: input.userId,
          decisionComment: input.payload.comment || null,
          decisionOperationKey: input.operationKey,
          decisionFingerprint,
          decidedAt: now,
        },
      });
      await tx.terraqoCollaboration.update({
        where: { id: collaboration.id },
        data: {
          status: "ACCEPTED",
          acceptedRevisionNo: proposal.revisionNo,
          acceptedAt: now,
          version: { increment: 1 },
        },
      });
      await tx.terraqoConversationContext.upsert({
        where: {
          conversationId_kind_referenceId: {
            conversationId: collaboration.conversationId,
            kind: "PROPOSAL",
            referenceId: proposal.id,
          },
        },
        create: {
          conversationId: collaboration.conversationId,
          kind: "PROPOSAL",
          referenceId: proposal.id,
          labelSnapshot: `Propuesta aceptada · versión ${proposal.revisionNo}`,
          createdById: input.userId,
        },
        update: {},
      });
    } else {
      const decisionState = proposalDecisionState(input.payload.action);
      await tx.terraqoCollaborationProposal.update({
        where: { id: proposal.id },
        data: {
          status: decisionState.proposalStatus,
          decidedById: input.userId,
          decisionComment: input.payload.comment,
          decisionOperationKey: input.operationKey,
          decisionFingerprint,
          decidedAt: now,
        },
      });
      await tx.terraqoCollaboration.update({
        where: { id: collaboration.id },
        data: {
          status: decisionState.collaborationStatus,
          version: { increment: 1 },
        },
      });
    }
    return collaboration.id;
  }, { isolationLevel: "Serializable" });
  return getCollaboration(collaborationId, "professional");
}
