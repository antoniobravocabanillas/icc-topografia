import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { guardWorkspaceMembershipChange, LastWorkspaceAdministratorError, unlinkStaffWorkspaceAccess } from "../lib/terraqo/workspace-membership-guard";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.username, "terraqo_s22_test");
  assert.equal(url.pathname, "/postgres");
  assert.equal(process.env.TERRAQO_LOCAL_S22_TEST, "synthetic-only");
  const db = new PrismaClient();
  try {
    const a = await db.user.create({ data: { email: "a@s22.invalid" } });
    const b = await db.user.create({ data: { email: "b@s22.invalid" } });
    const ws = await db.terraqoWorkspace.create({ data: { name: "Synthetic S22", slug: "s22-test" } });
    await db.terraqoWorkspaceMember.createMany({ data: [a, b].map(user => ({ workspaceId: ws.id, userId: user.id, role: "ADMIN" as const })) });
    const remove = (userId: string) => db.$transaction(async tx => {
      await guardWorkspaceMembershipChange(tx, ws.id, userId, { active: false });
      await tx.terraqoWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId: ws.id, userId } }, data: { active: false } });
    }, { timeout: 15000, isolationLevel: "ReadCommitted" });
    const results = await Promise.allSettled([remove(a.id), remove(b.id)]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    const rejected = results.find(result => result.status === "rejected");
    assert.ok(rejected?.status === "rejected" && rejected.reason instanceof LastWorkspaceAdministratorError);
    assert.equal(await db.terraqoWorkspaceMember.count({ where: { workspaceId: ws.id, active: true } }), 1);
    const remaining = await db.terraqoWorkspaceMember.findFirstOrThrow({ where: { workspaceId: ws.id, active: true } });
    await assert.rejects(db.$transaction(async tx => {
      await tx.user.update({ where: { id: remaining.userId }, data: { name: "must roll back" } });
      await guardWorkspaceMembershipChange(tx, ws.id, remaining.userId, { role: "PROFESSIONAL" });
      await tx.terraqoWorkspaceMember.update({ where: { id: remaining.id }, data: { role: "PROFESSIONAL" } });
    }), LastWorkspaceAdministratorError);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: remaining.userId } })).name, null);
    await db.$transaction(tx => guardWorkspaceMembershipChange(tx, ws.id, remaining.userId, { role: "OWNER", active: true }));
    const other = await db.terraqoWorkspace.create({ data: { name: "Other synthetic", slug: "s22-other" } });
    await db.terraqoWorkspaceMember.create({ data: { workspaceId: other.id, userId: a.id, role: "OWNER" } });
    await assert.rejects(remove(remaining.userId), LastWorkspaceAdministratorError);
    await db.$transaction(tx => guardWorkspaceMembershipChange(tx, ws.id, a.id === remaining.userId ? b.id : a.id, { active: false }));
    const staff = await db.staffProfile.create({ data: { terraqoWorkspaceId: ws.id, userId: remaining.userId, displayName: "Synthetic administrator", roleTitle: "Administrador", tools: {} } });
    await assert.rejects(db.$transaction(tx => unlinkStaffWorkspaceAccess(tx, ws.id, staff.id)), LastWorkspaceAdministratorError);
    assert.equal((await db.staffProfile.findUniqueOrThrow({ where: { id: staff.id } })).userId, remaining.userId);
    await assert.rejects(db.$transaction(tx => unlinkStaffWorkspaceAccess(tx, other.id, staff.id)), /Perfil no pertenece/);
    const alternate = remaining.userId === a.id ? b.id : a.id;
    await db.terraqoWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId: ws.id, userId: alternate } }, data: { active: true } });
    await db.$transaction(tx => unlinkStaffWorkspaceAccess(tx, ws.id, staff.id));
    assert.equal((await db.staffProfile.findUniqueOrThrow({ where: { id: staff.id } })).userId, null);
    assert.equal((await db.terraqoWorkspaceMember.findUniqueOrThrow({ where: { id: remaining.id } })).active, false);
    assert.equal(await db.user.count(), 2);
    console.log("PASS S22 real PostgreSQL: concurrent removal, demotion guard, rollback, tenant isolation, no-op, staff unlink rejection preserves link, allowed unlink preserves user.");
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "S22 test failed"); process.exitCode = 1; });
