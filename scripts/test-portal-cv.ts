import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { listPortalResource, savePortalResource, PortalResourceError } from "../lib/server/portal-resources";
import { PortalCvError } from "../lib/server/portal-cv-entries";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";

type Row = Record<string, unknown> & { id: string; professionalProfileId: string; updatedAt: Date };
async function main() {
  const original = { tx: prisma.$transaction, profile: prisma.terraqoProfessionalProfile.findUnique,
    experience: prisma.terraqoProfessionalExperience.findMany, education: prisma.terraqoProfessionalEducation.findMany,
    billing: prisma.terraqoBillingAccount.findUnique, module: prisma.terraqoWorkspaceModule.findUnique };
  const rows: Row[] = []; let audits = 0, locked = false, enabled = true, stale = false, capped = false;
  const token: WorkspacePortalToken = { sub: "user", workspaceId: "workspace", workspaceSlug: "fixture", role: "PROFESSIONAL", iat: 1, exp: 2 };
  const project = (row: Row, select: Record<string, boolean>) => Object.fromEntries(Object.keys(select).map(key => [key, row[key]]));
  const profile = async (args: { where: { userId: string } }) => ({ id: args.where.userId === "user" ? "own-profile" : "other-profile" });
  prisma.terraqoProfessionalProfile.findUnique = profile as unknown as typeof original.profile;
  prisma.terraqoBillingAccount.findUnique = (async () => null) as unknown as typeof original.billing;
  prisma.terraqoWorkspaceModule.findUnique = (async () => ({ active: enabled })) as unknown as typeof original.module;
  const delegate = {
    findFirst: async (args: { where: { id: string; professionalProfileId: string }; select: Record<string, boolean> }) => {
      const row = rows.find(row => row.id === args.where.id && row.professionalProfileId === args.where.professionalProfileId);
      return row ? project(row, args.select) : null;
    },
    findFirstOrThrow: async (args: { where: { id: string; professionalProfileId: string }; select: Record<string, boolean> }) => {
      const row = rows.find(row => row.id === args.where.id && row.professionalProfileId === args.where.professionalProfileId); assert.ok(row);
      return project(row, args.select);
    },
    findMany: async (args: { where: { professionalProfileId: string }; take: number; select: Record<string, boolean> }) => {
      assert.ok([31, 501].includes(args.take));
      return rows.filter(row => row.professionalProfileId === args.where.professionalProfileId).slice(0, args.take).map(row => project(row, args.select));
    },
    count: async () => capped ? 200 : rows.length,
    create: async (args: { data: Row }) => {
      assert.ok(locked); assert.equal(args.data.visibility, "PRIVATE"); assert.equal(args.data.verificationStatus, "NOT_REQUESTED");
      assert.ok(!("projectId" in args.data) && !("workspaceId" in args.data));
      const row = { ...args.data, updatedAt: new Date("2026-01-01T00:00:00Z") }; rows.push(row); return row;
    },
    updateMany: async (args: { where: { id: string; professionalProfileId: string; updatedAt: Date; verificationStatus: { in: string[] }; verifiedByTerraqo?: boolean }; data: Record<string, unknown> }) => {
      assert.ok(locked); assert.deepEqual(args.where.verificationStatus.in, ["NOT_REQUESTED", "REJECTED"]);
      assert.equal(args.data.verificationStatus, "NOT_REQUESTED"); assert.ok(!("visibility" in args.data));
      if ("currentlyWorking" in args.data) assert.equal(args.where.verifiedByTerraqo, false);
      if (stale) return { count: 0 };
      const row = rows.find(row => row.id === args.where.id && row.professionalProfileId === args.where.professionalProfileId);
      assert.ok(row); Object.assign(row, args.data); return { count: 1 };
    },
  };
  prisma.terraqoProfessionalExperience.findMany = delegate.findMany as unknown as typeof original.experience;
  prisma.terraqoProfessionalEducation.findMany = delegate.findMany as unknown as typeof original.education;
  const tx = { terraqoProfessionalProfile: { findUnique: profile, update: async (args: { data: Record<string, unknown> }) => {
    assert.ok(locked); assert.equal(args.data.generatedSummary, null); assert.equal(args.data.generatedSummaryUpdatedAt, null);
    if (args.data.yearsExperience !== undefined) assert.equal(args.data.yearsExperience, 2);
  } }, terraqoProfessionalExperience: delegate, terraqoProfessionalEducation: delegate,
    $queryRaw: async (_query: TemplateStringsArray, id: string) => { assert.ok(["own-profile", "other-profile"].includes(id)); locked = true; return []; },
    activityLog: { create: async (args: { data: { actorId: string; terraqoWorkspaceId: string; metadata: unknown } }) => {
      assert.equal(args.data.actorId, "user"); assert.equal(args.data.terraqoWorkspaceId, "workspace"); audits++;
    } },
  };
  prisma.$transaction = (async (operation: (client: typeof tx) => Promise<unknown>) => { locked = false; return operation(tx); }) as unknown as typeof original.tx;
  const denied = (status: number) => (error: unknown) => (error instanceof PortalCvError || error instanceof PortalResourceError) && error.status === status;
  const fields = { title: "Levantamiento", companyName: "Empresa", role: "Topógrafo", summary: "Actividad declarada", startedAt: "2020-01-01", endedAt: "2021-12-31", currentlyWorking: "false" };
  try {
    const saved = await savePortalResource(token, "experiences", fields, "a".repeat(32));
    assert.ok(saved); assert.equal(saved.fields.startedAt, fields.startedAt); assert.equal(saved.fields.visibility, "PRIVATE");
    const replay = await savePortalResource(token, "experiences", fields, "a".repeat(32)); assert.equal(replay?.id, saved.id); assert.equal(rows.length, 1); assert.equal(audits, 1);
    await assert.rejects(savePortalResource(token, "experiences", { ...fields, title: "Other" }, "a".repeat(32)), denied(409));
    await assert.rejects(savePortalResource(token, "experiences", { ...fields, verifiedByTerraqo: "true" }, "b".repeat(32)));
    for (const input of [{ ...fields, endedAt: "2019-01-01" }, { ...fields, endedAt: "" }, { ...fields, currentlyWorking: "true" }, { ...fields, startedAt: "2025-02-30" }])
      await assert.rejects(savePortalResource(token, "experiences", input, "b".repeat(32)));
    await assert.rejects(savePortalResource({ ...token, sub: "other-user" }, "experiences", fields, null, saved.id, saved.updatedAt), denied(404));
    stale = true; await assert.rejects(savePortalResource(token, "experiences", fields, null, saved.id, saved.updatedAt), denied(409)); stale = false;
    for (const changes of [{ verificationStatus: "APPROVED" }, { verificationStatus: "REQUESTED" }, { projectId: "project" }, { workspaceId: "workspace" }, { verifiedByTerraqo: true }]) {
      Object.assign(rows[0], changes);
      assert.equal((await listPortalResource(token, "experiences")).records[0].editable, false);
      await assert.rejects(savePortalResource(token, "experiences", fields, null, saved.id, saved.updatedAt), denied(403));
      Object.assign(rows[0], { verificationStatus: "NOT_REQUESTED", projectId: null, workspaceId: null, verifiedByTerraqo: false });
    }
    await savePortalResource(token, "experiences", fields, null, saved.id, saved.updatedAt); assert.equal(audits, 2);
    capped = true; await assert.rejects(savePortalResource(token, "experiences", fields, "b".repeat(32)), denied(422)); capped = false;
    const academic = { institution: "Instituto", degree: "Geomática", field: "Topografía", startedAt: "2022-01-01", endedAt: "2023-12-31", currentlyStudying: "false" };
    const education = await savePortalResource(token, "education", academic, "c".repeat(32)); assert.ok(education);
    assert.equal(education.title, "Geomática"); assert.equal(education.fields.visibility, "PRIVATE");
    assert.equal((await savePortalResource(token, "education", academic, "c".repeat(32)))?.id, education.id);
    for (const role of ["ADMIN", "MEMBER", "CLIENT", "VIEWER"] as const) await assert.rejects(listPortalResource({ ...token, role }, "education"), denied(403));
    enabled = false; await assert.rejects(listPortalResource(token, "experiences"), denied(403));
    console.log("PASS CV: personal ownership, role/module gates, protected reviews, date validation, private/idempotent creation, conflicts, limits, derived data and transaction audit.");
  } finally {
    prisma.$transaction = original.tx; prisma.terraqoProfessionalProfile.findUnique = original.profile;
    prisma.terraqoProfessionalExperience.findMany = original.experience; prisma.terraqoProfessionalEducation.findMany = original.education;
    prisma.terraqoBillingAccount.findUnique = original.billing; prisma.terraqoWorkspaceModule.findUnique = original.module; await prisma.$disconnect();
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
