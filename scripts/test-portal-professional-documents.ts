import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { listPortalResource, authorizeResource, PortalResourceError } from "../lib/server/portal-resources";
import { removeProfessionalDocument } from "../lib/server/portal-professional-documents";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";

async function main() {
  const token: WorkspacePortalToken = { sub: "owner", workspaceId: "workspace", workspaceSlug: "fixture", role: "PROFESSIONAL", iat: 1, exp: 2 };
  const original = { docs: prisma.terraqoProfessionalDocument.findMany, transaction: prisma.$transaction,
    module: prisma.terraqoWorkspaceModule.findUnique, billing: prisma.terraqoBillingAccount.findUnique };
  const date = new Date("2026-10-01T00:00:00Z");
  let state = "REJECTED", type = "CV", imports = 0, present = true, deletes = 0, refunds = 0, audits = 0;
  let retained = false;
  let cleanupState = "PENDING", enabled = true;
  const listedDocuments = Array.from({length: 34}, (_, i) => ({
    id: `doc-${String(i).padStart(2, "0")}`, type: i === 2 ? "DNI_FRONT" : [11, 13, 15].includes(i) ? "OTHER" : "CV",
    fileName: "private.pdf", contentType: "application/pdf", size: 100,
    reviewStatus: [1, 5, 7, 12].includes(i) ? "VERIFIED" : [10, 30].includes(i) ? "SUBMITTED" : "REJECTED",
    reviewNote: [4, 12, 13].includes(i) ? "Documento reemplazado por una carga posterior." : "Private reviewer note",
    uploadedAt: date, reviewedAt: null, withdrawnAt: [5, 30, 31].includes(i) ? date : null,
    replacesDocumentId: i === 6 ? "doc-07" : i === 14 ? "doc-10" : i === 15 ? "doc-11" : null,
    replacedByDocument: i === 7 ? {id: "doc-06"} : i === 10 ? {id: "doc-14"} : i === 11 ? {id: "doc-15"} : null,
    _count: {cvImports: i === 3 ? 1 : 0, replacementAttempts: i === 8 ? 1 : 0, resultingAttempts: i === 9 ? 1 : 0},
  }));
  const tx = {
    $queryRaw: async (query: Prisma.Sql) => { assert.ok(query.values.includes("owner") || query.values.includes("profile")); return [{ id: "profile" }]; },
    terraqoExperienceEvidence:{aggregate:async()=>({_sum:{size:0}})},
    terraqoEducationEvidence:{aggregate:async()=>({_sum:{size:0}})},
    terraqoDocumentReplacementAttempt:{aggregate:async()=>({_sum:{reservedUnits:0}})},
    terraqoEducationEvidenceAttempt:{aggregate:async()=>({_sum:{reservedUnits:0}})},
    terraqoProfessionalDocument: {
      findFirst: async (args: { where: unknown }) => {
        assert.deepEqual(args.where, { id: "document", professionalProfile: { userId: "owner" }, OR: [{ workspaceId: "workspace" }, { workspaceId: null }] });
        return present ? { id: "document", storageKey: "private-key", size: 100, type, reviewStatus: state, uploadedAt: date, reviewedAt: null, withdrawnAt: retained ? date : null, _count: { cvImports: imports, replacementAttempts: 0, resultingAttempts: 0 } } : null;
      },
      delete: async () => { deletes++; present = false; }, aggregate: async () => ({ _sum: { size: 1_200_000 } }),
    },
    terraqoProfessionalProfile: { updateMany: async (args: {where: unknown}) => {
      assert.deepEqual(args.where, {id: "profile", cvUrl: "/api/terraqo/professional-documents/document"}); return { count: 1 };
    } },
    terraqoWorklogMedia: { aggregate: async () => ({ _sum: { size: 0 } }) },
    terraqoMessageAttachment: { aggregate: async () => ({ _sum: { size: 0 } }) },
    terraqoUsageBucket: { updateMany: async (args: { where: { used: { gte: number } }; data: unknown }) => {
      assert.equal(args.where.used.gte, 3); assert.deepEqual(args.data, {used: {decrement: 1}}); refunds++; return {count: 1};
    } },
    activityLog: {
      create: async (args: { data: { metadata: { storageCleanupState: string; storageCleanupKey: string } } }) => {
        audits++; assert.equal(args.data.metadata.storageCleanupState, "PENDING"); assert.equal(args.data.metadata.storageCleanupKey, "private-key"); return {id: "audit"};
      },
      findFirst: async () => ({metadata: {storageCleanupState: cleanupState}}),
      update: async () => { cleanupState = "COMPLETE"; },
    },
  } as unknown as Prisma.TransactionClient;
  prisma.$transaction = (async (callback: (value: Prisma.TransactionClient) => Promise<unknown>) => callback(tx)) as unknown as typeof original.transaction;
  prisma.terraqoBillingAccount.findUnique = (async () => null) as unknown as typeof original.billing;
  prisma.terraqoWorkspaceModule.findUnique = (async () => ({active: enabled})) as unknown as typeof original.module;
  prisma.terraqoProfessionalDocument.findMany = (async (args: { where: unknown; take: number; cursor?: unknown; skip?: number; select: unknown }) => {
    assert.deepEqual(args.where, { professionalProfile: { userId: "owner" }, OR: [{ workspaceId: "workspace" }, { workspaceId: null }], withdrawnAt: null });
    assert.equal(args.take, 31); assert.ok(!JSON.stringify(args.select).includes("storageKey"));
    assert.deepEqual((args.select as Record<string, unknown>).replacedByDocument, {select: {id: true}},
      "lineage must include withdrawn successors to prevent predecessor resurrection");
    const visible = listedDocuments.filter(row => !row.withdrawnAt);
    const start = args.cursor ? visible.findIndex(row => row.id === (args.cursor as {id: string}).id) + (args.skip ?? 0) : 0;
    return visible.slice(start, start + args.take);
  }) as unknown as typeof original.docs;
  const fails = (status: number) => (error: unknown) => error instanceof PortalResourceError && error.status === status;
  const store = {delete: async (key: string) => { assert.equal(key, "private-key"); }};
  try {
    const page = await listPortalResource(token, "professionalDocuments");
    assert.equal(page.records.length, 30); assert.equal(page.nextCursor, "doc-32"); assert.equal(page.canCreate, false);
    assert.equal(page.records[0].canDelete, true);
    assert.equal(page.records[4].fields.superseded, "true");
    assert.ok(!JSON.stringify(page).includes("Private reviewer note"));
    assert.ok(!JSON.stringify(page).includes("reviewNote"));
    assert.ok(!JSON.stringify(page).includes("replacedByDocument"));
    assert.ok(!JSON.stringify(page).includes("replacesDocumentId"));
    const record = (id: string) => page.records.find(row => row.id === id)!;
    for (const index of [1, 2, 3, 6, 7, 8, 9, 10, 11]) assert.equal(record(`doc-${String(index).padStart(2, "0")}`).canDelete, false);
    for (const index of [5, 30, 31]) assert.ok(!page.records.some(row => row.id === `doc-${String(index).padStart(2, "0")}`));
    for (const id of ["doc-07", "doc-10", "doc-11"]) assert.equal(record(id).fields.superseded, "true");
    assert.equal(record("doc-07").status, "VERIFIED", "lineage must not rewrite review state");
    assert.equal(record("doc-10").status, "SUBMITTED");
    for (const id of ["doc-00", "doc-06", "doc-12", "doc-13"]) assert.equal(record(id).fields.superseded, "false");
    const nextPage = await listPortalResource(token, "professionalDocuments", page.nextCursor!);
    assert.deepEqual(nextPage.records.map(row => row.id), ["doc-33"]); assert.equal(nextPage.nextCursor, null);
    // The successor disappears on withdrawal, but its retained predecessor must
    // remain history even though legacy clients only understand `superseded`.
    listedDocuments[6].withdrawnAt = date;
    const afterWithdrawal = await listPortalResource(token, "professionalDocuments");
    assert.ok(!afterWithdrawal.records.some(row => row.id === "doc-06"));
    assert.equal(afterWithdrawal.records.find(row => row.id === "doc-07")!.fields.superseded, "true");
    for (const row of listedDocuments) row.withdrawnAt = date;
    const withdrawnOnly = await listPortalResource(token, "professionalDocuments");
    assert.deepEqual(withdrawnOnly.records, []); assert.equal(withdrawnOnly.nextCursor, null);
    await assert.rejects(authorizeResource({...token, role: "ADMIN"}, "professionalDocuments"), fails(403));
    enabled = false; await assert.rejects(authorizeResource(token, "professionalDocuments"), fails(403)); enabled = true;
    for (const [nextState, nextType, nextImports] of [["VERIFIED", "CV", 0], ["SUBMITTED", "CV", 0], ["REJECTED", "DNI_FRONT", 0], ["REJECTED", "CV", 1]] as const) {
      state = nextState; type = nextType; imports = nextImports;
      await assert.rejects(removeProfessionalDocument(token, "document", date.toISOString(), store), fails(409));
    }
    state = "REJECTED"; type = "CV"; imports = 0;
    await assert.rejects(removeProfessionalDocument(token, "document", "2026-10-02T00:00:00Z", store), fails(409));
    retained = true;
    await assert.rejects(removeProfessionalDocument(token, "document", date.toISOString(), store), fails(409));
    retained = false;
    assert.equal(deletes, 0); assert.equal(refunds, 0);
    assert.deepEqual(await removeProfessionalDocument(token, "document", date.toISOString(), store), {deleted: true, storageCleanupPending: false});
    assert.equal(deletes, 1); assert.equal(audits, 1); assert.equal(refunds, 1); assert.equal(cleanupState, "COMPLETE");
    await assert.rejects(removeProfessionalDocument(token, "document", date.toISOString(), store), fails(404));
    present = true; cleanupState = "PENDING";
    assert.deepEqual(await removeProfessionalDocument(token, "document", date.toISOString(), {delete: async () => {throw new Error("storage unavailable");}}), {deleted: true, storageCleanupPending: true});
    assert.equal(refunds, 1); assert.equal(cleanupState, "PENDING");
    console.log("PASS professional documents: withdrawn rows excluded before pagination, lineage/legacy history without predecessor resurrection, private metadata, protected deletion, versions, atomic audit, quota floor and repeat guard (query/transaction doubles).");
  } finally {
    prisma.terraqoProfessionalDocument.findMany = original.docs; prisma.$transaction = original.transaction;
    prisma.terraqoWorkspaceModule.findUnique = original.module; prisma.terraqoBillingAccount.findUnique = original.billing;
    await prisma.$disconnect();
  }
}
main().catch(error => {console.error(error);process.exitCode=1;});
