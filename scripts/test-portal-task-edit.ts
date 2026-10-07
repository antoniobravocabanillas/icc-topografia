import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { savePortalResource, PortalResourceError } from "../lib/server/portal-resources";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";

async function main() {
  const original = { transaction: prisma.$transaction, billing: prisma.terraqoBillingAccount.findUnique, module: prisma.terraqoWorkspaceModule.findUnique };
  let enabled = true, visible = true, stale = false, active = true;
  let audits = 0, transactions = 0;
  let row = { id: "task", title: "Fixture", description: "", status: "TODO", projectId: "project", dueDate: null as Date | null, assignedProfileId: null as string | null,
    assignedProfile: null as {displayName: string; terraqoWorkspaceId: string} | null,
    completedAt: null as Date | null, updatedAt: new Date("2026-01-01T00:00:00Z") };
  prisma.terraqoBillingAccount.findUnique = (async () => null) as unknown as typeof original.billing;
  prisma.terraqoWorkspaceModule.findUnique = (async () => ({ active: enabled })) as unknown as typeof original.module;
  const expected = { id: "task", deletedAt: null, project: { terraqoWorkspaceId: "workspace", deletedAt: null } };
  const tx = { $queryRaw: async (query: TemplateStringsArray, profileId: string, workspaceId: string) => {
    if (query.join('').includes('"Project"')) {
      assert.equal(profileId, 'project'); assert.equal(workspaceId, 'workspace'); return [{id:'project'}];
    }
    assert.ok(query.join('').includes('active = true FOR SHARE'));
    assert.equal(workspaceId, 'workspace'); assert.equal(profileId, 'person');
    return active ? [{id: 'person'}] : [];
  }, task: {
    findFirst: async (args: { where: unknown }) => { assert.deepEqual(args.where, expected); return visible ? row : null; },
    updateMany: async (args: { where: { updatedAt: Date }; data: Partial<typeof row> }) => {
      assert.deepEqual(args.where, { ...expected, updatedAt: new Date("2026-01-01T00:00:00Z") });
      if (stale) return { count: 0 };
      row = { ...row, ...args.data }; return { count: 1 };
    },
  }, activityLog: { create: async (args: { data: { actorId: string; terraqoWorkspaceId: string; taskId: string; metadata: unknown } }) => {
    assert.equal(args.data.actorId, "user"); assert.equal(args.data.terraqoWorkspaceId, "workspace");
    assert.equal(args.data.taskId, "task"); audits++; return {};
  } } };
  prisma.$transaction = (async (operation: (client: typeof tx) => Promise<unknown>) => { transactions++; return operation(tx); }) as unknown as typeof original.transaction;
  const token: WorkspacePortalToken = { sub: "user", workspaceId: "workspace", workspaceSlug: "fixture", role: "ADMIN", iat: 1, exp: 2 };
  const fields = { title: "Visit", description: "Coordinate", status: "DONE" };
  const save = (data: unknown = fields) => savePortalResource(token, "tasks", data, null, "task", "2026-01-01T00:00:00Z");
  const rejected = (status: number) => (error: unknown) => error instanceof PortalResourceError && error.status === status;
  try {
    const done = await save(); assert.equal(done.status, "DONE"); assert.equal(done.editable, true);
    assert.ok(row.completedAt instanceof Date); const completed = row.completedAt;
    await save(); assert.equal(row.completedAt, completed, "Further edits must preserve completion time.");
    await save({ ...fields, status: "IN_PROGRESS" }); assert.equal(row.completedAt, null);
    assert.equal(audits, 3);
    stale = true; await assert.rejects(save(), rejected(409)); assert.equal(audits, 3);
    stale = false; visible = false; await assert.rejects(save(), rejected(404)); assert.equal(audits, 3);
    visible = true; await assert.rejects(save({ ...fields, projectId: "foreign" }));
    await assert.rejects(savePortalResource(token, "tasks", fields, "a".repeat(32)));
    await save({...fields, assignedProfileId: 'person', dueDate: '2027-01-15'});
    assert.equal(row.assignedProfileId, 'person'); assert.equal(row.dueDate?.toISOString(), '2027-01-15T00:00:00.000Z');
    row.assignedProfile = {displayName: 'Surveyor', terraqoWorkspaceId: 'workspace'};
    const retained = await save();
    assert.equal(retained.fields.assignedProfileName, 'Surveyor'); assert.equal(retained.fields.assignedProfileId, 'person');
    assert.equal(retained.fields.dueDate, '2027-01-15'); assert.ok(!('assignedProfile' in retained.fields));
    row.assignedProfile = {displayName: 'Private other tenant', terraqoWorkspaceId: 'foreign'};
    const hidden = await save(); assert.equal(hidden.fields.assignedProfileName, ''); assert.equal(hidden.fields.assignedProfileId, '');
    await save({...fields, assignedProfileId: '', dueDate: ''});
    assert.equal(row.assignedProfileId, null); assert.equal(row.dueDate, null);
    active = false; await assert.rejects(save({...fields, assignedProfileId: 'person'}), rejected(422));
    assert.equal(row.assignedProfileId, null);
    for (const dueDate of ['2027-02-29', '2101-01-01']) await assert.rejects(save({...fields, dueDate}));
    const before = transactions;
    enabled = false; await assert.rejects(save(), rejected(403)); enabled = true;
    await assert.rejects(savePortalResource({ ...token, role: "MEMBER" }, "tasks", fields, null, "task", "2026-01-01T00:00:00Z"), rejected(403));
    assert.equal(transactions, before);
    console.log("PASS task edits: authorized tenant transaction, audit, completion timestamp, reopening, stale versions, opaque missing tasks and disabled modules.");
  } finally {
    prisma.$transaction = original.transaction; prisma.terraqoBillingAccount.findUnique = original.billing;
    prisma.terraqoWorkspaceModule.findUnique = original.module; await prisma.$disconnect();
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
