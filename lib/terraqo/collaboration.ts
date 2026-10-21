import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import type {
  terraqoCollaborationCreateSchema,
  terraqoCollaborationDecisionSchema,
  terraqoCollaborationRevisionSchema,
} from "@/lib/validations/terraqo";
import { TerraqoMessagingError } from "@/lib/terraqo/messaging";

type CollaborationCreate = z.infer<typeof terraqoCollaborationCreateSchema>;
type CollaborationRevision = z.infer<typeof terraqoCollaborationRevisionSchema>;
type CollaborationDecision = z.infer<typeof terraqoCollaborationDecisionSchema>;

const collaborationInclude = {
  workspace: { select: { id: true, name: true } },
  professional: { select: { id: true, name: true, image: true } },
  conversation: { select: { id: true } },
  closure: {
    include: {
      currentRevision: {
        include: {
          references: {
            include: {
              worklogRevision: { select: { id: true, title: true, contentHash: true } },
            },
          },
        },
      },
      revisions: {
        orderBy: { revisionNo: "desc" as const },
        select: {
          id: true,
          revisionNo: true,
          status: true,
          decisionComment: true,
          createdAt: true,
        },
      },
      certificate: true,
    },
  },
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

async function getCollaboration(id: string) {
  const collaboration = await prisma.terraqoCollaboration.findUnique({
    where: { id },
    include: collaborationInclude,
  });
  if (!collaboration)
    throw new TerraqoMessagingError("Colaboración no disponible.", 404);
  return collaboration;
}

export async function listCollaborations(input: {
  userId: string;
  workspaceId?: string;
}) {
  return prisma.terraqoCollaboration.findMany({
    where: input.workspaceId
      ? { workspaceId: input.workspaceId }
      : { professionalUserId: input.userId },
    include: collaborationInclude,
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
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
    return getCollaboration(collaborationId);
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
        return getCollaboration(replay.collaborationId);
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
      if (
        replay.operationFingerprint !== operationFingerprint ||
        replay.collaborationId !== input.collaborationId
      )
        throw new TerraqoMessagingError(
          "La clave de reintento ya fue usada con otra revisión.",
          409,
        );
      return replay.collaborationId;
    }

    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM icc."TerraqoCollaboration" WHERE id=${input.collaborationId} FOR UPDATE`,
    );
    const collaboration = await tx.terraqoCollaboration.findFirst({
      where: { id: input.collaborationId, workspaceId: input.workspaceId },
      include: {
        proposals: {
          orderBy: { revisionNo: "desc" },
          take: 1,
          select: { revisionNo: true },
        },
      },
    });
    if (!collaboration)
      throw new TerraqoMessagingError("Colaboración no disponible.", 404);
    if (collaboration.status === "CLOSED" || collaboration.status === "CANCELLED")
      throw new TerraqoMessagingError(
        "La colaboración cerrada o cancelada no admite nuevas propuestas.",
        409,
      );
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
  return getCollaboration(collaborationId);
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
      Prisma.sql`SELECT id FROM icc."TerraqoCollaboration" WHERE id=${input.collaborationId} FOR UPDATE`,
    );
    const collaboration = await tx.terraqoCollaboration.findFirst({
      where: {
        id: input.collaborationId,
        professionalUserId: input.userId,
      },
      include: {
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

    const now = new Date();
    if (input.payload.action === "ACCEPT") {
      await tx.terraqoCollaborationAcceptance.create({
        data: {
          proposalId: proposal.id,
          party: "PROFESSIONAL",
          actorId: input.userId,
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
  return getCollaboration(collaborationId);
}
