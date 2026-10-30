import { createHash } from "node:crypto";
import { Prisma, type TerraqoEvaluationSourceAccessKind } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isWorkspaceReplay } from "@/lib/terraqo/idempotency-scope";
import { constrainAllowedFields, type EvaluationSourceFieldPolicy } from "@/lib/terraqo/evaluation-source-policy";
import type {
  terraqoEvaluationAssessmentSchema,
  terraqoEvaluationDossierCreateSchema,
  terraqoEvaluationNoteSchema,
  terraqoEvaluationQuestionSchema,
  terraqoWorkNeedCreateSchema,
  terraqoWorkNeedRevisionSchema,
} from "@/lib/validations/terraqo";

type NeedCreate = z.infer<typeof terraqoWorkNeedCreateSchema>;
type NeedRevision = z.infer<typeof terraqoWorkNeedRevisionSchema>;
type DossierCreate = z.infer<typeof terraqoEvaluationDossierCreateSchema>;
type AssessmentInput = z.infer<typeof terraqoEvaluationAssessmentSchema>;
type NoteInput = z.infer<typeof terraqoEvaluationNoteSchema>;
type QuestionInput = z.infer<typeof terraqoEvaluationQuestionSchema>;

export class DiscoveryNeedsError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "DiscoveryNeedsError";
  }
}

const needInclude = {
  currentRevision: {
    include: { requirements: { orderBy: [{ priority: "asc" }, { sortOrder: "asc" }] } },
  },
} satisfies Prisma.TerraqoWorkNeedInclude;

const STOP_WORDS = new Set([
  "para", "como", "con", "del", "las", "los", "una", "uno", "por", "que", "se", "sin", "sobre",
  "trabajo", "servicio", "requiere", "necesita", "debe", "desde", "hasta", "entre", "esta", "este",
]);

export function normalizeDiscoveryTerms(values: Array<string | null | undefined>) {
  return [...new Set(values
    .flatMap((value) => (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-PE").split(/[^a-z0-9]+/))
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)))];
}

export function explainDiscoveryMatch(input: {
  need: {
    title: string;
    problem: string;
    activities: string[];
    requiredTools: string[];
    locationLabel?: string | null;
    requirements: Array<{ label: string; priority: "REQUIRED" | "DESIRED" }>;
  };
  evidence: {
    title: string;
    summary: string;
    outcome?: string | null;
    responsibilities: string[];
    methods: string[];
    tools: string[];
    skills: string[];
    locationLabel?: string | null;
  };
}) {
  const evidenceTerms = new Set(normalizeDiscoveryTerms([
    input.evidence.title,
    input.evidence.summary,
    input.evidence.outcome,
    ...input.evidence.responsibilities,
    ...input.evidence.methods,
    ...input.evidence.tools,
    ...input.evidence.skills,
    input.evidence.locationLabel,
  ]));
  const matches = (values: string[]) => normalizeDiscoveryTerms(values).filter((term) => evidenceTerms.has(term));
  const required = input.need.requirements
    .filter((requirement) => requirement.priority === "REQUIRED")
    .map((requirement) => ({ label: requirement.label, terms: matches([requirement.label]) }))
    .filter((requirement) => requirement.terms.length > 0);
  const desirable = input.need.requirements
    .filter((requirement) => requirement.priority === "DESIRED")
    .map((requirement) => ({ label: requirement.label, terms: matches([requirement.label]) }))
    .filter((requirement) => requirement.terms.length > 0);
  const activityTerms = matches([input.need.title, input.need.problem, ...input.need.activities]);
  const toolTerms = matches(input.need.requiredTools);
  const locationTerms = matches([input.need.locationLabel ?? ""]);

  return {
    required,
    desirable,
    activityTerms,
    toolTerms,
    locationTerms,
    hasEvidence: required.length + desirable.length + activityTerms.length + toolTerms.length + locationTerms.length > 0,
  };
}

type DiscoveryEvidenceFields = {
  title: string;
  summary: string;
  outcome: string | null;
  responsibilities: string[];
  methods: string[];
  tools: string[];
  skills: string[];
  locationLabel: string | null;
};

export function projectDiscoveryEvidenceFields(
  evidence: DiscoveryEvidenceFields,
  allowedFields: string[] | null,
) {
  const allowed = allowedFields === null ? null : new Set(allowedFields);
  const canRead = (field: string) => allowed === null || allowed.has(field);
  return {
    title: canRead("title") ? evidence.title : "",
    summary: canRead("summary") ? evidence.summary : "",
    outcome: canRead("outcome") ? evidence.outcome : null,
    responsibilities: canRead("responsibilities") ? evidence.responsibilities : [],
    methods: canRead("methods") ? evidence.methods : [],
    tools: canRead("tools") ? evidence.tools : [],
    skills: allowed === null ? evidence.skills : [],
    locationLabel: canRead("locationLabel") ? evidence.locationLabel : null,
  };
}

function fingerprint(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function criterionKey(input: { requirementId?: string; criterionLabel: string }) {
  if (input.requirementId) return `requirement:${input.requirementId}`;
  return `custom:${normalizeDiscoveryTerms([input.criterionLabel]).join("-") || fingerprint(input.criterionLabel).slice(0, 16)}`;
}

function revisionContentHash(payload: NeedCreate) {
  return fingerprint({
    ...payload,
    activities: [...payload.activities],
    requiredTools: [...payload.requiredTools],
    requirements: payload.requirements.map((requirement) => ({ ...requirement })),
  });
}

function revisionData(payload: NeedCreate, userId: string, revisionNo: number, operationKey: string) {
  return {
    revisionNo,
    title: payload.title,
    problem: payload.problem,
    activities: payload.activities,
    context: payload.context,
    locationLabel: payload.locationLabel,
    availableFrom: payload.availableFrom ? new Date(payload.availableFrom) : null,
    availableUntil: payload.availableUntil ? new Date(payload.availableUntil) : null,
    requiredTools: payload.requiredTools,
    endorsementNeeded: payload.endorsementNeeded,
    contentHash: revisionContentHash(payload),
    createdById: userId,
    operationKey,
    operationFingerprint: fingerprint(payload),
    requirements: {
      create: payload.requirements.map((requirement, sortOrder) => ({ ...requirement, sortOrder })),
    },
  };
}

export async function listWorkspaceNeeds(workspaceId: string) {
  return prisma.terraqoWorkNeed.findMany({
    where: { workspaceId, lifecycle: { not: "ARCHIVED" } },
    include: needInclude,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
}

export async function createWorkspaceNeed(input: {
  userId: string;
  workspaceId: string;
  operationKey: string;
  payload: NeedCreate;
  monthlyLimit?: number;
}) {
  const operationFingerprint = fingerprint(input.payload);
  const replay = async () => {
    const existing = await prisma.terraqoWorkNeed.findUnique({
      where: { createdById_operationKey: { createdById: input.userId, operationKey: input.operationKey } },
      include: needInclude,
    });
    if (!existing) return null;
    if (!isWorkspaceReplay(existing, { workspaceId: input.workspaceId, operationFingerprint }))
      throw new DiscoveryNeedsError("La clave de reintento ya fue usada con otra necesidad.", 409);
    return existing;
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoWorkspace" WHERE id=${input.workspaceId} FOR UPDATE`);
        const existing = await tx.terraqoWorkNeed.findUnique({
          where: { createdById_operationKey: { createdById: input.userId, operationKey: input.operationKey } },
          include: needInclude,
        });
        if (existing) {
          if (!isWorkspaceReplay(existing, { workspaceId: input.workspaceId, operationFingerprint }))
            throw new DiscoveryNeedsError("La clave de reintento ya fue usada con otra necesidad.", 409);
          return existing;
        }
        if (input.monthlyLimit) {
          const now = new Date();
          const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
          const used = await tx.terraqoWorkNeed.count({ where: { workspaceId: input.workspaceId, createdAt: { gte: since } } });
          if (used >= input.monthlyLimit) throw new DiscoveryNeedsError("Alcanzaste el límite operativo del piloto. El historial permanece disponible.", 429);
        }
        const need = await tx.terraqoWorkNeed.create({
          data: {
            workspaceId: input.workspaceId,
            createdById: input.userId,
            operationKey: input.operationKey,
            operationFingerprint,
            revisions: { create: revisionData(input.payload, input.userId, 1, input.operationKey) },
          },
          include: { revisions: { select: { id: true, revisionNo: true } } },
        });
        const revision = need.revisions.find((item) => item.revisionNo === 1);
        if (!revision) throw new DiscoveryNeedsError("No se pudo fijar la primera versión.", 500);
        return tx.terraqoWorkNeed.update({
          where: { id: need.id },
          data: { currentRevisionId: revision.id },
          include: needInclude,
        });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034")
      ) {
        const existing = await replay();
        if (existing) return existing;
        if (error.code === "P2034" && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
          continue;
        }
      }
      throw error;
    }
  }
  throw new DiscoveryNeedsError("No se pudo completar la operación concurrente.", 503);
}

export async function reviseWorkspaceNeed(input: {
  userId: string;
  workspaceId: string;
  needId: string;
  operationKey: string;
  payload: NeedRevision;
}) {
  const { expectedVersion, ...content } = input.payload;
  const operationFingerprint = fingerprint(content);
  return prisma.$transaction(async (tx) => {
    const replay = await tx.terraqoWorkNeedRevision.findUnique({
      where: { createdById_operationKey: { createdById: input.userId, operationKey: input.operationKey } },
      select: { needId: true, operationFingerprint: true },
    });
    if (replay) {
      if (replay.operationFingerprint !== operationFingerprint || replay.needId !== input.needId)
        throw new DiscoveryNeedsError("La clave de reintento ya fue usada con otra versión.", 409);
      const replayedNeed = await tx.terraqoWorkNeed.findFirst({
        where: { id: input.needId, workspaceId: input.workspaceId },
        include: needInclude,
      });
      if (!replayedNeed) throw new DiscoveryNeedsError("Necesidad no disponible.", 404);
      return replayedNeed;
    }
    const need = await tx.terraqoWorkNeed.findFirst({
      where: { id: input.needId, workspaceId: input.workspaceId, lifecycle: { not: "ARCHIVED" } },
      select: { id: true },
    });
    if (!need) throw new DiscoveryNeedsError("Necesidad no disponible.", 404);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoWorkNeed" WHERE id=${need.id} FOR UPDATE`);
    const locked = await tx.terraqoWorkNeed.findUnique({ where: { id: need.id }, select: { version: true } });
    if (!locked || locked.version !== expectedVersion)
      throw new DiscoveryNeedsError("La necesidad cambió en otra sesión. Recarga antes de editar.", 409);
    const revision = await tx.terraqoWorkNeedRevision.create({
      data: { needId: need.id, ...revisionData(content, input.userId, locked.version + 1, input.operationKey) },
      select: { id: true },
    });
    return tx.terraqoWorkNeed.update({
      where: { id: need.id },
      data: { currentRevisionId: revision.id, version: { increment: 1 } },
      include: needInclude,
    });
  }, { isolationLevel: "Serializable" });
}

const candidateSelect = {
  id: true,
  title: true,
  summary: true,
  outcome: true,
  responsibilities: true,
  methods: true,
  tools: true,
  worklog: {
    select: {
      id: true,
      visibility: true,
      deletedAt: true,
      lifecycle: true,
      skills: true,
      locationLabel: true,
      occurredAt: true,
      currentRevisionId: true,
      professionalProfile: {
        select: {
          id: true,
          headline: true,
          liveCvEnabled: true,
          user: { select: { name: true, image: true } },
        },
      },
      workCaseLinks: { select: { workCaseId: true }, take: 1 },
    },
  },
  shareItems: {
    where: { collection: { publicProjection: { revokedAt: null }, lifecycle: { not: "ARCHIVED" } } },
    select: {
      id: true,
      allowedFields: true,
      collection: { select: { publicProjection: { select: { id: true } } } },
    },
    orderBy: { id: "asc" },
  },
} satisfies Prisma.TerraqoWorklogRevisionSelect;

export async function discoverEvidenceForNeed(workspaceId: string, needId: string) {
  const need = await prisma.terraqoWorkNeed.findFirst({
    where: { id: needId, workspaceId, lifecycle: { not: "ARCHIVED" } },
    include: needInclude,
  });
  if (!need?.currentRevision) throw new DiscoveryNeedsError("La necesidad no tiene una versión activa.", 409);
  const revision = need.currentRevision;
  const terms = normalizeDiscoveryTerms([
    revision.title,
    revision.problem,
    ...revision.activities,
    ...revision.requiredTools,
    ...revision.requirements.map((requirement) => requirement.label),
  ]).slice(0, 24);
  const textFilters = terms.flatMap((term) => [
    { title: { contains: term, mode: "insensitive" as const } },
    { summary: { contains: term, mode: "insensitive" as const } },
    { outcome: { contains: term, mode: "insensitive" as const } },
  ]);
  const candidates = await prisma.terraqoWorklogRevision.findMany({
    where: {
      worklog: { deletedAt: null, lifecycle: "PUBLISHED", currentRevisionId: { not: null }, professionalProfile: { liveCvEnabled: true } },
      currentFor: { isNot: null },
      OR: [
        { worklog: { visibility: "PUBLIC" } },
        { shareItems: { some: { collection: { publicProjection: { revokedAt: null }, lifecycle: { not: "ARCHIVED" } } } } },
      ],
      ...(textFilters.length ? { AND: [{ OR: textFilters }] } : {}),
    },
    select: candidateSelect,
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const seenWork = new Set<string>();
  return candidates.flatMap((candidate) => {
    const workKey = `${candidate.worklog.professionalProfile.id}:${candidate.worklog.workCaseLinks[0]?.workCaseId ?? candidate.worklog.id}`;
    const exposures = candidate.worklog.visibility === "PUBLIC"
      ? [{ accessKind: "PUBLIC_CV" as const, accessReferenceId: candidate.worklog.id, allowedFields: null }]
      : candidate.shareItems.flatMap((item) => item.collection.publicProjection
        ? [{
            accessKind: "PUBLIC_SELECTION" as const,
            accessReferenceId: item.collection.publicProjection.id,
            allowedFields: item.allowedFields,
          }]
        : []);

    return exposures.flatMap((exposure) => {
      if (seenWork.has(workKey)) return [];
      const visible = projectDiscoveryEvidenceFields({
        title: candidate.title,
        summary: candidate.summary,
        outcome: candidate.outcome,
        responsibilities: candidate.responsibilities,
        methods: candidate.methods,
        tools: candidate.tools,
        skills: candidate.worklog.skills,
        locationLabel: candidate.worklog.locationLabel,
      }, exposure.allowedFields);
      const reasons = explainDiscoveryMatch({ need: revision, evidence: visible });
      if (!reasons.hasEvidence) return [];
      seenWork.add(workKey);
      const allowed = exposure.allowedFields === null ? null : new Set(exposure.allowedFields);
      return [{
        revisionId: candidate.id,
        worklogId: candidate.worklog.id,
        professionalProfileId: candidate.worklog.professionalProfile.id,
        professionalName: candidate.worklog.professionalProfile.user.name ?? "Profesional Terraqo",
        professionalImage: candidate.worklog.professionalProfile.user.image,
        headline: candidate.worklog.professionalProfile.headline,
        ...(allowed === null || allowed.has("title") ? { title: candidate.title } : {}),
        ...(allowed === null || allowed.has("summary") ? { summary: candidate.summary } : {}),
        ...(allowed === null || allowed.has("occurredAt") ? { occurredAt: candidate.worklog.occurredAt } : {}),
        ...(allowed === null || allowed.has("locationLabel") ? { locationLabel: candidate.worklog.locationLabel } : {}),
        accessKind: exposure.accessKind,
        accessReferenceId: exposure.accessReferenceId,
        reasons,
      }];
    });
  }).sort((left, right) => {
    const leftRequired = left.reasons.required.length;
    const rightRequired = right.reasons.required.length;
    if (leftRequired !== rightRequired) return rightRequired - leftRequired;
    const leftTotal = left.reasons.activityTerms.length + left.reasons.toolTerms.length + left.reasons.desirable.length;
    const rightTotal = right.reasons.activityTerms.length + right.reasons.toolTerms.length + right.reasons.desirable.length;
    return rightTotal - leftTotal || (right.occurredAt?.getTime() ?? 0) - (left.occurredAt?.getTime() ?? 0);
  }).slice(0, 80);
}

async function resolveSourceAccess(tx: Prisma.TransactionClient, actorId: string, revisionId: string) {
  const revision = await tx.terraqoWorklogRevision.findUnique({
    where: { id: revisionId },
    select: {
      id: true,
      contentHash: true,
      worklog: { select: { id: true, visibility: true, deletedAt: true, lifecycle: true, currentRevisionId: true, professionalProfile: { select: { liveCvEnabled: true } } } },
      shareItems: {
        where: { collection: { lifecycle: { not: "ARCHIVED" } } },
        select: {
          allowedFields: true,
          collection: {
            select: {
              publicProjection: { select: { id: true, revokedAt: true } },
              grants: {
                where: { subjectUserId: actorId, lifecycle: "ACTIVE", expiresAt: { gt: new Date() }, scopes: { has: "VIEW_COLLECTION" } },
                select: { id: true, expiresAt: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });
  if (!revision || revision.worklog.deletedAt || revision.worklog.lifecycle !== "PUBLISHED" || revision.worklog.currentRevisionId !== revision.id)
    throw new DiscoveryNeedsError("La evidencia seleccionada ya no está vigente.", 409);
  let accessKind: TerraqoEvaluationSourceAccessKind | null = null;
  let accessReferenceId: string | null = null;
  let allowedFields: EvaluationSourceFieldPolicy = null;
  const privateItem = revision.shareItems.find((item) => item.collection.grants.length > 0);
  const publicItem = revision.shareItems.find((item) => item.collection.publicProjection && !item.collection.publicProjection.revokedAt);
  if (revision.worklog.visibility === "PUBLIC" && revision.worklog.professionalProfile.liveCvEnabled) {
    accessKind = "PUBLIC_CV";
    accessReferenceId = revision.worklog.id;
  } else if (privateItem?.collection.grants[0]) {
    // A direct grant remains valid even when the professional withdraws their
    // public CV. Never let an ineligible public path mask the actor's private
    // authorization.
    accessKind = "PRIVATE_GRANT";
    accessReferenceId = privateItem.collection.grants[0].id;
    allowedFields = privateItem.allowedFields;
  } else if (publicItem?.collection.publicProjection && revision.worklog.professionalProfile.liveCvEnabled) {
    accessKind = "PUBLIC_SELECTION";
    accessReferenceId = publicItem.collection.publicProjection.id;
    allowedFields = publicItem.allowedFields;
  }
  if (!accessKind || !accessReferenceId) throw new DiscoveryNeedsError("No existe autorización vigente para esta evidencia.", 403);
  return {
    worklogRevisionId: revision.id,
    accessKind,
    accessReferenceId,
    accessSnapshot: {
      checkedAt: new Date().toISOString(),
      revisionHash: revision.contentHash,
      accessKind,
      accessReferenceId,
      allowedFields,
    },
  };
}

export async function createEvaluationDossier(input: {
  userId: string;
  workspaceId: string;
  operationKey: string;
  payload: DossierCreate;
}) {
  if (new Set(input.payload.worklogRevisionIds).size !== input.payload.worklogRevisionIds.length)
    throw new DiscoveryNeedsError("Cada evidencia puede incorporarse una sola vez.", 422);
  const operationFingerprint = fingerprint(input.payload);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoWorkspace" WHERE id=${input.workspaceId} FOR UPDATE`);
    const existing = await tx.terraqoEvaluationDossier.findUnique({
      where: { createdById_operationKey: { createdById: input.userId, operationKey: input.operationKey } },
      include: { sources: true },
    });
    if (existing) {
      if (!isWorkspaceReplay(existing, {
        workspaceId: input.workspaceId,
        operationFingerprint,
      }))
        throw new DiscoveryNeedsError("La clave de reintento ya fue usada con otro expediente.", 409);
      return existing;
    }
    const needRevision = await tx.terraqoWorkNeedRevision.findFirst({
      where: { id: input.payload.needRevisionId, need: { workspaceId: input.workspaceId, lifecycle: { not: "ARCHIVED" } } },
      select: { id: true },
    });
    if (!needRevision) throw new DiscoveryNeedsError("La versión de la necesidad no está disponible.", 404);
    const profile = await tx.terraqoProfessionalProfile.findUnique({ where: { id: input.payload.professionalProfileId }, select: { id: true } });
    if (!profile) throw new DiscoveryNeedsError("El perfil profesional no está disponible.", 404);
    const sources = await Promise.all(input.payload.worklogRevisionIds.map((revisionId) => resolveSourceAccess(tx, input.userId, revisionId)));
    const mismatched = await tx.terraqoWorklogRevision.count({
      where: { id: { in: sources.map((source) => source.worklogRevisionId) }, worklog: { professionalProfileId: { not: profile.id } } },
    });
    if (mismatched) throw new DiscoveryNeedsError("Todas las evidencias deben pertenecer al profesional evaluado.", 422);
    return tx.terraqoEvaluationDossier.create({
      data: {
        workspaceId: input.workspaceId,
        needRevisionId: needRevision.id,
        professionalProfileId: profile.id,
        privateSummary: input.payload.privateSummary,
        createdById: input.userId,
        operationKey: input.operationKey,
        operationFingerprint,
        sources: {
          create: sources.map((source) => ({
            accessKind: source.accessKind,
            accessReferenceId: source.accessReferenceId,
            accessSnapshot: source.accessSnapshot,
            worklogRevision: { connect: { id: source.worklogRevisionId } },
            addedBy: { connect: { id: input.userId } },
          })),
        },
      },
      include: { sources: true },
    });
  }, { isolationLevel: "Serializable" });
}

async function evaluationSourceIsAccessible(
  tx: Prisma.TransactionClient,
  actorId: string,
  source: { accessKind: TerraqoEvaluationSourceAccessKind; accessReferenceId: string | null; worklogRevisionId: string; accessSnapshot: Prisma.JsonValue },
) {
  if (source.accessKind === "PUBLIC_CV") {
    const revision = await tx.terraqoWorklogRevision.findFirst({
      where: { id: source.worklogRevisionId, currentFor: { visibility: "PUBLIC", deletedAt: null, lifecycle: "PUBLISHED", professionalProfile: { liveCvEnabled: true } } },
      select: { id: true },
    });
    return revision ? { allowedFields: constrainAllowedFields(null, source.accessSnapshot) } : null;
  }
  if (source.accessKind === "PUBLIC_SELECTION") {
    const item = await tx.terraqoShareCollectionItem.findFirst({
      where: {
        revisionId: source.worklogRevisionId,
        revision: { worklog: { professionalProfile: { liveCvEnabled: true } } },
        collection: { lifecycle: { not: "ARCHIVED" }, publicProjection: { id: source.accessReferenceId ?? "", revokedAt: null } },
      },
      select: { allowedFields: true },
    });
    return item ? { allowedFields: constrainAllowedFields(item.allowedFields, source.accessSnapshot) } : null;
  }
  const item = await tx.terraqoShareCollectionItem.findFirst({
    where: {
      revisionId: source.worklogRevisionId,
      collection: {
        grants: { some: { id: source.accessReferenceId ?? "", subjectUserId: actorId, lifecycle: "ACTIVE", expiresAt: { gt: new Date() }, scopes: { has: "VIEW_COLLECTION" } } },
      },
    },
    select: { allowedFields: true },
  });
  return item ? { allowedFields: constrainAllowedFields(item.allowedFields, source.accessSnapshot) } : null;
}

export async function listEvaluationDossiers(input: { userId: string; workspaceId: string }) {
  return prisma.$transaction(async (tx) => {
    const dossiers = await tx.terraqoEvaluationDossier.findMany({
      where: { workspaceId: input.workspaceId, lifecycle: { not: "ARCHIVED" } },
      include: {
        needRevision: {
          select: {
            id: true,
            title: true,
            revisionNo: true,
            requirements: { orderBy: [{ priority: "asc" }, { sortOrder: "asc" }] },
          },
        },
        professionalProfile: { select: { id: true, headline: true, user: { select: { name: true, image: true } } } },
        sources: {
          include: { worklogRevision: { select: { id: true, title: true, contentHash: true } } },
          orderBy: { createdAt: "asc" },
        },
        assessments: {
          where: { current: true },
          include: { sourceLinks: { select: { sourceId: true } } },
          orderBy: { createdAt: "asc" },
        },
        notes: {
          include: { createdBy: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 100,
        },
        questions: { where: { current: true, lifecycle: "DRAFT" }, orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });

    return Promise.all(dossiers.map(async (dossier) => {
      const accessibility = new Map<string, { allowedFields: EvaluationSourceFieldPolicy } | null>();
      await Promise.all(dossier.sources.map(async (source) => {
        accessibility.set(source.id, await evaluationSourceIsAccessible(tx, input.userId, source));
      }));
      const sources = dossier.sources
        .filter((source) => accessibility.get(source.id))
        .map((source) => {
          const policy = accessibility.get(source.id)!;
          const titleAllowed = policy.allowedFields === null || policy.allowedFields.includes("title");
          return {
            ...source,
            accessState: "ACTIVE" as const,
            worklogRevision: {
              id: source.worklogRevision.id,
              contentHash: source.worklogRevision.contentHash,
              ...(titleAllowed ? { title: source.worklogRevision.title } : {}),
            },
          };
        });
      const assessments = dossier.assessments.map((assessment) => {
        const activeSourceIds = assessment.sourceLinks.map((link) => link.sourceId).filter((sourceId) => Boolean(accessibility.get(sourceId)));
        return {
          ...assessment,
          sourceIds: activeSourceIds,
          sourceState: activeSourceIds.length === assessment.sourceLinks.length ? "ACTIVE" as const : "SOURCE_REVOKED" as const,
          sourceLinks: undefined,
        };
      });
      const revokedCount = dossier.sources.length - sources.length;
      return {
        ...dossier,
        sources,
        assessments,
        effectiveAnalysisStatus: revokedCount > 0 ? "SOURCE_REVOKED" as const : sources.length === 0 ? "INSUFFICIENT" as const : dossier.analysisStatus,
        revokedSourceCount: revokedCount,
      };
    }));
  });
}

export async function saveEvaluationAssessment(input: {
  userId: string;
  workspaceId: string;
  dossierId: string;
  operationKey: string;
  payload: AssessmentInput;
}) {
  const operationFingerprint = fingerprint(input.payload);
  const key = criterionKey(input.payload);
  return prisma.$transaction(async (tx) => {
    const replay = await tx.terraqoEvaluationAssessment.findUnique({
      where: { createdById_operationKey: { createdById: input.userId, operationKey: input.operationKey } },
    });
    if (replay) {
      if (replay.operationFingerprint !== operationFingerprint || replay.dossierId !== input.dossierId)
        throw new DiscoveryNeedsError("La clave de reintento ya fue usada con otra evaluación.", 409);
      return replay;
    }
    const dossier = await tx.terraqoEvaluationDossier.findFirst({
      where: { id: input.dossierId, workspaceId: input.workspaceId, lifecycle: { not: "ARCHIVED" } },
      select: { id: true, needRevisionId: true },
    });
    if (!dossier) throw new DiscoveryNeedsError("Expediente no disponible.", 404);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoEvaluationDossier" WHERE id=${dossier.id} FOR UPDATE`);
    if (input.payload.requirementId) {
      const requirement = await tx.terraqoNeedRequirement.findFirst({
        where: { id: input.payload.requirementId, revisionId: dossier.needRevisionId },
        select: { id: true },
      });
      if (!requirement) throw new DiscoveryNeedsError("El criterio no pertenece a la versión evaluada.", 422);
    }
    const current = await tx.terraqoEvaluationAssessment.findFirst({
      where: { dossierId: dossier.id, criterionKey: key, current: true },
      orderBy: { revisionNo: "desc" },
    });
    const currentRevisionNo = current?.revisionNo ?? 0;
    if (currentRevisionNo !== input.payload.expectedRevisionNo)
      throw new DiscoveryNeedsError("El criterio cambió en otra sesión. Recarga antes de guardar.", 409);
    const sourceIds = [...new Set(input.payload.sourceIds)];
    const sources = sourceIds.length ? await tx.terraqoEvaluationSource.findMany({
      where: { id: { in: sourceIds }, dossierId: dossier.id },
      select: { id: true, accessKind: true, accessReferenceId: true, worklogRevisionId: true, accessSnapshot: true },
    }) : [];
    if (sources.length !== sourceIds.length) throw new DiscoveryNeedsError("Alguna fuente no pertenece al expediente.", 422);
    const accessChecks = await Promise.all(sources.map((source) => evaluationSourceIsAccessible(tx, input.userId, source)));
    if (accessChecks.some((accessible) => !accessible)) throw new DiscoveryNeedsError("Alguna fuente fue retirada o perdió autorización.", 409);
    if (current) await tx.terraqoEvaluationAssessment.update({ where: { id: current.id }, data: { current: false } });
    return tx.terraqoEvaluationAssessment.create({
      data: {
        dossierId: dossier.id,
        requirementId: input.payload.requirementId,
        criterionKey: key,
        criterionLabel: input.payload.criterionLabel,
        claimState: input.payload.claimState,
        rationale: input.payload.rationale,
        revisionNo: currentRevisionNo + 1,
        supersedesId: current?.id,
        createdById: input.userId,
        operationKey: input.operationKey,
        operationFingerprint,
        sourceLinks: { create: sourceIds.map((sourceId) => ({ sourceId })) },
      },
      include: { sourceLinks: true },
    });
  }, { isolationLevel: "Serializable" });
}

export async function addEvaluationNote(input: {
  userId: string;
  workspaceId: string;
  dossierId: string;
  operationKey: string;
  payload: NoteInput;
}) {
  const operationFingerprint = fingerprint(input.payload);
  return prisma.$transaction(async (tx) => {
    const replay = await tx.terraqoEvaluationNote.findUnique({
      where: { createdById_operationKey: { createdById: input.userId, operationKey: input.operationKey } },
    });
    if (replay) {
      if (replay.operationFingerprint !== operationFingerprint || replay.dossierId !== input.dossierId)
        throw new DiscoveryNeedsError("La clave de reintento ya fue usada con otra nota.", 409);
      return replay;
    }
    const dossier = await tx.terraqoEvaluationDossier.findFirst({
      where: { id: input.dossierId, workspaceId: input.workspaceId, lifecycle: { not: "ARCHIVED" } },
      select: { id: true },
    });
    if (!dossier) throw new DiscoveryNeedsError("Expediente no disponible.", 404);
    return tx.terraqoEvaluationNote.create({
      data: {
        dossierId: dossier.id,
        body: input.payload.body,
        createdById: input.userId,
        operationKey: input.operationKey,
        operationFingerprint,
      },
    });
  }, { isolationLevel: "Serializable" });
}

export async function saveEvaluationQuestion(input: {
  userId: string;
  workspaceId: string;
  dossierId: string;
  operationKey: string;
  payload: QuestionInput;
}) {
  const operationFingerprint = fingerprint(input.payload);
  return prisma.$transaction(async (tx) => {
    const replay = await tx.terraqoEvaluationQuestion.findUnique({
      where: { createdById_operationKey: { createdById: input.userId, operationKey: input.operationKey } },
    });
    if (replay) {
      if (replay.operationFingerprint !== operationFingerprint || replay.dossierId !== input.dossierId)
        throw new DiscoveryNeedsError("La clave de reintento ya fue usada con otra pregunta.", 409);
      return replay;
    }
    const dossier = await tx.terraqoEvaluationDossier.findFirst({
      where: { id: input.dossierId, workspaceId: input.workspaceId, lifecycle: { not: "ARCHIVED" } },
      select: { id: true },
    });
    if (!dossier) throw new DiscoveryNeedsError("Expediente no disponible.", 404);
    const current = input.payload.questionId ? await tx.terraqoEvaluationQuestion.findFirst({
      where: { id: input.payload.questionId, dossierId: dossier.id, current: true, lifecycle: "DRAFT" },
    }) : null;
    if (input.payload.questionId && !current) throw new DiscoveryNeedsError("La pregunta cambió o ya no es editable.", 409);
    const currentRevisionNo = current?.revisionNo ?? 0;
    if (currentRevisionNo !== input.payload.expectedRevisionNo)
      throw new DiscoveryNeedsError("La pregunta cambió en otra sesión. Recarga antes de guardar.", 409);
    if (current) await tx.terraqoEvaluationQuestion.update({ where: { id: current.id }, data: { current: false } });
    return tx.terraqoEvaluationQuestion.create({
      data: {
        dossierId: dossier.id,
        text: input.payload.text,
        revisionNo: currentRevisionNo + 1,
        supersedesId: current?.id,
        createdById: input.userId,
        operationKey: input.operationKey,
        operationFingerprint,
      },
    });
  }, { isolationLevel: "Serializable" });
}
