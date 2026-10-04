import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { listPortalResource, savePortalResource, PortalResourceError } from "../lib/server/portal-resources";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";

async function main() {
  const original = { billing: prisma.terraqoBillingAccount.findUnique, module: prisma.terraqoWorkspaceModule.findUnique,
    clients: prisma.client.findMany, find: prisma.client.findFirst, create: prisma.client.create, update: prisma.client.updateMany,
    notes: prisma.terraqoPrivateNote.findMany, notification: prisma.notification.findMany };
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
  const token: WorkspacePortalToken = { sub: "user", workspaceId: "workspace", workspaceSlug: "fixture", role: "ADMIN", iat: 1, exp: 2 };
  const forbidden = (status: number) => (error: unknown) => error instanceof PortalResourceError && error.status === status;
  try {
    await listPortalResource(token, "clients");
    const before = queries;
    for (const role of ["CLIENT", "PROFESSIONAL", "MEMBER", "VIEWER"] as const)
      await assert.rejects(listPortalResource({ ...token, role }, "clients"), forbidden(403));
    enabled = false; await assert.rejects(listPortalResource(token, "clients"), forbidden(403)); enabled = true;
    assert.equal(queries, before);
    await listPortalResource({ ...token, role: "MEMBER" }, "notes");
    await listPortalResource({ ...token, role: "MEMBER" }, "notifications");
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
    await prisma.$disconnect();
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
