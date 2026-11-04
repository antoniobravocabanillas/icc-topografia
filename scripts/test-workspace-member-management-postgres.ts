import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { changeWorkspaceMember, WorkspaceMemberManagementError } from "../lib/terraqo/workspace-member-management";
import { LastWorkspaceAdministratorError } from "../lib/terraqo/workspace-membership-guard";
import { workspaceMemberHandler } from "../lib/server/workspace-member-http";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.username, "terraqo_s22_test");
  assert.equal(process.env.TERRAQO_LOCAL_S22_TEST, "synthetic-only");
  const db = new PrismaClient();
  try {
    const ws = await db.terraqoWorkspace.create({ data: { name: "Management test", slug: "management-test" } });
    const other = await db.terraqoWorkspace.create({ data: { name: "Other management", slug: "management-other" } });
    const make = async (name: string, role: "OWNER" | "ADMIN" | "MANAGER" | "VIEWER", workspaceId = ws.id) => {
      const user = await db.user.create({ data: { email: `${name}@management.invalid` } });
      return db.terraqoWorkspaceMember.create({ data: { userId: user.id, workspaceId, role } });
    };
    const owner = await make("owner", "OWNER"), admin = await make("admin", "ADMIN"), manager = await make("manager", "MANAGER"), viewer = await make("viewer", "VIEWER"), foreign = await make("foreign", "VIEWER", other.id);
    const input = (member: typeof viewer, role: "ADMIN" | "MANAGER" | "VIEWER" | "MEMBER" = "MEMBER", active = true) => ({ workspaceId: ws.id, memberId: member.id, role, active, expectedUpdatedAt: member.updatedAt.toISOString() });
    const denied = (promise: Promise<unknown>, status = 403) => assert.rejects(promise, (e: unknown) => e instanceof WorkspaceMemberManagementError && e.status === status);
    await denied(changeWorkspaceMember(db, viewer.userId, input(viewer, "ADMIN")));
    await denied(changeWorkspaceMember(db, manager.userId, input(viewer, "ADMIN")));
    await denied(changeWorkspaceMember(db, admin.userId, input(owner, "VIEWER")));
    await denied(changeWorkspaceMember(db, admin.userId, input(foreign)), 404);
    const first = await changeWorkspaceMember(db, owner.userId, input(viewer));
    assert.equal(first.role, "MEMBER");
    assert.equal((await changeWorkspaceMember(db, owner.userId, input(viewer))).replayed, true);
    await denied(changeWorkspaceMember(db, owner.userId, input(viewer, "ADMIN")), 409);
    assert.equal(await db.activityLog.count({ where: { terraqoWorkspaceId: ws.id } }), 1);
    const fresh = await db.terraqoWorkspaceMember.findUniqueOrThrow({ where: { id: viewer.id } });
    const race = await Promise.allSettled([changeWorkspaceMember(db, owner.userId, input(fresh, "ADMIN")), changeWorkspaceMember(db, owner.userId, input(fresh, "VIEWER"))]);
    assert.equal(race.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(race.filter(r => r.status === "rejected").length, 1);
    const one = await make("last-admin", "ADMIN", other.id);
    await assert.rejects(changeWorkspaceMember(db, one.userId, { ...input(one, "VIEWER"), workspaceId: other.id }), LastWorkspaceAdministratorError);
    assert.equal(await db.activityLog.count({ where: { terraqoWorkspaceId: other.id } }), 0);
    const suspended = await changeWorkspaceMember(db, owner.userId, input(manager, "MANAGER", false));
    assert.equal(suspended.active, false);
    await denied(changeWorkspaceMember(db, manager.userId, input(admin, "VIEWER")));
    assert.ok(await db.user.findUnique({ where: { id: manager.userId } }));
    let actorId: string | null = owner.userId, enabled = true;
    const handler = workspaceMemberHandler({ db, actor: async () => actorId, enabled: () => enabled });
    const request = (body: unknown, origin = "https://workspace.invalid") => new Request("https://workspace.invalid/api/terraqo/workspace-members", { method: "PATCH", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
    enabled = false; assert.equal((await handler(request(input(admin)))).status, 404); enabled = true;
    actorId = null; assert.equal((await handler(request(input(admin)))).status, 401); actorId = owner.userId;
    assert.equal((await handler(request(input(admin), "https://other.invalid"))).status, 403);
    assert.equal((await handler(request({ ...input(admin), actorId: owner.userId }))).status, 422);
    assert.equal((await handler(request({ payload: "x".repeat(5000) }))).status, 413);
    const saved = await handler(request(input(admin)));
    assert.equal(saved.status, 200); assert.equal(saved.headers.get("cache-control"), "private, no-store");
    assert.equal((await saved.json()).role, "MEMBER");
    console.log("PASS S22 member management: hierarchy, ownership, tenant isolation, stale forms, concurrent updates, retry without duplicate audit, last-admin rollback, suspended actor, bounded authenticated HTTP contract. No real session used.");
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Test failed"); process.exitCode = 1; });
