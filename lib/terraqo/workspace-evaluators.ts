import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { evaluationSourceIsAccessible } from "./discovery-needs";
import { lockWorkspaceMemberships } from "./workspace-membership-guard";
import { workspaceBrandAuthority } from "./workspace-roles";

export class WorkspaceEvaluatorError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function requireEnabled() {
  if (process.env.TERRAQO_WORKSPACE_EVALUATORS_V1 !== "true") {
    throw new WorkspaceEvaluatorError("Evaluadores no disponibles.", 404);
  }
}

const id = z.string().trim().min(1).max(160);
const updateSchema = z.object({
  workspaceId: id,
  evaluatorId: id,
  active: z.boolean(),
  canReadEvaluations: z.boolean(),
  dossierIds: z.array(id).max(100).refine(ids => new Set(ids).size === ids.length),
  expectedUpdatedAt: z.iso.datetime(),
}).strict();

async function requireAdministrator(tx: Prisma.TransactionClient, actorId: string, workspaceId: string) {
  const authorized = await tx.terraqoWorkspace.findFirst({
    where: workspaceBrandAuthority(actorId, workspaceId), select: { id: true },
  });
  if (!authorized) throw new WorkspaceEvaluatorError("No tienes permiso para gestionar estos evaluadores.", 403);
}

const evaluatorSelect = {
  id: true, userId: true, user: { select: { name: true, email: true } },
  active: true, canReadEvaluations: true, updatedAt: true,
  assignments: { select: { dossierId: true }, orderBy: { dossierId: "asc" } },
} satisfies Prisma.TerraqoWorkspaceEvaluatorSelect;

type Evaluator = Prisma.TerraqoWorkspaceEvaluatorGetPayload<{ select: typeof evaluatorSelect }>;
function projectEvaluator(row: Evaluator) {
  return {
    id: row.id, userId: row.userId, name: row.user.name, email: row.user.email,
    active: row.active, canReadEvaluations: row.canReadEvaluations,
    updatedAt: row.updatedAt.toISOString(), dossierIds: row.assignments.map(a => a.dossierId),
  };
}

export async function listWorkspaceEvaluators(db: PrismaClient, actorId: string, workspaceId: string) {
  requireEnabled();
  const scope = id.safeParse(workspaceId);
  if (!scope.success) throw new WorkspaceEvaluatorError("Workspace no válido.", 422);
  return db.$transaction(async tx => {
    await requireAdministrator(tx, actorId, scope.data);
    const evaluators = await tx.terraqoWorkspaceEvaluator.findMany({
      where: { workspaceId: scope.data }, select: evaluatorSelect, orderBy: { id: "asc" },
    });
    const dossiers = await tx.terraqoEvaluationDossier.findMany({
      where: { workspaceId: scope.data, archivedAt: null, lifecycle: { not: "ARCHIVED" }, needRevision: { need: { workspaceId: scope.data } } },
      select: { id: true, needRevision: { select: { title: true } } }, orderBy: { id: "asc" },
    });
    return { evaluators: evaluators.map(projectEvaluator), dossiers: dossiers.map(d => ({ id: d.id, title: d.needRevision.title })) };
  }, { isolationLevel: "RepeatableRead", maxWait: 20_000, timeout: 15_000 });
}

export async function updateWorkspaceEvaluator(db: PrismaClient, actorId: string, input: unknown) {
  requireEnabled();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) throw new WorkspaceEvaluatorError("Revisa los permisos, expedientes y versión del evaluador.", 422);
  const { workspaceId, evaluatorId, active, canReadEvaluations, dossierIds, expectedUpdatedAt } = parsed.data;
  dossierIds.sort();
  return db.$transaction(async tx => {
    await requireAdministrator(tx, actorId, workspaceId);
    await lockWorkspaceMemberships(tx, workspaceId);
    await requireAdministrator(tx, actorId, workspaceId);
    const target = await tx.terraqoWorkspaceEvaluator.findFirst({
      where: { id: evaluatorId, workspaceId }, select: evaluatorSelect,
    });
    if (!target) throw new WorkspaceEvaluatorError("Evaluador no disponible.", 404);
    if (dossierIds.length) {
      // Lock selected dossiers through commit so an archive cannot race this grant.
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT d.id FROM icc."TerraqoEvaluationDossier" d
        JOIN icc."TerraqoWorkNeedRevision" r ON r.id = d."needRevisionId"
        JOIN icc."TerraqoWorkNeed" n ON n.id = r."needId" AND n."workspaceId" = d."workspaceId"
        WHERE d."workspaceId" = ${workspaceId} AND d.lifecycle <> 'ARCHIVED' AND d."archivedAt" IS NULL
          AND d.id IN (${Prisma.join(dossierIds)}) ORDER BY d.id FOR SHARE OF d, n, r`);
      if (rows.length !== dossierIds.length) throw new WorkspaceEvaluatorError("Algún expediente no está disponible en este workspace.", 404);
    }
    const before = { active: target.active, canReadEvaluations: target.canReadEvaluations, dossierIds: target.assignments.map(a => a.dossierId).sort() };
    if (active === before.active && canReadEvaluations === before.canReadEvaluations
      && dossierIds.length === before.dossierIds.length && dossierIds.every((v, i) => v === before.dossierIds[i])) {
      return { ...projectEvaluator(target), replayed: true };
    }
    if (target.updatedAt.toISOString() !== expectedUpdatedAt) throw new WorkspaceEvaluatorError("El acceso cambió. Recarga antes de guardar.", 409);
    await tx.terraqoWorkspaceEvaluatorAssignment.deleteMany({ where: { workspaceId, evaluatorId, dossierId: { notIn: dossierIds } } });
    const added = dossierIds.filter(value => !before.dossierIds.includes(value));
    if (added.length) await tx.terraqoWorkspaceEvaluatorAssignment.createMany({ data: added.map(dossierId => ({ workspaceId, evaluatorId, dossierId })) });
    const updated = await tx.terraqoWorkspaceEvaluator.update({
      where: { workspaceId_id: { workspaceId, id: evaluatorId } },
      data: { active, canReadEvaluations, updatedAt: new Date(Math.max(Date.now(), target.updatedAt.getTime() + 1)) },
      select: evaluatorSelect,
    });
    await tx.activityLog.create({ data: {
      actorId, terraqoWorkspaceId: workspaceId, action: "UPDATED", entityType: "WorkspaceEvaluator",
      entityId: evaluatorId, title: "Acceso de evaluador actualizado",
      metadata: { before, after: { active, canReadEvaluations, dossierIds } },
    } });
    return { ...projectEvaluator(updated), replayed: false };
  }, { isolationLevel: "ReadCommitted", maxWait: 20_000, timeout: 15_000 });
}

type AssignedEvaluation = {
  id: string; title: string; workspaceName: string; criteria: string[]; sources: { id: string; title?: string; summary?: string; outcome?: string }[];
};

export async function listAssignedEvaluations(db: PrismaClient, actorId: string): Promise<AssignedEvaluation[]> {
  requireEnabled();
  return db.$transaction(async tx => {
    const assignments = await tx.terraqoWorkspaceEvaluatorAssignment.findMany({
      where: {
        evaluator: { userId: actorId, active: true, canReadEvaluations: true, workspace: {
          active: true, deletedAt: null, members: { none: { userId: actorId, active: false } },
        } },
        dossier: { lifecycle: { not: "ARCHIVED" }, archivedAt: null },
      },
      orderBy: [{ workspaceId: "asc" }, { dossierId: "asc" }],
      select: { workspaceId: true, dossier: { select: {
        id: true, workspace: { select: { name: true } },
        needRevision: { select: { title: true, need: { select: { workspaceId: true } },
          requirements: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { label: true } },
        } },
        sources: {
          where: { worklogRevision: { currentFor: { deletedAt: null, lifecycle: "PUBLISHED" } } },
          orderBy: { id: "asc" },
          select: { id: true, accessKind: true, accessReferenceId: true, accessSnapshot: true, worklogRevisionId: true,
            worklogRevision: { select: { title: true, summary: true, outcome: true } } },
        },
      } } },
    });
    const result: AssignedEvaluation[] = [];
    for (const { workspaceId, dossier } of assignments) {
      if (dossier.needRevision.need.workspaceId !== workspaceId) continue;
      const sources: AssignedEvaluation["sources"] = [];
      for (const source of dossier.sources) {
        if (source.accessKind === "PRIVATE_GRANT") {
          const live = source.accessReferenceId && await tx.terraqoAccessGrant.findFirst({
            where: { id: source.accessReferenceId, revokedAt: null, collection: { lifecycle: { not: "ARCHIVED" }, archivedAt: null } },
            select: { id: true },
          });
          if (!live) continue;
        }
        const access = await evaluationSourceIsAccessible(tx, actorId, source);
        if (!access) continue;
        const visible = (field: string) => access.allowedFields === null || access.allowedFields.includes(field);
        const revision = source.worklogRevision;
        sources.push({ id: source.id,
          ...(visible("title") ? { title: revision.title } : {}),
          ...(visible("summary") && revision.summary ? { summary: revision.summary } : {}),
          ...(visible("outcome") && revision.outcome ? { outcome: revision.outcome } : {}),
        });
      }
      // Requirements belong to the need revision. Assessment labels and rationale
      // may quote withdrawn evidence and have no per-field provenance.
      result.push({ id: dossier.id, title: dossier.needRevision.title, workspaceName: dossier.workspace.name,
        criteria: dossier.needRevision.requirements.map(req => req.label), sources });
    }
    return result;
  }, { isolationLevel: "RepeatableRead", maxWait: 20_000, timeout: 15_000 });
}
