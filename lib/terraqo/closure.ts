import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { terraqoClosureReferenceSourceSchema } from "@/lib/validations/terraqo";
import { prisma } from "@/lib/prisma";
import { isWorkspaceResourceReplay } from "@/lib/terraqo/idempotency-scope";
import type {
  terraqoClosureDecisionSchema,
  terraqoClosureDraftSchema,
  terraqoClosureSubmitSchema,
} from "@/lib/validations/terraqo";
import { TerraqoMessagingError } from "@/lib/terraqo/messaging";
import { closureProjectionInclude, projectAuthorizedClosure, type ClosureAudience } from "./closure-projection";
import {
  closureReferenceInclude,
  loadAuthorizedClosureReferenceSources,
  loadAuthorizedClosureReferences, resolveClosureReferenceSources, assertClosureReferenceWorkspaceActor,
} from "./closure-reference-access";

type ClosureDraft = z.infer<typeof terraqoClosureDraftSchema>;
type ClosureSubmit = z.infer<typeof terraqoClosureSubmitSchema>;
type ClosureDecision = z.infer<typeof terraqoClosureDecisionSchema>;

// Save/submit perform the same live authorization reads as acceptance. Keep a
// bounded budget for hosted database latency without moving policy checks out
// of the serializable transaction or retrying an ambiguous timeout blindly.
const closureTransactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 20_000,
};

function assertDraftFollowsAcceptedScope(
  collaboration: {
    acceptedRevisionNo: number | null;
    acceptedAt: Date | null;
    proposals: { revisionNo: number; decidedAt: Date | null }[];
  },
  createdAt: Date,
) {
  const proposal = collaboration.proposals[0];
  // No proposal snapshot exists on a closure revision. This is a conservative
  // ordering check, not an invented binding. Unknown/tied legacy dates fail closed.
  // New acceptance and draft dates use the DB clock while holding the same parent lock.
  // Historical application-clock skew cannot be reconstructed without a stored
  // proposal binding; timestamps alone cannot prove which scope an old draft used.
  if (!proposal || proposal.revisionNo !== collaboration.acceptedRevisionNo ||
      !proposal.decidedAt || !collaboration.acceptedAt ||
      proposal.decidedAt.getTime() !== collaboration.acceptedAt.getTime() ||
      createdAt.getTime() <= collaboration.acceptedAt.getTime())
    throw new TerraqoMessagingError(
      "Guarda una nueva revisión del cierre después de la última aceptación del alcance.", 409,
    );
}

/** Identity, not timestamps, binds a new closure to the scope the editor reviewed.
 * Call only after locking the parent collaboration; committed replay is handled first. */
function assertAcceptedProposalBinding(collaboration: {
  acceptedRevisionNo: number | null;
  professionalUserId: string;
  proposals: { id: string; revisionNo: number; createdById: string; decidedById: string | null;
    acceptances: { party: string; actorId: string }[] }[];
}, expectedId: string) {
  const proposal = collaboration.proposals[0];
  if (!expectedId || !proposal || proposal.id !== expectedId ||
      proposal.revisionNo !== collaboration.acceptedRevisionNo ||
      proposal.decidedById !== collaboration.professionalUserId ||
      !proposal.acceptances.some(item => item.party === "WORKSPACE" && item.actorId === proposal.createdById) ||
      !proposal.acceptances.some(item => item.party === "PROFESSIONAL" && item.actorId === collaboration.professionalUserId))
    throw new TerraqoMessagingError("El alcance aceptado cambió o no tiene ambas confirmaciones. Revisa la propuesta antes de guardar o enviar el cierre.", 409);
  return proposal.id;
}

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

function isRetryableClosureDecisionConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2002" || error.code === "P2034") return true;
  if (error.code !== "P2010") return false;
  const metadata = error.meta as { code?: unknown; message?: unknown } | undefined;
  return metadata?.code === "40001" || (
    typeof metadata?.message === "string" &&
    /could not serialize access/i.test(metadata.message)
  );
}

async function assertReferencesStillAuthorized(
  tx: Prisma.TransactionClient,
  closureRevisionId: string,
  professionalUserId: string,
) {
  const references = await tx.terraqoClosureReference.findMany({
    where: { closureRevisionId },
    include: closureReferenceInclude,
  });
  const authorized = await loadAuthorizedClosureReferences(tx, references, professionalUserId, true);
  if (references.some(reference => !authorized.has(reference.id)))
    throw new TerraqoMessagingError(
      "Una referencia dejó de estar autorizada. Revisa el cierre antes de enviarlo.",
      409,
    );
}

async function readClosureResponse(where: Prisma.TerraqoCollaborationClosureWhereInput, audience: ClosureAudience) {
  // Replays acknowledge committed operations, but never return their stale source
  // payload. Re-read after commit using the same live policy and audience DTO as GET.
  const closure = await prisma.terraqoCollaborationClosure.findFirstOrThrow({
    where,
    include: {
      ...closureProjectionInclude,
      collaboration: { select: { professionalUserId: true } },
    },
  });
  const projected = await projectAuthorizedClosure(prisma, closure, audience, closure.collaboration.professionalUserId);
  if (!projected) throw new TerraqoMessagingError("Cierre no disponible.", 404);
  return projected;
}

export async function saveClosureDraft(input: {
  userId: string;
  workspaceId: string;
  collaborationId: string;
  operationKey: string;
  payload: ClosureDraft;
}) {
  // Validate descriptor contracts again for non-HTTP callers. Keep legacy payload
  // identity byte-for-byte; only the new descriptor path has canonical ordering.
  if (input.payload.referenceSources !== undefined && input.payload.referenceRevisionIds !== undefined)
    throw new TerraqoMessagingError("No mezcles referencias legacy y descriptores.", 400);
  const choices = input.payload.referenceSources === undefined ? undefined :
    z.array(terraqoClosureReferenceSourceSchema).max(30).parse(input.payload.referenceSources)
      .sort((a, b) => a.worklogRevisionId.localeCompare(b.worklogRevisionId));
  const ids = choices?.map(item => item.worklogRevisionId) ?? input.payload.referenceRevisionIds ?? [];
  if (ids.length > 30 || new Set(ids).size !== ids.length)
    throw new TerraqoMessagingError("Referencias inválidas o repetidas.", 400);
  const operationFingerprint = closureOperationFingerprint(choices ? { ...input.payload, referenceSources: choices } : input.payload);
  const closureId = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM icc."TerraqoCollaboration" WHERE id=${input.collaborationId} AND "workspaceId"=${input.workspaceId} FOR UPDATE`,
    );
    await assertClosureReferenceWorkspaceActor(tx, input);
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

    const collaboration = await tx.terraqoCollaboration.findFirst({
      where: {
        id: input.collaborationId,
        workspaceId: input.workspaceId,
        acceptedRevisionNo: { not: null },
        status: { in: ["ACCEPTED", "IN_PROGRESS", "CHANGES_REQUESTED"] },
      },
      include: {
        closure: { include: { currentRevision: true } },
        proposals: { where: { status: "ACCEPTED" }, orderBy: { revisionNo: "desc" }, take: 1, include: { acceptances: true } },
      },
    });
    if (!collaboration)
      throw new TerraqoMessagingError(
        "Solo una colaboración aceptada puede preparar un cierre.",
        409,
      );

    // Omitted identity remains the explicitly legacy private path. Never invent
    // a binding for old clients/replays; sharing must reject unbound certificates.
    const acceptedProposalId = input.payload.expectedAcceptedProposalId === undefined ? null :
      assertAcceptedProposalBinding(collaboration, input.payload.expectedAcceptedProposalId);
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

    const legacy = choices === undefined ? await loadAuthorizedClosureReferenceSources(tx, ids, collaboration.professionalUserId) : [];
    const descriptors = choices ?? legacy.map(source => ({ worklogRevisionId: source.id, accessKind: "PUBLIC_CV" as const, accessReferenceId: source.worklogId }));
    const authorizedRevisions = await resolveClosureReferenceSources(tx, descriptors, collaboration.professionalUserId, true);
    if (authorizedRevisions.size !== ids.length)
      throw new TerraqoMessagingError("Solo puedes citar versiones públicas vigentes del profesional.", 403);

    if (closure?.currentRevision && closure.currentRevision.status !== "ACCEPTED")
      await tx.terraqoClosureRevision.update({
        where: { id: closure.currentRevision.id },
        data: { status: "SUPERSEDED" },
      });

    const targetClosure = closure || await tx.terraqoCollaborationClosure.create({
      data: { collaborationId: collaboration.id },
    });
    const revisionNo = closure ? closure.version + 1 : 1;
    const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const revision = await tx.terraqoClosureRevision.create({
      data: {
        closureId: targetClosure.id,
        acceptedProposalId,
        revisionNo,
        contribution: input.payload.contribution,
        deliverables: input.payload.deliverables,
        result: input.payload.result,
        authorizedExcerpt: input.payload.authorizedExcerpt || null,
        createdById: input.userId,
        operationKey: input.operationKey,
        operationFingerprint,
        createdAt: clock.now,
        references: {
          create: [...authorizedRevisions.values()].map(({ snapshot }) => ({
            worklogRevisionId: snapshot.revisionId,
            accessSnapshot: { ...snapshot, ...(choices === undefined ? { allowedFields: ["title"] } : {}) },
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
  }, closureTransactionOptions);

  return readClosureResponse({
    id: closureId,
    collaborationId: input.collaborationId,
    collaboration: { workspaceId: input.workspaceId },
  }, "workspace");
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
    // Lock order across save/submit/decision/scope mutation: collaboration, revision.
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM icc."TerraqoCollaboration" WHERE id=${input.collaborationId} AND "workspaceId"=${input.workspaceId} FOR UPDATE`,
    );
    await assertClosureReferenceWorkspaceActor(tx, input);
    const closure = await tx.terraqoCollaborationClosure.findFirst({
      where: {
        collaborationId: input.collaborationId,
        collaboration: { workspaceId: input.workspaceId },
      },
      include: {
        collaboration: { include: {
          proposals: { where: { status: "ACCEPTED" }, orderBy: { revisionNo: "desc" }, take: 1, include: { acceptances: true } },
        } },
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
    if (!["ACCEPTED", "IN_PROGRESS", "CHANGES_REQUESTED"].includes(closure.collaboration.status))
      throw new TerraqoMessagingError("La colaboración no admite enviar este cierre.", 409);
    if (revision.acceptedProposalId) assertAcceptedProposalBinding(closure.collaboration, revision.acceptedProposalId);
    else assertDraftFollowsAcceptedScope(closure.collaboration, revision.createdAt);
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
  }, closureTransactionOptions);
  return readClosureResponse({ id: closureId, collaborationId: input.collaborationId,
    collaboration: { workspaceId: input.workspaceId } }, "workspace");
}

export async function decideClosure(input: {
  userId: string;
  closureId: string;
  operationKey: string;
  payload: ClosureDecision;
}) {
  const decisionFingerprint = closureOperationFingerprint(input.payload);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const closureId = await prisma.$transaction(async (tx) => {
    // Resolve and lock the authorized parent without reading any proposal first.
    await tx.$queryRaw(
      Prisma.sql`SELECT c.id FROM icc."TerraqoCollaboration" c
        JOIN icc."TerraqoCollaborationClosure" cl ON cl."collaborationId"=c.id
        WHERE cl.id=${input.closureId} AND c."professionalUserId"=${input.userId}
        FOR UPDATE OF c`,
    );
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
              include: { acceptances: true },
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
        return closure.id;
      throw new TerraqoMessagingError("El cierre ya fue resuelto o sustituido.", 409);
    }
    if (revision.revisionNo !== input.payload.expectedRevisionNo)
      throw new TerraqoMessagingError("Existe una revisión de cierre más reciente.", 409);

    const state = closureDecisionState(input.payload.action);
    if (closure.collaboration.status === "CLOSED" || closure.collaboration.status === "CANCELLED")
      throw new TerraqoMessagingError("La colaboración cerrada o cancelada no admite decisiones nuevas.", 409);
    if (state.emitsCertificate) {
      if (closure.collaboration.status !== "CLOSURE_PROPOSED")
        throw new TerraqoMessagingError("La colaboración no tiene un cierre vigente en revisión.", 409);
      if (revision.acceptedProposalId) assertAcceptedProposalBinding(closure.collaboration, revision.acceptedProposalId);
      else assertDraftFollowsAcceptedScope(closure.collaboration, revision.createdAt);
    }
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
    return closure.id;
      }, closureTransactionOptions);
      return readClosureResponse({ id: closureId,
        collaboration: { professionalUserId: input.userId } }, "professional");
    } catch (error) {
      if (isRetryableClosureDecisionConflict(error) && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new TerraqoMessagingError("No se pudo completar la decisión concurrente del cierre.", 503);
}
