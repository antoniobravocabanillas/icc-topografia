import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { queueEvidenceAnalysisJob } from "../lib/terraqo/evidence-analysis";

async function main() {
  const originalTransaction = prisma.$transaction;
  const originalRead = prisma.terraqoWorklogRevision.findFirst;
  const prior = { provider: process.env.TERRAQO_EVIDENCE_ANALYSIS_PROVIDER, key: process.env.GROQ_API_KEY };
  process.env.TERRAQO_EVIDENCE_ANALYSIS_PROVIDER = "groq";
  process.env.GROQ_API_KEY = "synthetic-never-sent";
  let transactionalReads = 0;
  let queuedHash = "";
  let writes = 0;
  const hash = "a".repeat(64);
  const source = { id: "source", worklogRevisionId: "revision", accessKind: "PUBLIC_CV", accessReferenceId: null,
    accessSnapshot: { allowedFields: ["summary"] }, worklogRevision: { contentHash: hash } };
  const tx = {
    $queryRaw: async () => [],
    terraqoAnalysisJob: {
      findUnique: async () => null,
      findFirst: async () => null,
      count: async () => 0,
      create: async ({ data }: { data: { sourceSetHash: string } }) => { writes++; queuedHash = data.sourceSetHash; return { ...data, id: "queued-fixture" }; },
    },
    terraqoEvaluationDossier: {
      findFirst: async () => ({ id: "dossier", sources: [source] }),
      update: async () => ({}),
    },
    terraqoWorklogRevision: {
      findFirst: async () => {
        transactionalReads++;
        return { id: "revision", contentHash: hash, title: "Not shared", summary: "Authorized summary", outcome: null,
          contributionRole: null, responsibilities: [], methods: [], tools: [],
          worklog: { occurredAt: new Date("2026-01-01T00:00:00Z"), locationLabel: null, professionalProfile: { liveCvEnabled: true } } };
      },
    },
  } as unknown as Prisma.TransactionClient;
  try {
    // A one-connection pool has no free global connection while this transaction
    // owns it. Fail immediately if source authorization leaves the transaction.
    prisma.terraqoWorklogRevision.findFirst = (async () => { throw new Error("Source read escaped the transaction"); }) as unknown as typeof originalRead;
    prisma.$transaction = (async (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => callback(tx)) as typeof originalTransaction;
    const result = await queueEvidenceAnalysisJob({ actorId: "actor", workspaceId: "workspace", operationKey: "operation",
      payload: { dossierId: "dossier", purpose: "EVIDENCE_SUMMARY", sourceRevisionIds: ["revision"],
        expectedPolicies: [{ sourceRevisionId: "revision", contentHash: hash, accessKind: "PUBLIC_CV" }] } });
    assert.equal(result.dispatchRequired, true);
    assert.equal(result.job.id, "queued-fixture");
    assert.equal(transactionalReads, 2);
    assert.equal(writes, 1);
    assert.match(queuedHash, /^[a-f0-9]{64}$/);
    await assert.rejects(queueEvidenceAnalysisJob({ actorId: "actor", workspaceId: "workspace", operationKey: "stale",
      payload: { dossierId: "dossier", purpose: "EVIDENCE_SUMMARY", sourceRevisionIds: ["revision"],
        expectedPolicies: [{ sourceRevisionId: "revision", contentHash: "b".repeat(64), accessKind: "PUBLIC_CV" }] } }),
    (error: Error & { code?: string }) => error.code === "STALE_SOURCE_POLICY");
    assert.equal(writes, 1, "Stale sources must not create a job.");
    console.log("PASS analysis queue: transaction-bound authorization, one-connection compatibility, real source hash and stale-policy rejection; no network or database connection.");
  } finally {
    prisma.$transaction = originalTransaction;
    prisma.terraqoWorklogRevision.findFirst = originalRead;
    if (prior.provider === undefined) delete process.env.TERRAQO_EVIDENCE_ANALYSIS_PROVIDER; else process.env.TERRAQO_EVIDENCE_ANALYSIS_PROVIDER = prior.provider;
    if (prior.key === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = prior.key;
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
