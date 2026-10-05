import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { listPortalResource, savePortalResource, PortalResourceError } from "../lib/server/portal-resources";
import { PortalProjectWriteError } from "../lib/server/portal-project-write";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";

async function main() {
  const original = { transaction: prisma.$transaction, billing: prisma.terraqoBillingAccount.findUnique,
    module: prisma.terraqoWorkspaceModule.findUnique, list: prisma.project.findMany };
  let enabled = true, active = true, full = false, stale = false, failAudit = false, creates = 0, audits = 0;
  type Row = { id: string; title: string; summary: string; description: string; location: string; category: string;
    servicesApplied: string[]; status: string; isPublic: boolean; isFeatured: boolean; terraqoWorkspaceId: string; slug: string; updatedAt: Date };
  let row: Row | null = null;
  prisma.terraqoBillingAccount.findUnique = (async () => null) as unknown as typeof original.billing;
  prisma.terraqoWorkspaceModule.findUnique = (async () => ({active: enabled})) as unknown as typeof original.module;
  prisma.project.findMany = (async (args: {where: unknown; take: number; cursor?: unknown; skip?: number}) => {
    assert.deepEqual(args.where, {terraqoWorkspaceId: 'workspace', deletedAt: null}); assert.equal(args.take, 31);
    assert.deepEqual(args.cursor, {id: 'cursor'}); assert.equal(args.skip, 1);
    return row ? [row] : [];
  }) as unknown as typeof original.list;
  const tx = {
    $queryRaw: async (sql: TemplateStringsArray, workspaceId: string) => {
      assert.equal(workspaceId, 'workspace'); assert.match(sql.join(''), /active = true AND "deletedAt" IS NULL FOR (?:UPDATE|SHARE)/);
      return active ? [{id: workspaceId}] : [];
    },
    project: {
      findFirst: async (args: {where: {id: string; terraqoWorkspaceId: string; deletedAt: null}}) => {
        assert.equal(args.where.terraqoWorkspaceId, 'workspace'); assert.equal(args.where.deletedAt, null);
        return row?.id === args.where.id ? row : null;
      },
      count: async (args: {where: unknown}) => { assert.deepEqual(args.where, {terraqoWorkspaceId: 'workspace', deletedAt: null}); return full ? 5000 : 0; },
      create: async (args: {data: Omit<Row, 'updatedAt'>}) => {
        assert.equal(args.data.isPublic, false); assert.equal(args.data.isFeatured, false); assert.equal(args.data.terraqoWorkspaceId, 'workspace');
        assert.match(args.data.slug, /^portal-[a-f0-9]{32}$/); creates++; row = {...args.data, updatedAt: new Date('2026-01-01T00:00:00Z')}; return row;
      },
      updateMany: async (args: {where: {isPublic: boolean; status: unknown; updatedAt: Date}; data: Partial<Row>}) => {
        assert.equal(args.where.isPublic, false); assert.deepEqual(args.where.status, {not: 'PUBLISHED'});
        if (stale) return {count: 0}; row = {...row!, ...args.data}; return {count: 1};
      },
    },
    activityLog: {create: async (args: {data: {actorId: string; terraqoWorkspaceId: string; projectId: string; metadata: unknown}}) => {
      assert.equal(args.data.actorId, 'user'); assert.equal(args.data.terraqoWorkspaceId, 'workspace'); assert.equal(args.data.projectId, row!.id);
      assert.deepEqual(args.data.metadata, {source: 'portal', status: row!.status});
      if (failAudit) throw new Error('Unavailable'); audits++;
    }},
  };
  prisma.$transaction = (async (operation: (client: typeof tx) => Promise<unknown>) => {
    const previous = row, previousCreates = creates;
    try { return await operation(tx); } catch (error) { row = previous; creates = previousCreates; throw error; }
  }) as unknown as typeof original.transaction;
  const token: WorkspacePortalToken = {sub: 'user', workspaceId: 'workspace', workspaceSlug: 'fixture', role: 'ADMIN', iat: 1, exp: 2};
  const fields = {title: 'Levantamiento', summary: 'Terreno urbano', description: '', location: '', category: '', servicesApplied: 'GPS\nGPS\nNivelación', status: 'PLANNING'};
  const save = (data: unknown = fields, key: string | null = 'a'.repeat(32), id?: string, version?: string) => savePortalResource(token, 'projects', data, key, id, version);
  const rejected = (status: number) => (error: unknown) => (error instanceof PortalProjectWriteError || error instanceof PortalResourceError) && error.status === status;
  try {
    const first = await save(); const replay = await save(); assert.equal(first.id, replay.id); assert.equal(creates, 1); assert.equal(audits, 1);
    assert.equal(first.editable, true); assert.equal(first.fields.servicesApplied, 'GPS\nNivelación');
    await assert.rejects(save({...fields, title: 'Other'}), rejected(409));
    const listed = await listPortalResource(token, 'projects', 'cursor'); assert.equal(listed.canCreate, true);
    await save({...fields, status: 'IN_PROGRESS'}, null, first.id, '2026-01-01T00:00:00Z'); assert.equal(audits, 2);
    stale = true; await assert.rejects(save(fields, null, first.id, '2026-01-01T00:00:00Z'), rejected(409)); stale = false;
    row!.isPublic = true; await assert.rejects(save(fields, null, first.id, '2026-01-01T00:00:00Z'), rejected(403));
    assert.equal((await listPortalResource(token, 'projects', 'cursor')).records[0].editable, false);
    row!.isPublic = false; row!.status = 'PUBLISHED'; await assert.rejects(save(fields, null, first.id, '2026-01-01T00:00:00Z'), rejected(403));
    for (const injection of [{isPublic: 'true'}, {clientId: 'foreign'}, {companyId: 'foreign'}, {slug: 'arbitrary'}, {saleId: 'foreign'}])
      await assert.rejects(save({...fields, ...injection}));
    await assert.rejects(save({...fields, status: 'PUBLISHED'}));
    await assert.rejects(save({...fields, servicesApplied: 'x'.repeat(121)}));
    await assert.rejects(save({...fields, servicesApplied: Array.from({length: 31}, (_, i) => `s${i}`).join('\n')}));
    await assert.rejects(save(fields, null), rejected(422));
    await assert.rejects(save(fields, null, 'foreign', '2026-01-01T00:00:00Z'), rejected(404));
    row = null; full = true; await assert.rejects(save(), rejected(409)); full = false;
    failAudit = true; await assert.rejects(save()); assert.equal(row, null); assert.equal(creates, 1); failAudit = false;
    active = false; await assert.rejects(save(), rejected(403)); active = true;
    enabled = false; await assert.rejects(save(), rejected(403)); enabled = true;
    for (const role of ['MEMBER', 'PROFESSIONAL', 'CLIENT', 'VIEWER'] as const) {
      await assert.rejects(savePortalResource({...token, role}, 'projects', fields, 'a'.repeat(32)), rejected(403));
      await assert.rejects(listPortalResource({...token, role}, 'projects'), rejected(403));
    }
    console.log('PASS project management: tenant lock/quota, private creation, replay/conflict, strict relations/publication, versioned edits, protected published projects, bounded services/pagination, audit rollback, role/module denial.');
  } finally {
    prisma.$transaction = original.transaction; prisma.terraqoBillingAccount.findUnique = original.billing;
    prisma.terraqoWorkspaceModule.findUnique = original.module; prisma.project.findMany = original.list; await prisma.$disconnect();
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
