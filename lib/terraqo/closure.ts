import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isWorkspaceResourceReplay } from "@/lib/terraqo/idempotency-scope";
import type {
  terraqoClosureDecisionSchema,
  terraqoClosureDraftSchema,
  terraqoClosureSubmitSchema,
} from "@/lib/validations/terraqo";
import { TerraqoMessagingError } from "@/lib/terraqo/messaging";

type ClosureDraft = z.infer<typeof terraqoClosureDraftSchema>;
type ClosureSubmit = z.infer<typeof terraqoClosureSubmitSchema>;
type ClosureDecision = z.infer<typeof terraqoClosureDecisionSchema>;

export function closureOperationFingerprint(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function closureDecisionState(action: ClosureDecision["action"]) {
  if (action === "ACCEPT")
    return { revisionStatus: "ACCEPTED" as const, collaborationStatus: "CLOSED" as const, emitsCertificate: true };
  if (action === "REQUEST_CHANGES")
    return { revisionStatus: "CHANGES_REQUESTED" as const, collaborationStatus: "CHANGES_REQUESTED" as const, emitsCertificate: false };
  return { revisionStatus: "DECLINED" as const, collaborationStatus: "CHANGES_REQUESTED" as const, emitsCertificate: false };
}

async function assertReferencesStillAuthorized(
  tx: Prisma.TransactionClient,
  closureRevisionId: string,
  professionalUserId: string,
) {
  const references = await tx.terraqoClosureReference.findMany({
    where: { closureRevisionId },
    select: { worklogRevisionId: true },
  });
  if (!references.length) return;
  const active = await tx.terraqoWorklogRevision.count({
    where: {
      id: { in: references.map((reference) => reference.worklogRevisionId) },
      currentFor: {
        is: {
          visibility: "PUBLIC",
          lifecycle: "PUBLISHED",
          deletedAt: null,
          professionalProfile: { userId: professionalUserId },
        },
      },
    },
  });
  if (active !== references.length)
    throw new TerraqoMessagingError(
      "Una referencia dejó de estar autorizada. Revisa el cierre antes de enviarlo.",
      409,
    );
}

export async function saveClosureDraft(input: {
  userId: string;
  workspaceId: string;
  collaborationId: string;
  operationKey: string;
  payload: ClosureDraft;
}) {
  const operationFingerprint = closureOperationFingerprint(input.payload);
  const closureId = await prisma.$transaction(async (tx) => {
    const replay = await tx.terraqoClosureRevision.findUnique({
      where: {
        createdById_operationKey: {
          createdById: input.userId,
          operationKey: input.operationKey,
        },
      },
      select: {
        closureId: true,
        operationFingerprint: true,
        closure: {
          select: {
            collaborationId: true,
            collaboration: { select: { workspaceId: true } },
          },
        },
      },
    });
    if (replay) {
      if (!isWorkspaceResourceReplay({
        workspaceId: replay.closure.collaboration.workspaceId,
        resourceId: replay.closure.collaborationId,
        operationFingerprint: replay.operationFingerprint,
      }, {
        workspaceId: input.workspaceId,
        resourceId: input.collaborationId,
        operationFingerprint,
      }))
        throw new TerraqoMessagingError(
          "La clave de reintento ya fue usada con otro cierre.",
          409,
        );
      return replay.closureId;
    }

    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM icc."TerraqoCollaboration" WHERE id=${input.collaborationId} FOR UPDATE`,
    );
    const collaboration = await tx.terraqoCollaboration.findFirst({
      where: {
        id: input.collaborationId,
        workspaceId: input.workspaceId,
        acceptedRevisionNo: { not: null },
        status: { in: ["ACCEPTED", "IN_PROGRESS", "CHANGES_REQUESTED"] },
      },
      include: {
        closure: { include: { currentRevision: true } },
      },
    });
    if (!collaboration)
      throw new TerraqoMessagingError(
        "Solo una colaboración aceptada puede preparar un cierre.",
        409,
      );

    const closure = collaboration.closure;
    if (closure && input.payload.expectedVersion !== closure.version)
      throw new TerraqoMessagingError(
        "El borrador de cierre cambió en otra sesión.",
        409,
      );
    if (!closure && input.payload.expectedVersion != null)
      throw new TerraqoMessagingError(
        "El cierre aún no tiene una versión previa.",
        409,
      );
    if (closure?.currentRevision?.status === "SUBMITTED")
      throw new TerraqoMessagingError(
        "El cierre enviado debe resolverse antes de crear otra revisión.",
        409,
      );

    const uniqueReferenceIds = [...new Set(input.payload.referenceRevisionIds)];
    const authorizedRevisions = uniqueReferenceIds.length
      ? await tx.terraqoWorklogRevision.findMany({
          where: {
            id: { in: uniqueReferenceIds },
            currentFor: {
              is: {
                visibility: "PUBLIC",
                lifecycle: "PUBLISHED",
                deletedAt: null,
                professionalProfile: { userId: collaboration.professionalUserId },
              },
            },
          },
          select: { id: true, title: true, contentHash: true },
        })
      : [];
    if (authorizedRevisions.length !== uniqueReferenceIds.length)
      throw new TerraqoMessagingError(
        "Solo puedes citar versiones públicas vigentes del profesional.",
        403,
      );

    if (closure?.currentRevision && closure.currentRevision.status !== "ACCEPTED")
      await tx.terraqoClosureRevision.update({
        where: { id: closure.currentRevision.id },
        data: { status: "SUPERSEDED" },
      });

    const targetClosure = closure || await tx.terraqoCollaborationClosure.create({
      data: { collaborationId: collaboration.id },
    });
    const revisionNo = closure ? closure.version + 1 : 1;
    const revision = await tx.terraqoClosureRevision.create({
      data: {
        closureId: targetClosure.id,
        revisionNo,
        contribution: input.payload.contribution,
        deliverables: input.payload.deliverables,
        result: input.payload.result,
        authorizedExcerpt: input.payload.authorizedExcerpt || null,
        createdById: input.userId,
        operationKey: input.operationKey,
        operationFingerprint,
        references: {
          create: authorizedRevisions.map((source) => ({
            worklogRevisionId: source.id,
            accessSnapshot: {
              kind: "PUBLIC_CV",
              revisionId: source.id,
              title: source.title,
              contentHash: source.contentHash,
              capturedAt: new Date().toISOString(),
            },
          })),
        },
      },
      select: { id: true },
    });
    await tx.terraqoCollaborationClosure.update({
      where: { id: targetClosure.id },
      data: {
        currentRevisionId: revision.id,
        ...(closure ? { version: { increment: 1 } } : {}),
      },
    });
    await tx.terraqoCollaboration.update({
      where: { id: collaboration.id },
      data: { status: "IN_PROGRESS", version: { increment: 1 } },
    });
    return targetClosure.id;
  }, { isolationLevel: "Serializable" });

  return prisma.terraqoCollaborationClosure.findFirstOrThrow({
    where: {
      id: closureId,
      collaborationId: input.collaborationId,
      collaboration: { workspaceId: input.workspaceId },
    },
    include: { currentRevision: { include: { references: true } }, certificate: true },
  });
}

export async function submitClosure(input: {
  userId: string;
  workspaceId: string;
  collaborationId: string;
  operationKey: string;
  payload: ClosureSubmit;
}) {
  const submitFingerprint = closureOperationFingerprint(input.payload);
  const closureId = await prisma.$transaction(async (tx) => {
    const closure = await tx.terraqoCollaborationClosure.findFirst({
      where: {
        collaborationId: input.collaborationId,
        collaboration: { workspaceId: input.workspaceId },
      },
      include: {
        collaboration: { select: { professionalUserId: true } },
        currentRevision: true,
      },
    });
    if (!closure?.currentRevision)
      throw new TerraqoMessagingError("No existe un borrador de cierre.", 404);
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM icc."TerraqoClosureRevision" WHERE id=${closure.currentRevision.id} FOR UPDATE`,
    );
    const revision = await tx.terraqoClosureRevision.findUniqueOrThrow({
      where: { id: closure.currentRevision.id },
    });
    if (revision.status === "SUBMITTED") {
      if (
        revision.submitOperationKey === input.operationKey &&
        revision.submitFingerprint === submitFingerprint
      )
        return closure.id;
      throw new TerraqoMessagingError("El cierre ya fue enviado.", 409);
    }
    if (revision.status !== "DRAFT" || revision.revisionNo !== input.payload.expectedRevisionNo)
      throw new TerraqoMessagingError(
        "El cierre cambió o ya no es un borrador enviable.",
        409,
      );
    await assertReferencesStillAuthorized(
      tx,
      revision.id,
      closure.collaboration.professionalUserId,
    );
    await tx.terraqoClosureRevision.update({
      where: { id: revision.id },
      data: {
        status: "SUBMITTED",
        submitOperationKey: input.operationKey,
        submitFingerprint,
        submittedAt: new Date(),
      },
    });
    await tx.terraqoCollaboration.update({
      where: { id: input.collaborationId },
      data: { status: "CLOSURE_PROPOSED", version: { increment: 1 } },
    });
    return closure.id;
  }, { isolationLevel: "Serializable" });
  return prisma.terraqoCollaborationClosure.findUniqueOrThrow({
    where: { id: closureId },
    include: { currentRevision: true, certificate: true },
  });
}

export async function decideClosure(input: {
  userId: string;
  closureId: string;
  operationKey: string;
  payload: ClosureDecision;
}) {
  const decisionFingerprint = closureOperationFingerprint(input.payload);
  return prisma.$transaction(async (tx) => {
    const closure = await tx.terraqoCollaborationClosure.findFirst({
      where: {
        id: input.closureId,
        collaboration: { professionalUserId: input.userId },
      },
      include: {
        collaboration: {
          include: {
            workspace: { select: { name: true } },
            professional: { select: { name: true } },
            proposals: {
              where: { status: "ACCEPTED" },
              orderBy: { revisionNo: "desc" },
              take: 1,
            },
          },
        },
        currentRevision: true,
        certificate: true,
      },
    });
    if (!closure?.currentRevision)
      throw new TerraqoMessagingError("Cierre no disponible.", 404);
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM icc."TerraqoClosureRevision" WHERE id=${closure.currentRevision.id} FOR UPDATE`,
    );
    const revision = await tx.terraqoClosureRevision.findUniqueOrThrow({
      where: { id: closure.currentRevision.id },
    });
    if (revision.status !== "SUBMITTED") {
      if (
        revision.revisionNo === input.payload.expectedRevisionNo &&
        revision.decisionOperationKey === input.operationKey &&
        revision.decisionFingerprint === decisionFingerprint
      )
        return closure;
      throw new TerraqoMessagingError("El cierre ya fue resuelto o sustituido.", 409);
    }
    if (revision.revisionNo !== input.payload.expectedRevisionNo)
      throw new TerraqoMessagingError("Existe una revisión de cierre más reciente.", 409);

    const state = closureDecisionState(input.payload.action);
    const now = new Date();
    await tx.terraqoClosureRevision.update({
      where: { id: revision.id },
      data: {
        status: state.revisionStatus,
        decidedById: input.userId,
        decisionComment: input.payload.comment || null,
        decisionOperationKey: input.operationKey,
        decisionFingerprint,
        decidedAt: now,
      },
    });
    if (state.emitsCertificate) {
      await assertReferencesStillAuthorized(
        tx,
        revision.id,
        closure.collaboration.professionalUserId,
      );
      const proposal = closure.collaboration.proposals[0];
      if (!proposal || proposal.revisionNo !== closure.collaboration.acceptedRevisionNo)
        throw new TerraqoMessagingError(
          "No se encontró la versión aceptada del alcance.",
          409,
        );
      await tx.terraqoCollaborationCertificate.create({
        data: {
          closureId: closure.id,
          closureRevisionId: revision.id,
          workspaceName: closure.collaboration.workspace.name,
          professionalName: closure.collaboration.professional.name || "Profesional Terraqo",
          roleTitle: proposal.roleTitle,
          scope: proposal.scope,
          proposalRevisionNo: proposal.revisionNo,
          closureRevisionNo: revision.revisionNo,
          contribution: revision.contribution,
          deliverables: revision.deliverables,
          result: revision.result,
          authorizedExcerpt: revision.authorizedExcerpt,
          issuedById: input.userId,
        },
      });
      await tx.terraqoConversationContext.upsert({
        where: {
          conversationId_kind_referenceId: {
            conversationId: closure.collaboration.conversationId,
            kind: "CLOSURE",
            referenceId: revision.id,
          },
        },
        create: {
          conversationId: closure.collaboration.conversationId,
          kind: "CLOSURE",
          referenceId: revision.id,
          labelSnapshot: `Constancia privada · cierre v${revision.revisionNo}`,
          createdById: input.userId,
        },
        update: {},
      });
    }
    await tx.terraqoCollaboration.update({
      where: { id: closure.collaborationId },
      data: { status: state.collaborationStatus, version: { increment: 1 } },
    });
    return tx.terraqoCollaborationClosure.findUniqueOrThrow({
      where: { id: closure.id },
      include: { currentRevision: true, certificate: true },
    });
  }, { isolationLevel: "Serializable" });
}
