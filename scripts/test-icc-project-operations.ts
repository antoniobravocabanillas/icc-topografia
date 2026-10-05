import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {z} from 'zod';
import {prisma} from '../lib/prisma';
import {listPortalResource, savePortalResource, PortalResourceError} from '../lib/server/portal-resources';
import {PortalProjectOperationError, type ProjectOperation} from '../lib/server/portal-project-operations';
import type {WorkspacePortalToken} from '../lib/server/workspace-portal-session';

type RecordDto = {id: string; updatedAt: string; fields: Record<string, string>; editable: boolean};
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, 'icc-topografia:20616116313');
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({where: {slug: 'icc-topografia', active: true, deletedAt: null,
    companies: {some: {document: '20616116313', deletedAt: null}}}, select: {id: true}});
  const run = randomUUID(), projectId = `000-operations-${run}`, staffId = `000-staff-${run}`;
  const password = randomBytes(24).toString('hex'), email = `operations-${run}@example.test`;
  const user = await prisma.user.create({data: {email, name: 'Prueba operaciones Android', role: 'CUSTOMER', emailVerified: new Date(),
    passwordHash: await bcrypt.hash(password, 12), terraqoMemberships: {create: {workspaceId: workspace.id, role: 'ADMIN', active: true}}}, select: {id: true}});
  const token: WorkspacePortalToken = {sub: user.id, workspaceId: workspace.id, workspaceSlug: 'icc-topografia', role: 'ADMIN', iat: 1, exp: 2};
  const http = process.env.TEST_PORTAL_OPERATIONS_HTTP === '1';
  let bearer: string | undefined;
  const base = 'https://api.terraqoglobal.com/api/public/workspaces/icc-topografia/portal';
  const request = (path: string, body?: unknown, key?: string) => fetch(`${base}/${path}`, {method: body ? 'POST' : 'GET',
    headers: {'content-type': 'application/json', ...(bearer ? {authorization: `Bearer ${bearer}`} : {}), ...(key ? {'Idempotency-Key': key} : {})},
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(90000), redirect: 'error'});
  const save = async (resource: ProjectOperation, fields: Record<string, string>, key = randomBytes(16).toString('hex'), record?: RecordDto, expected = 200) => {
    if (http) {
      const response = await request(`resources/${resource}`, {fields, ...(record ? {id: record.id, version: record.updatedAt} : {})}, key);
      assert.equal(response.status, expected, `${resource}: unexpected HTTP status`);
      return expected === 200 ? (await response.json()).data.record as RecordDto : null;
    }
    try {
      const result = await savePortalResource(token, resource, fields, key, record?.id, record?.updatedAt);
      assert.equal(expected, 200, 'Expected rejected operation'); return result as RecordDto;
    } catch (error) {
      const status = error instanceof PortalProjectOperationError || error instanceof PortalResourceError ? error.status : error instanceof z.ZodError ? 422 : null;
      if (status === null) throw error; assert.equal(status, expected); return null;
    }
  };
  try {
    await prisma.project.create({data: {id: projectId, terraqoWorkspaceId: workspace.id, slug: `operations-${run}`,
      title: 'Proyecto de prueba operativa', summary: 'Validación temporal', description: '', servicesApplied: [], isPublic: false}});
    await prisma.staffProfile.create({data: {id: staffId, terraqoWorkspaceId: workspace.id, displayName: 'Personal de prueba',
      roleTitle: 'Topografía', active: true, certifications: [], documents: [], specialties: [], tools: {}}});
    if (http) {
      const login = await request('login', {email, password}); assert.equal(login.status, 200); bearer = (await login.json()).data.token; assert.ok(bearer);
    } else {
      for (const resource of ['projectMembers', 'milestones', 'projectProgress'] as const)
        for (const role of ['MEMBER', 'CLIENT', 'PROFESSIONAL', 'VIEWER'] as const)
          await assert.rejects(listPortalResource({...token, role}, resource), error => error instanceof PortalResourceError && error.status === 403);
    }
    const memberFields = {projectId, assignedProfileId: staffId, role: 'SURVEYOR'};
    const memberKey = randomBytes(16).toString('hex');
    const members = await Promise.all(Array.from({length: 4}, () => save('projectMembers', memberFields, memberKey)));
    assert.ok(members.every(member => member!.id === members[0]!.id));
    assert.equal(await prisma.projectMember.count({where: {projectId}}), 1);
    assert.equal(await prisma.activityLog.count({where: {projectId, entityType: 'projectMembers', action: 'CREATED'}}), 1);
    await save('projectMembers', {...memberFields, role: 'ENGINEER'}, memberKey, undefined, 409);
    await save('projectMembers', {...memberFields, assignedProfileId: 'foreign'}, undefined, undefined, 422);
    const editedMember = await save('projectMembers', {role: 'ENGINEER', status: 'ACTIVE'}, undefined, members[0]!); assert.ok(editedMember);
    await save('projectMembers', {role: 'MANAGER', status: 'ACTIVE'}, undefined, members[0]!, 409);
    const removeKey = randomBytes(16).toString('hex');
    await Promise.all(Array.from({length: 4}, () => save('projectMembers', {role: 'ENGINEER', status: 'REMOVED'}, removeKey, editedMember)));
    assert.equal(await prisma.projectMember.count({where: {projectId}}), 0);
    assert.equal(await prisma.activityLog.count({where: {projectId, entityType: 'projectMembers', action: 'DELETED'}}), 1);
    console.log('PASS project team: concurrent idempotent assignment/removal, scoped staff, role edit, stale conflict, single audit per operation.');
    const milestoneFields = {projectId, title: 'Entrega de levantamiento', description: 'Planos revisados', dueDate: '2027-02-28', status: 'PENDING'};
    const milestoneKey = randomBytes(16).toString('hex');
    const milestones = await Promise.all(Array.from({length: 4}, () => save('milestones', milestoneFields, milestoneKey)));
    assert.ok(milestones.every(row => row!.id === milestones[0]!.id));
    assert.equal(await prisma.milestone.count({where: {projectId}}), 1);
    const {projectId: ignoredProject, ...editFields} = milestoneFields; assert.equal(ignoredProject, projectId);
    const completed = await save('milestones', {...editFields, status: 'COMPLETED'}, undefined, milestones[0]!); assert.ok(completed?.fields.completedAt);
    await save('milestones', {...editFields, status: 'DELAYED'}, undefined, milestones[0]!, 409);
    const reopened = await save('milestones', {...editFields, status: 'IN_PROGRESS', dueDate: ''}, undefined, completed!);
    assert.equal(reopened!.fields.completedAt, ''); assert.equal(reopened!.fields.dueDate, '');
    await save('milestones', {...milestoneFields, dueDate: '2027-02-30'}, undefined, undefined, 422);
    await save('milestones', {...milestoneFields, projectId: 'foreign'}, undefined, undefined, 404);
    console.log('PASS milestones: concurrent creation, UTC date validation, completion/reopening, explicit clearing and stale rejection.');
    const progressFields = {projectId, title: 'Medición de campo', body: 'Se completó el levantamiento.', milestone: 'Primera entrega'};
    const progressKey = randomBytes(16).toString('hex');
    const updates = await Promise.all(Array.from({length: 4}, () => save('projectProgress', progressFields, progressKey)));
    assert.ok(updates.every(row => row!.id === updates[0]!.id));
    assert.equal(await prisma.projectProgress.count({where: {projectId}}), 1);
    await save('projectProgress', {...progressFields, body: 'Cambio'}, progressKey, undefined, 409);
    await save('projectProgress', progressFields, undefined, updates[0]!, 403);
    await save('projectProgress', {...progressFields, files: 'https://invalid.test'}, undefined, undefined, 422);
    await prisma.project.update({where: {id: projectId}, data: {isPublic: true}});
    await save('projectProgress', progressFields, undefined, undefined, 403);
    console.log('PASS progress: immutable append-only record, idempotency/conflict, injected attachments and public-project write denied.');
  } finally {
    await prisma.activityLog.deleteMany({where: {projectId, terraqoWorkspaceId: workspace.id, actorId: user.id}});
    await prisma.project.deleteMany({where: {id: projectId, terraqoWorkspaceId: workspace.id, slug: `operations-${run}`}});
    await prisma.staffProfile.deleteMany({where: {id: staffId, terraqoWorkspaceId: workspace.id}});
    await prisma.verificationToken.deleteMany({where: {identifier: {in: [`portal-session:${workspace.id}:${user.id}`, `portal-login-attempt:${workspace.id}:${user.id}`]}}});
    await prisma.user.delete({where: {id: user.id}});
    console.log('CLEANUP OPERATIONS: only this run temporary project, staff, account, audit and sessions removed.');
  }
}
main().catch((error: unknown) => {console.error(error instanceof assert.AssertionError ? error.message : 'Operations validation failed; private diagnostics suppressed.'); process.exitCode = 1;}).finally(async () => prisma.$disconnect());
