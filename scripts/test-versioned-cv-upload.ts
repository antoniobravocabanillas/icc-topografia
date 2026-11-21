import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { uploadProfessionalDocuments } from "../lib/server/professional-document-upload";
import { createGenuineProfessionalDocxFixture } from "./test-professional-office-file-validation";

async function main() {
  const previousFlag = process.env.TERRAQO_DOCUMENT_LIFECYCLE_V1;
  const original = { profile: prisma.terraqoProfessionalProfile.findUnique, find: prisma.terraqoProfessionalDocument.findFirst, tx: prisma.$transaction };
  let active = false, raced = false, stored = 0, deleted = 0, reserved = 0, released = 0, created = 0;
  let pointer = "";
  const tx = {
    $queryRaw: async () => [{ id: "profile" }],
    terraqoProfessionalDocument: {
      findFirst: async () => raced ? { id: "competing-cv" } : null,
      updateMany: async () => { throw new Error("Versioned CV must preserve historical review decisions"); },
      create: async () => { created++; return { id: "first-cv", type: "CV", fileName: "cv.pdf", reviewStatus: "SUBMITTED" }; },
    },
    terraqoProfessionalProfile: { update: async (args: {data: {cvUrl: string}}) => { pointer = args.data.cvUrl; } },
  } as unknown as Prisma.TransactionClient;
  prisma.terraqoProfessionalProfile.findUnique = (async () => ({ id: "profile", identityVerificationStatus: "VERIFIED" })) as unknown as typeof original.profile;
  prisma.terraqoProfessionalDocument.findFirst = (async (args: {where: Record<string, unknown>}) => {
    assert.deepEqual(args.where, { professionalProfileId: "profile", workspaceId: null, type: "CV", withdrawnAt: null, replacedByDocument: null });
    return active ? { id: "existing" } : null;
  }) as unknown as typeof original.find;
  prisma.$transaction = (async (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => callback(tx)) as unknown as typeof original.tx;
  const store = { set: async () => { stored++; }, delete: async () => { deleted++; }, getWithMetadata: async () => null };
  const reserve = async () => { reserved++; return { release: async () => { released++; } }; };
  const request = (body = "%PDF-1.7\n", type = "application/pdf") => {
    const form = new FormData(); form.set("purpose", "cv"); form.set("cvFile", new File([body], "cv.pdf", { type }));
    return new Request("https://example.invalid/upload", { method: "POST", body: form });
  };
  try {
    process.env.TERRAQO_DOCUMENT_LIFECYCLE_V1 = "true";
    active = true;
    assert.equal((await uploadProfessionalDocuments(request(), "owner", undefined, { store, reserve })).status, 409);
    assert.equal(reserved, 0); assert.equal(stored, 0);
    active = false;
    for (const [body, type] of [["forged", "application/pdf"], ["legacy", "application/msword"], ["PK-forged", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]]) {
      assert.equal((await uploadProfessionalDocuments(request(body, type), "owner", undefined, { store, reserve })).status, 422);
    }
    assert.equal(reserved, 0);
    const response = await uploadProfessionalDocuments(request(), "owner", undefined, { store, reserve });
    assert.equal(response.status, 200); assert.equal(created, 1);
    assert.equal(pointer, "/api/terraqo/professional-documents/first-cv");
    const form = new FormData(); form.set("purpose", "cv"); form.set("cvFile", createGenuineProfessionalDocxFixture());
    assert.equal((await uploadProfessionalDocuments(new Request("https://example.invalid/upload", { method: "POST", body: form }), "owner", undefined, { store, reserve })).status, 200);
    assert.equal(created, 2);
    raced = true;
    assert.equal((await uploadProfessionalDocuments(request(), "owner", undefined, { store, reserve })).status, 409);
    assert.equal(created, 2); assert.equal(deleted, 1); assert.equal(released, 1);
    assert.equal(pointer, "/api/terraqo/professional-documents/first-cv");
    console.log("PASS gated initial CV handler: existing version conflict before quota, PDF/DOC/DOCX rejection, initial creation preserving reviews, locked race compensation and stable pointer (transaction doubles).");
  } finally {
    prisma.terraqoProfessionalProfile.findUnique = original.profile; prisma.terraqoProfessionalDocument.findFirst = original.find; prisma.$transaction = original.tx;
    if (previousFlag === undefined) delete process.env.TERRAQO_DOCUMENT_LIFECYCLE_V1; else process.env.TERRAQO_DOCUMENT_LIFECYCLE_V1 = previousFlag;
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
