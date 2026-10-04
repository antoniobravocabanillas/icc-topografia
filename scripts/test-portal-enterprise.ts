import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { getPortalEnterpriseSummary } from "../lib/server/portal-enterprise-summary";

async function main() {
  const originals = {
    billing: prisma.terraqoBillingAccount.findUnique,
    module: prisma.terraqoWorkspaceModule.findUnique,
    memberCount: prisma.terraqoWorkspaceMember.count,
    members: prisma.terraqoWorkspaceMember.findMany,
    projectCount: prisma.project.count, projects: prisma.project.findMany,
    clientCount: prisma.client.count, clients: prisma.client.findMany,
  };
  let enabled = true;
  let privateQueries = 0;
  const counts = (tenantKey: string, count: number, restricted = false) => async (args: { where: Record<string, unknown> }) => {
    assert.equal(args.where[tenantKey], "fixture-workspace");
    if (restricted) { privateQueries++; assert.equal(args.where.deletedAt, null); }
    else assert.equal(args.where.active, true);
    return count;
  };
  const records = (tenantKey: string, rows: unknown[], restricted = false) => async (args: { where: Record<string, unknown>; take: number; orderBy: unknown }) => {
    assert.equal(args.where[tenantKey], "fixture-workspace");
    assert.equal(args.take, 20);
    assert.ok(args.orderBy);
    if (restricted) { privateQueries++; assert.equal(args.where.deletedAt, null); }
    return rows;
  };
  prisma.terraqoBillingAccount.findUnique = (async (args: { where: unknown }) => {
    assert.deepEqual(args.where, { ownerKey_mode: { ownerKey: "workspace:fixture-workspace", mode: "live" } });
    return null;
  }) as unknown as typeof originals.billing;
  prisma.terraqoWorkspaceModule.findUnique = (async (args: { where: { workspaceId_code: { workspaceId: string; code: string } } }) => {
    assert.equal(args.where.workspaceId_code.workspaceId, "fixture-workspace");
    assert.ok(["PROJECTS", "CRM"].includes(args.where.workspaceId_code.code));
    return { active: enabled };
  }) as unknown as typeof originals.module;
  prisma.terraqoWorkspaceMember.count = counts("workspaceId", 1) as unknown as typeof originals.memberCount;
  prisma.terraqoWorkspaceMember.findMany = records("workspaceId", [{ id: "member-1", role: "OWNER", title: null, user: { name: "Fixture" } }]) as unknown as typeof originals.members;
  prisma.project.count = counts("terraqoWorkspaceId", 1, true) as unknown as typeof originals.projectCount;
  prisma.project.findMany = records("terraqoWorkspaceId", [{ id: "project-1", title: "Fixture", status: "ACTIVE", location: null }], true) as unknown as typeof originals.projects;
  prisma.client.count = counts("terraqoWorkspaceId", 1, true) as unknown as typeof originals.clientCount;
  prisma.client.findMany = records("terraqoWorkspaceId", [{ id: "client-1", name: "Fixture", company: null, status: "ACTIVE" }], true) as unknown as typeof originals.clients;
  try {
    const summary = await getPortalEnterpriseSummary("fixture-workspace");
    assert.equal(summary.schemaVersion, 1);
    assert.equal(summary.projects.length, 1);
    assert.equal(summary.clients.length, 1);
    assert.equal(privateQueries, 4);
    enabled = false;
    const disabled = await getPortalEnterpriseSummary("fixture-workspace");
    assert.deepEqual(disabled.capabilities, { projects: false, crm: false });
    assert.equal(disabled.projectCount, null);
    assert.equal(disabled.clientCount, null);
    assert.deepEqual(disabled.projects, []);
    assert.deepEqual(disabled.clients, []);
    assert.equal(privateQueries, 4, "Disabled modules must not even query their data.");
    console.log("PASS: enterprise overview scopes every query, caps records and skips data for disabled modules.");
  } finally {
    prisma.terraqoBillingAccount.findUnique = originals.billing;
    prisma.terraqoWorkspaceModule.findUnique = originals.module;
    prisma.terraqoWorkspaceMember.count = originals.memberCount;
    prisma.terraqoWorkspaceMember.findMany = originals.members;
    prisma.project.count = originals.projectCount; prisma.project.findMany = originals.projects;
    prisma.client.count = originals.clientCount; prisma.client.findMany = originals.clients;
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
