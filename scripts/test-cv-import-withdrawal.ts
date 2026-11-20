import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

async function main() {
  const require = createRequire(import.meta.url);
  const mediaId = require.resolve("../lib/server/media.ts");
  const originalMedia = require.cache[mediaId];
  let available = false, blobReads = 0, extractionCalls = 0;
  require.cache[mediaId] = { id: mediaId, filename: mediaId, loaded: true, exports: {
    getProfessionalDocumentStore: () => ({ getWithMetadata: async () => {
      blobReads++; return { data: new TextEncoder().encode("synthetic CV").buffer };
    } }),
  } } as NodeModule;
  const { applyCvImport, getCvImport, queueCvImport, reviewCvImport, CvImportError } = await import("../lib/server/cv-import");
  const { processCvImportJob } = await import("../lib/server/cv-import-extraction");
  // No database, provider credentials or network. Exercise production entrypoints
  // with an unavailable source; reaching any derived write fails the test.
  const originals = {
    profile: prisma.terraqoProfessionalProfile.findUnique,
    document: prisma.terraqoProfessionalDocument.findFirst,
    read: prisma.terraqoCvImport.findFirst,
    claim: prisma.terraqoCvImport.updateMany,
    reset: prisma.terraqoCvImport.update,
    transaction: prisma.$transaction,
    experiences: prisma.terraqoProfessionalExperience.findMany,
    education: prisma.terraqoProfessionalEducation.findMany,
    fetch: globalThis.fetch,
    endpoint: process.env.TERRAQO_DOCUMENT_AI_URL,
  };
  let guardedReads = 0;
  let failedExtraction = false;
  const record = { id: "import", professionalProfileId: "profile", documentId: "document",
    document: { storageKey: "synthetic-only", fileName: "cv.pdf", contentType: "application/pdf" },
    items: [{ id: "item", decision: "ACCEPTED", type: "PROFILE", normalizedData: { headline: "Must not publish" } }] };
  const tx = {
    $queryRaw: async (query: Prisma.Sql) => {
      if (query.text.includes('"TerraqoProfessionalProfile"')) return [{ id: "profile" }];
      assert.ok(query.text.includes('"withdrawnAt" IS NULL'));
      assert.ok(query.values.includes("profile") && query.values.includes("document"));
      guardedReads++;
      return available ? [{ id: "document" }] : [];
    },
  } as unknown as Prisma.TransactionClient;
  prisma.terraqoProfessionalProfile.findUnique = (async () => ({ id: "profile" })) as unknown as typeof originals.profile;
  prisma.terraqoProfessionalDocument.findFirst = (async () => ({ id: "document" })) as unknown as typeof originals.document;
  prisma.terraqoCvImport.findFirst = (async (args: { where: { document?: unknown } }) => {
    if (args.where.document) {
      assert.deepEqual(args.where.document, { withdrawnAt: null });
      return null;
    }
    return record;
  }) as unknown as typeof originals.read;
  prisma.terraqoCvImport.updateMany = (async (args: { data: { status?: string; errorCode?: string } }) => {
    if (args.data.status === "FAILED") {
      assert.equal(args.data.errorCode, "DOCUMENT_WITHDRAWN"); failedExtraction = true;
    }
    assert.notEqual(args.data.status, "READY_FOR_REVIEW");
    return { count: 1 };
  }) as unknown as typeof originals.claim;
  prisma.terraqoCvImport.update = (async (args: { data: { status: string } }) => {
    assert.equal(args.data.status, "READY_FOR_REVIEW"); return {};
  }) as unknown as typeof originals.reset;
  prisma.$transaction = (async (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => callback(tx)) as typeof originals.transaction;
  const withdrawn = (error: unknown) => error instanceof CvImportError && error.code === "DOCUMENT_WITHDRAWN" && error.status === 409;
  try {
    await assert.rejects(queueCvImport("owner", "document", false), withdrawn);
    await assert.rejects(reviewCvImport("owner", "import", { items: [] }), withdrawn);
    await assert.rejects(applyCvImport("owner", "import"), withdrawn);
    await assert.rejects(processCvImportJob("import"), withdrawn);
    await assert.rejects(getCvImport("owner", "import"), (error: unknown) => error instanceof CvImportError && error.code === "IMPORT_NOT_FOUND");
    assert.equal(guardedReads, 4);
    assert.equal(failedExtraction, true);
    assert.equal(blobReads, 0);
    // Simulate withdrawal while the remote extractor holds bytes already read.
    // Its response must not publish items or READY_FOR_REVIEW after withdrawal.
    available = true; failedExtraction = false;
    process.env.TERRAQO_DOCUMENT_AI_URL = "https://fixture.invalid";
    globalThis.fetch = async () => {
      extractionCalls++; available = false;
      return Response.json({ profile: { headline: "Must not publish" } });
    };
    prisma.terraqoProfessionalExperience.findMany = (async () => []) as typeof originals.experiences;
    prisma.terraqoProfessionalEducation.findMany = (async () => []) as typeof originals.education;
    await assert.rejects(processCvImportJob("import"), withdrawn);
    assert.equal(blobReads, 1); assert.equal(extractionCalls, 1);
    assert.equal(guardedReads, 6); assert.equal(failedExtraction, true);
    console.log("PASS withdrawn CV blocks queue, review, apply, extraction and derived-data retrieval before provider access or publication");
    console.log("PASS withdrawal during extraction blocks stale derived publication after a valid provider response");
  } finally {
    prisma.terraqoProfessionalProfile.findUnique = originals.profile;
    prisma.terraqoProfessionalDocument.findFirst = originals.document;
    prisma.terraqoCvImport.findFirst = originals.read;
    prisma.terraqoCvImport.updateMany = originals.claim;
    prisma.terraqoCvImport.update = originals.reset;
    prisma.$transaction = originals.transaction;
    prisma.terraqoProfessionalExperience.findMany = originals.experiences;
    prisma.terraqoProfessionalEducation.findMany = originals.education;
    globalThis.fetch = originals.fetch;
    if (originals.endpoint === undefined) delete process.env.TERRAQO_DOCUMENT_AI_URL; else process.env.TERRAQO_DOCUMENT_AI_URL = originals.endpoint;
    if (originalMedia) require.cache[mediaId] = originalMedia; else delete require.cache[mediaId];
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
