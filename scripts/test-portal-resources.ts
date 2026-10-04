import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { listPortalResource, savePortalResource, PortalResourceError } from "../lib/server/portal-resources";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";

async function main() {
  const original = { billing: prisma.terraqoBillingAccount.findUnique, module: prisma.terraqoWorkspaceModule.findUnique,
    clients: prisma.client.findMany, find: prisma.client.findFirst, create: prisma.client.create, update: prisma.client.updateMany,
    notes: prisma.terraqoPrivateNote.findMany, notification: prisma.notification.findMany, files: prisma.terraqoWorkspaceFile.findMany,
    notificationUpdate: prisma.notification.updateMany, notificationFind: prisma.notification.findFirst };
  let enabled = true, versionMatches = true;
  let queries = 0, creations = 0;
  let saved: Record<string, unknown> | null = null;
  prisma.terraqoBillingAccount.findUnique = (async () => null) as unknown as typeof original.billing;
  prisma.terraqoWorkspaceModule.findUnique = (async () => ({ active: enabled })) as unknown as typeof original.module;
  prisma.client.findMany = (async (args: { where: unknown; take: number }) => {
    queries++; assert.deepEqual(args.where, { terraqoWorkspaceId: "workspace", deletedAt: null }); assert.equal(args.take, 31);
    return [];
  }) as unknown as typeof original.clients;
  prisma.client.findFirst = (async (args: { where: Record<string, unknown> }) => {
    assert.equal(args.where.terraqoWorkspaceId, "workspace"); assert.equal(args.where.deletedAt, null);
    return saved;
  }) as unknown as typeof original.find;
  prisma.client.create = (async (args: { data: Record<string, unknown> }) => {
    creations++; assert.equal(args.data.terraqoWorkspaceId, "workspace"); assert.match(String(args.data.id), /^[a-f0-9]{32}$/);
    saved = { ...args.data, updatedAt: new Date("2026-01-01T00:00:00Z") }; return saved;
  }) as unknown as typeof original.create;
  prisma.client.updateMany = (async (args: { where: { terraqoWorkspaceId: string; updatedAt: Date } }) => {
    assert.equal(args.where.terraqoWorkspaceId, "workspace"); assert.equal(args.where.updatedAt.toISOString(), "2026-01-01T00:00:00.000Z");
    return { count: versionMatches ? 1 : 0 };
  }) as unknown as typeof original.update;
  prisma.terraqoPrivateNote.findMany = (async (args: { where: unknown }) => {
    assert.deepEqual(args.where, { workspaceId: "workspace", userId: "user", kind: "SIMPLE" }); return [];
  }) as unknown as typeof original.notes;
  prisma.notification.findMany = (async (args: { where: unknown }) => {
    assert.deepEqual(args.where, { terraqoWorkspaceId: "workspace", userId: "user" }); return [];
  }) as unknown as typeof original.notification;
  prisma.terraqoWorkspaceFile.findMany = (async (args: { where: { workspaceId: string; OR: unknown[] }; select: { userId: boolean } }) => {
    assert.equal(args.where.workspaceId, "workspace"); assert.equal(args.select.userId, true);
    const own = { id: "own-file", title: "Own", userId: "user", visibility: "PRIVATE", updatedAt: new Date() };
    const shared = { id: "shared-file", title: "Shared", userId: "another-user", visibility: "WORKSPACE", updatedAt: new Date() };
    return args.where.OR.length === 1 ? [own] : [own, shared];
  }) as unknown as typeof original.files;
  const token: WorkspacePortalToken = { sub: "user", workspaceId: "workspace", workspaceSlug: "fixture", role: "ADMIN", iat: 1, exp: 2 };
  const forbidden = (status: number) => (error: unknown) => error instanceof PortalResourceError && error.status === status;
  let readAt: Date | null = null;
  prisma.notification.updateMany = (async (args: { where: Record<string, unknown>; data: { readAt: Date } }) => {
    assert.deepEqual(args.where, { id: "notice", userId: "user", terraqoWorkspaceId: "workspace", readAt: null });
    if (readAt) return { count: 0 };
    readAt = args.data.readAt; return { count: 1 };
  }) as unknown as typeof original.notificationUpdate;
  prisma.notification.findFirst = (async (args: { where: Record<string, unknown> }) => {
    assert.deepEqual(args.where, { id: "notice", userId: "user", terraqoWorkspaceId: "workspace" });
    return { id: "notice", title: "Aviso", body: "Detalle", readAt, createdAt: new Date("2026-01-01") };
  }) as unknown as typeof original.notificationFind;
  try {
    await listPortalResource(token, "clients");
    const before = queries;
    for (const role of ["CLIENT", "PROFESSIONAL", "MEMBER", "VIEWER"] as const)
      await assert.rejects(listPortalResource({ ...token, role }, "clients"), forbidden(403));
    enabled = false; await assert.rejects(listPortalResource(token, "clients"), forbidden(403)); enabled = true;
    assert.equal(queries, before);
    await listPortalResource({ ...token, role: "MEMBER" }, "notes");
    await listPortalResource({ ...token, role: "MEMBER" }, "notifications");
    const read = await savePortalResource(token, "notifications", { action: "READ" }, null, "notice");
    const repeated = await savePortalResource(token, "notifications", { action: "READ" }, null, "notice");
    assert.equal(read.status, "READ"); assert.equal(read.fields.readAt, repeated.fields.readAt);
    assert.equal(read.editable, false);
    await assert.rejects(savePortalResource(token, "notifications", { action: "READ", userId: "other" }, null, "notice"));
    await assert.rejects(savePortalResource(token, "notifications", { action: "UNREAD" }, null, "notice"));
    await assert.rejects(savePortalResource(token, "notifications", { action: "READ" }, null), forbidden(422));
    prisma.notification.findFirst = (async () => null) as unknown as typeof original.notificationFind;
    await assert.rejects(savePortalResource(token, "notifications", { action: "READ" }, null, "notice"), forbidden(404));
    const files = await listPortalResource(token, "files");
    assert.equal(files.records[0].canDelete, true); assert.equal(files.records[1].canDelete, false);
    assert.ok(files.records.every(file => !("userId" in file.fields)), "Internal owner IDs are not part of the public field contract.");
    assert.equal((await listPortalResource({ ...token, role: "MEMBER" }, "files")).records.length, 1);
    const fields = { name: "Fixture", email: "fixture@example.test", company: "", phone: "", status: "activo" };
    const key = "a".repeat(32);
    const first = await savePortalResource(token, "clients", fields, key);
    const replay = await savePortalResource(token, "clients", fields, key);
    assert.equal(first.id, replay.id); assert.equal(creations, 1);
    await assert.rejects(savePortalResource(token, "clients", { ...fields, name: "Changed" }, key), forbidden(409));
    await assert.rejects(savePortalResource(token, "clients", { ...fields, terraqoWorkspaceId: "foreign" }, key));
    versionMatches = false;
    await assert.rejects(savePortalResource(token, "clients", fields, null, first.id, "2026-01-01T00:00:00Z"), forbidden(409));
    await assert.rejects(savePortalResource(token, "clients", fields, null, first.id), forbidden(409));
    await assert.rejects(savePortalResource(token, "orders", { total: "1" }, key), forbidden(403));
    console.log("PASS resource gateway: tenant and owner boundaries, module denial, bounded reads, idempotent creation, conflicting payload and stale write rejection; financial writes denied.");
  } finally {
    prisma.terraqoBillingAccount.findUnique = original.billing; prisma.terraqoWorkspaceModule.findUnique = original.module;
    prisma.client.findMany = original.clients; prisma.client.findFirst = original.find; prisma.client.create = original.create; prisma.client.updateMany = original.update;
    prisma.terraqoPrivateNote.findMany = original.notes; prisma.notification.findMany = original.notification;
    prisma.terraqoWorkspaceFile.findMany = original.files;
    prisma.notification.updateMany = original.notificationUpdate; prisma.notification.findFirst = original.notificationFind;
    await prisma.$disconnect();
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
