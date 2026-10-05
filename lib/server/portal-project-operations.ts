import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import type { WorkspacePortalToken } from './workspace-portal-session';
import { dueDateSchema, lockTaskAssignee } from './portal-task-fields';

export const projectOperationCodes = ['projectMembers', 'milestones', 'projectProgress'] as const;
export type ProjectOperation = typeof projectOperationCodes[number];
export const isProjectOperation = (value: string): value is ProjectOperation => projectOperationCodes.some(code => code === value);
export class PortalProjectOperationError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const memberFields = z.object({ role: z.enum(['SURVEYOR', 'ENGINEER', 'ARCHITECT', 'SELLER', 'SUPPORT', 'MANAGER']),
  status: z.enum(['ACTIVE', 'REMOVED']).default('ACTIVE') }).strict();
const milestoneFields = z.object({ title: z.string().trim().min(2).max(160), description: z.string().trim().max(8000).default(''),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED']), dueDate: dueDateSchema.default('') }).strict();
const progressFields = z.object({ projectId: identifier, title: z.string().trim().min(2).max(160),
  body: z.string().trim().min(1).max(12000), milestone: z.string().trim().max(160).default('') }).strict();
const projectSelect = { id: true, title: true, updatedAt: true, isPublic: true, status: true } as const;
const memberSelect = { id: true, projectId: true, staffProfileId: true, role: true, createdAt: true,
  project: { select: projectSelect }, staffProfile: { select: {displayName: true, terraqoWorkspaceId: true} } } as const;
const milestoneSelect = { id: true, projectId: true, title: true, description: true, status: true, dueDate: true,
  completedAt: true, updatedAt: true, project: { select: projectSelect } } as const;
const progressSelect = { id: true, projectId: true, title: true, body: true, milestone: true, createdAt: true,
  project: { select: projectSelect } } as const;
type Member = Prisma.ProjectMemberGetPayload<{select: typeof memberSelect}>;
type Milestone = Prisma.MilestoneGetPayload<{select: typeof milestoneSelect}>;
type Progress = Prisma.ProjectProgressGetPayload<{select: typeof progressSelect}>;
type RecordDto = {id: string; title: string; subtitle: string; status: string; updatedAt: string;
  fields: Record<string, string>; editable: boolean; canDelete: boolean};
const editable = (project: {isPublic: boolean; status: string}) => !project.isPublic && project.status !== 'PUBLISHED';
function memberRecord(row: Member, workspaceId: string): RecordDto {
  const scoped = row.staffProfile.terraqoWorkspaceId === workspaceId;
  const name = scoped ? row.staffProfile.displayName : 'Vinculación protegida';
  return {id: row.id, title: name, subtitle: row.project.title, status: 'ACTIVE', updatedAt: row.project.updatedAt.toISOString(),
    editable: editable(row.project) && scoped, canDelete: false,
    fields: {projectId: row.projectId, projectName: row.project.title, assignedProfileId: scoped ? row.staffProfileId : '',
      assignedProfileName: scoped ? name : '', role: row.role, status: 'ACTIVE'}};
}
function milestoneRecord(row: Milestone): RecordDto {
  return {id: row.id, title: row.title, subtitle: row.project.title, status: row.status, updatedAt: row.updatedAt.toISOString(),
    editable: editable(row.project), canDelete: false, fields: {projectId: row.projectId, projectName: row.project.title,
      title: row.title, description: row.description ?? '', status: row.status, dueDate: row.dueDate?.toISOString().slice(0, 10) ?? '',
      completedAt: row.completedAt?.toISOString() ?? ''}};
}
function progressRecord(row: Progress): RecordDto {
  return {id: row.id, title: row.title, subtitle: row.project.title, status: '', updatedAt: row.createdAt.toISOString(),
    editable: false, canDelete: false, fields: {projectId: row.projectId, projectName: row.project.title,
      title: row.title, body: row.body, milestone: row.milestone ?? ''}};
}
export async function listProjectOperations(token: WorkspacePortalToken, resource: ProjectOperation, cursor?: string) {
  const where = {project: {terraqoWorkspaceId: token.workspaceId, deletedAt: null}};
  const window = {take: 31, orderBy: {id: 'asc' as const}, ...(cursor ? {cursor: {id: cursor}, skip: 1} : {})};
  const records = resource === 'projectMembers'
    ? (await prisma.projectMember.findMany({...window, where, select: memberSelect})).map(row => memberRecord(row, token.workspaceId))
    : resource === 'milestones'
    ? (await prisma.milestone.findMany({...window, where: {...where, deletedAt: null}, select: milestoneSelect})).map(milestoneRecord)
    : (await prisma.projectProgress.findMany({...window, where, select: progressSelect})).map(progressRecord);
  return {schemaVersion: 1, workspaceSlug: token.workspaceSlug, resource, records: records.slice(0, 30),
    nextCursor: records.length > 30 ? records[29].id : null, canCreate: true};
}

/** The gateway requires active ADMIN membership and PROJECTS entitlement.
 * Parent row locks serialize quotas and membership revisions across instances. */
export async function saveProjectOperation(token: WorkspacePortalToken, resource: ProjectOperation, input: unknown,
  key: string | null, id?: string, version?: string): Promise<RecordDto> {
  if (!key || !/^[a-f0-9]{32}$/.test(key)) throw new PortalProjectOperationError('Clave de operación no válida.', 422);
  if (id && !z.string().datetime().safeParse(version).success) throw new PortalProjectOperationError('Recarga antes de editar.', 409);
  if (id && resource === 'projectProgress') throw new PortalProjectOperationError('Los avances publicados en el registro son inmutables.', 403);
  const member = resource === 'projectMembers' ? (id ? memberFields : memberFields.extend({projectId: identifier, assignedProfileId: identifier})).parse(input) : null;
  const milestone = resource === 'milestones' ? (id ? milestoneFields : milestoneFields.extend({projectId: identifier})).parse(input) : null;
  const progress = resource === 'projectProgress' ? progressFields.parse(input) : null;
  if (!id && member?.status === 'REMOVED') throw new PortalProjectOperationError('Selecciona una asignación existente.', 422);
  const entityId = id ?? createHash('sha256').update(JSON.stringify([token.workspaceId, token.sub, resource, key])).digest('hex').slice(0, 32);
  const scope = {project: {terraqoWorkspaceId: token.workspaceId, deletedAt: null}};
  try {
    return await prisma.$transaction(async tx => {
      const tenants = await tx.$queryRaw<{id: string}[]>`SELECT id FROM "icc"."TerraqoWorkspace"
        WHERE id = ${token.workspaceId} AND active = true AND "deletedAt" IS NULL FOR SHARE`;
      if (tenants.length !== 1) throw new PortalProjectOperationError('Empresa no disponible.', 403);
      const before = id ? resource === 'projectMembers'
        ? await tx.projectMember.findFirst({where: {id, ...scope}, select: {projectId: true}})
        : await tx.milestone.findFirst({where: {id, ...scope, deletedAt: null}, select: {projectId: true}}) : null;
      if (id && !before) {
        if (member?.status === 'REMOVED' && await tx.activityLog.findFirst({where: {actorId: token.sub,
          terraqoWorkspaceId: token.workspaceId, entityType: resource, entityId: id, action: 'DELETED',
          metadata: {path: ['operationKey'], equals: key}}, select: {id: true}})) {
          return {id, title: 'Asignación retirada', subtitle: '', status: 'REMOVED', updatedAt: version!, fields: {}, editable: false, canDelete: false};
        }
        throw new PortalProjectOperationError('Registro no disponible.', 404);
      }
      const parsed = member ?? milestone ?? progress!;
      const projectId = before?.projectId ?? ('projectId' in parsed ? String(parsed.projectId) : '');
      const parents = await tx.$queryRaw<{id: string; updatedAt: Date; isPublic: boolean; status: string}[]>`
        SELECT id, "updatedAt", "isPublic", status FROM "icc"."Project" WHERE id = ${projectId}
        AND "terraqoWorkspaceId" = ${token.workspaceId} AND "deletedAt" IS NULL FOR UPDATE`;
      if (parents.length !== 1) throw new PortalProjectOperationError('Proyecto no disponible.', 404);
      if (!editable(parents[0])) throw new PortalProjectOperationError('Este proyecto requiere el flujo de publicación.', 403);
      let result: RecordDto;
      if (member) {
        const existing = await tx.projectMember.findFirst({where: {id: entityId, ...scope}, select: memberSelect});
        // Another copy of the same removal may have waited for this parent lock.
        if (id && !existing && member.status === 'REMOVED' && await tx.activityLog.findFirst({where: {
          actorId: token.sub, terraqoWorkspaceId: token.workspaceId, entityType: resource, entityId: id, action: 'DELETED',
          metadata: {path: ['operationKey'], equals: key}}, select: {id: true}}))
          return {id, title: 'Asignación retirada', subtitle: '', status: 'REMOVED', updatedAt: version!, fields: {}, editable: false, canDelete: false};
        const staffId = 'assignedProfileId' in member ? String(member.assignedProfileId) : existing?.staffProfileId;
        if (!id && existing) {
          if (existing.projectId !== projectId || existing.staffProfileId !== staffId || existing.role !== member.role)
            throw new PortalProjectOperationError('La clave ya se utilizó con otros datos.', 409);
          return memberRecord(existing, token.workspaceId);
        }
        if (id && (!existing || existing.project.updatedAt.toISOString() !== new Date(version!).toISOString()))
          throw new PortalProjectOperationError('El equipo cambió. Recarga antes de editar.', 409);
        if (!staffId || (member.status !== 'REMOVED' && !await lockTaskAssignee(tx, token.workspaceId, staffId)))
          throw new PortalProjectOperationError('Personal no disponible para esta empresa.', 422);
        if (existing && existing.staffProfile.terraqoWorkspaceId !== token.workspaceId)
          throw new PortalProjectOperationError('Vinculación protegida.', 403);
        if (!id && await tx.projectMember.count({where: {projectId}}) >= 200)
          throw new PortalProjectOperationError('El proyecto alcanzó el límite de asignaciones.', 409);
        // Membership has no own revision column: update the locked parent monotonically.
        await tx.project.update({where: {id: projectId}, data: {updatedAt: new Date(Math.max(Date.now(), parents[0].updatedAt.getTime() + 1))}});
        if (member.status === 'REMOVED') {
          await tx.projectMember.delete({where: {id: entityId}});
          const removed = memberRecord(existing!, token.workspaceId);
          result = {...removed, editable: false, status: 'REMOVED', fields: {...removed.fields, status: 'REMOVED'}};
        } else {
          const saved = id ? await tx.projectMember.update({where: {id}, data: {role: member.role}, select: memberSelect})
            : await tx.projectMember.create({data: {id: entityId, projectId, staffProfileId: staffId, role: member.role}, select: memberSelect});
          result = memberRecord(saved, token.workspaceId);
        }
      } else if (milestone) {
        const existing = await tx.milestone.findFirst({where: {id: entityId, ...scope, deletedAt: null}, select: milestoneSelect});
        const fields = {title: milestone.title, description: milestone.description, status: milestone.status,
          dueDate: milestone.dueDate ? new Date(`${milestone.dueDate}T00:00:00.000Z`) : null};
        if (!id && existing) {
          if (existing.projectId !== projectId || existing.title !== fields.title || (existing.description ?? '') !== fields.description ||
            existing.status !== fields.status || (existing.dueDate?.toISOString() ?? '') !== (fields.dueDate?.toISOString() ?? ''))
            throw new PortalProjectOperationError('La clave ya se utilizó con otros datos.', 409);
          return milestoneRecord(existing);
        }
        if (id && (!existing || existing.updatedAt.toISOString() !== new Date(version!).toISOString()))
          throw new PortalProjectOperationError('El hito cambió. Recarga antes de editar.', 409);
        if (!id && await tx.milestone.count({where: {projectId, deletedAt: null}}) >= 500)
          throw new PortalProjectOperationError('El proyecto alcanzó el límite de hitos.', 409);
        const data = {...fields, completedAt: fields.status === 'COMPLETED' ? existing?.completedAt ?? new Date() : null,
          ...(existing ? {updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1))} : {})};
        if (id) {
          const changed = await tx.milestone.updateMany({where: {id, ...scope, deletedAt: null, updatedAt: new Date(version!)}, data});
          if (changed.count !== 1) throw new PortalProjectOperationError('El hito cambió. Recarga antes de editar.', 409);
          result = milestoneRecord(await tx.milestone.findUniqueOrThrow({where: {id}, select: milestoneSelect}));
        } else result = milestoneRecord(await tx.milestone.create({data: {id: entityId, projectId, ...data}, select: milestoneSelect}));
      } else {
        const data = progress!;
        const existing = await tx.projectProgress.findFirst({where: {id: entityId, ...scope}, select: progressSelect});
        if (existing) {
          if (existing.projectId !== projectId || existing.title !== data.title || existing.body !== data.body || (existing.milestone ?? '') !== data.milestone)
            throw new PortalProjectOperationError('La clave ya se utilizó con otros datos.', 409);
          return progressRecord(existing);
        }
        if (await tx.projectProgress.count({where: {projectId}}) >= 5000)
          throw new PortalProjectOperationError('El proyecto alcanzó el límite de avances.', 409);
        result = progressRecord(await tx.projectProgress.create({data: {id: entityId, ...data, files: []}, select: progressSelect}));
      }
      await tx.activityLog.create({data: {actorId: token.sub, terraqoWorkspaceId: token.workspaceId, projectId,
        entityType: resource, entityId, action: member?.status === 'REMOVED' ? 'DELETED' : id ? 'UPDATED' : 'CREATED',
        title: member ? 'Equipo del proyecto actualizado' : milestone ? 'Hito del proyecto actualizado' : 'Avance registrado',
        metadata: {source: 'portal', operationKey: key}}});
      return result;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new PortalProjectOperationError('La asignación u operación ya existe. Recarga antes de continuar.', 409);
    throw error;
  }
}
