import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { savePortalResource, listPortalResource, PortalResourceError } from "../lib/server/portal-resources";
import { PortalTaskCreateError } from "../lib/server/portal-task-create";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";

async function main() {
  const original = { transaction: prisma.$transaction, billing: prisma.terraqoBillingAccount.findUnique,
    module: prisma.terraqoWorkspaceModule.findUnique, projects: prisma.project.findMany };
  let enabled = true, visible = true, full = false, failAudit = false, created = 0, audited = 0;
  type Row = { id: string; projectId: string; title: string; description: string; status: string; completedAt: Date | null; dueDate: null; updatedAt: Date };
  let saved: Row | null = null;
  prisma.terraqoBillingAccount.findUnique = (async () => null) as unknown as typeof original.billing;
  prisma.terraqoWorkspaceModule.findUnique = (async () => ({ active: enabled })) as unknown as typeof original.module;
  prisma.project.findMany = (async (args: { take: number; where: unknown; cursor?: unknown; skip?: number }) => {
    assert.equal(args.take, 31); assert.deepEqual(args.where, { terraqoWorkspaceId: "workspace", deletedAt: null });
    if (args.cursor) { assert.deepEqual(args.cursor, { id: "cursor" }); assert.equal(args.skip, 1); }
    return [];
  }) as unknown as typeof original.projects;
  const tx = {
    $queryRaw: async (_query: TemplateStringsArray, projectId: string, workspaceId: string) => {
      assert.equal(projectId, "project"); assert.equal(workspaceId, "workspace"); return visible ? [{ id: "project" }] : [];
    },
    task: {
      findFirst: async (args: { where: { project: unknown } }) => {
        assert.deepEqual(args.where.project, { terraqoWorkspaceId: "workspace", deletedAt: null }); return saved;
      },
      count: async (args: { where: unknown }) => { assert.deepEqual(args.where, { projectId: "project", deletedAt: null }); return full ? 5000 : 0; },
      create: async (args: { data: Omit<Row, "dueDate" | "updatedAt"> }) => {
        created++; saved = { ...args.data, dueDate: null, updatedAt: new Date() }; return saved;
      },
    },
    activityLog: { create: async (args: { data: { actorId: string; terraqoWorkspaceId: string; action: string; taskId: string } }) => {
      assert.equal(args.data.actorId, "user"); assert.equal(args.data.terraqoWorkspaceId, "workspace");
      assert.equal(args.data.taskId, saved!.id); assert.equal(args.data.action, "CREATED");
      if (failAudit) throw new Error("Audit unavailable"); audited++; return {};
    } },
  };
  prisma.$transaction = (async (operation: (client: typeof tx) => Promise<unknown>) => {
    const before = saved, count = created;
    try { return await operation(tx); } catch (error) { saved = before; created = count; throw error; }
  }) as unknown as typeof original.transaction;
  const token: WorkspacePortalToken = { sub: "user", workspaceId: "workspace", workspaceSlug: "fixture", role: "ADMIN", iat: 1, exp: 2 };
  const fields = { projectId: "project", title: "Visita", description: "Coordinar", status: "DONE" };
  const rejected = (status: number) => (error: unknown) => (error instanceof PortalTaskCreateError || error instanceof PortalResourceError) && error.status === status;
  try {
    await listPortalResource(token, "taskProjects", "cursor");
    const first = await savePortalResource(token, "tasks", fields, "a".repeat(32));
    const replay = await savePortalResource(token, "tasks", fields, "a".repeat(32));
    assert.equal(first.id, replay.id); assert.equal(created, 1); assert.equal(audited, 1);
    assert.ok(first.fields.completedAt); assert.ok(!("projectId" in first.fields));
    await assert.rejects(savePortalResource(token, "tasks", { ...fields, title: "Other" }, "a".repeat(32)), rejected(409));
    await assert.rejects(savePortalResource(token, "tasks", { ...fields, assignedProfileId: "other" }, "a".repeat(32)));
    await assert.rejects(savePortalResource(token, "tasks", fields, null), rejected(422));
    visible = false; await assert.rejects(savePortalResource(token, "tasks", fields, "a".repeat(32)), rejected(404)); visible = true;
    saved = null; full = true; await assert.rejects(savePortalResource(token, "tasks", fields, "a".repeat(32)), rejected(409)); full = false;
    failAudit = true; await assert.rejects(savePortalResource(token, "tasks", fields, "a".repeat(32))); assert.equal(saved, null); assert.equal(created, 1);
    enabled = false; await assert.rejects(savePortalResource(token, "tasks", fields, "a".repeat(32)), rejected(403)); enabled = true;
    for (const role of ["MEMBER", "CLIENT", "PROFESSIONAL", "VIEWER"] as const) {
      await assert.rejects(savePortalResource({ ...token, role }, "tasks", fields, "a".repeat(32)), rejected(403));
      await assert.rejects(listPortalResource({ ...token, role }, "taskProjects"), rejected(403));
    }
    console.log("PASS task creation: scoped project pagination/lock, quota, replay/conflict, strict fields, atomic audit failure and role/module rejection.");
  } finally {
    prisma.$transaction = original.transaction; prisma.project.findMany = original.projects;
    prisma.terraqoBillingAccount.findUnique = original.billing; prisma.terraqoWorkspaceModule.findUnique = original.module;
    await prisma.$disconnect();
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
