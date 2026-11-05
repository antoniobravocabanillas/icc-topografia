import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { createWorkspaceNeed, discoverEvidenceForNeed, createEvaluationDossier, listEvaluationDossiers } from "../../lib/terraqo/discovery-needs";
import { getEvidenceAnalysisJob } from "../../lib/terraqo/evidence-analysis";
import { createConversationRequest, listConversationRequests } from "../../lib/terraqo/contextual-messaging";
import type { S24Selection } from "./s24-acceptance";

type ReaderActor = { workspaceId: string; userId: string };
function createNeed(actor: ReaderActor) {
  return createWorkspaceNeed({ ...actor, operationKey: randomUUID(), payload: {
    title: "Nivelación", problem: "Nivelación de control en la zona solicitada.", activities: [],
    requiredTools: [], endorsementNeeded: false, requirements: [{ priority: "REQUIRED", label: "Nivelación" }],
  } });
}

export async function checkGrantDossier(actor: ReaderActor, selection: S24Selection, grantId: string) {
  const need = await createNeed(actor);
  const dossier = await createEvaluationDossier({ ...actor, operationKey: randomUUID(), payload: {
    professionalProfileId: selection.collection.professionalProfileId, needRevisionId: need.currentRevisionId!,
    worklogRevisionIds: selection.records.map(row => row.revisionId),
  } });
  const read = async () => (await listEvaluationDossiers(actor)).find(row => row.id === dossier.id)!;
  const active = await read();
  assert.equal(active.sources.length, 2);
  for (const source of active.sources) {
    assert.equal(source.accessKind, "PRIVATE_GRANT");
    assert.equal(source.accessReferenceId, grantId);
    assert.equal("title" in source.worklogRevision, false);
  }
  return async () => {
    const expired = await read();
    assert.deepEqual(expired.sources, []);
    assert.equal(expired.revokedSourceCount, 2);
  };
}

export async function checkActiveReaders(input: {
  userId: string; workspaceId: string; profileId: string; ownerId: string; selection: S24Selection; projectionId: string;
}) {
  const { selection, workspaceId, userId } = input;
  const actor = { userId, workspaceId };
  const need = await createNeed(actor);
  const discover = async () => (await discoverEvidenceForNeed(workspaceId, need.id))
    .filter(row => row.professionalProfileId === input.profileId);
  const matches = await discover();
  assert.equal(matches.length, 2);
  for (const record of selection.records) {
    const match = matches.find(row => row.revisionId === record.revisionId);
    assert.ok(match);
    assert.equal(match.accessReferenceId, input.projectionId);
    assert.equal(match.accessKind, "PUBLIC_SELECTION");
    assert.equal(match.summary, record.fields.summary);
    assert.equal(match.locationLabel, record.fields.locationLabel);
    for (const field of ["title", "outcome", "occurredAt", "media"]) assert.ok(!(field in match));
  }
  const dossier = await createEvaluationDossier({ ...actor, operationKey: randomUUID(), payload: {
    professionalProfileId: input.profileId, needRevisionId: need.currentRevisionId!,
    worklogRevisionIds: selection.records.map(row => row.revisionId),
  } });
  const list = async () => (await listEvaluationDossiers(actor)).find(row => row.id === dossier.id)!;
  const current = await list();
  assert.equal(current.sources.length, 2);
  const expected = current.sources.map(source => {
    const record = selection.records.find(row => row.revisionId === source.worklogRevisionId)!;
    assert.equal(source.accessKind, "PUBLIC_SELECTION");
    assert.equal(source.accessReferenceId, input.projectionId);
    assert.equal("title" in source.worklogRevision, false);
    return { sourceId: source.id, revisionId: record.revisionId, contentHash: source.worklogRevision.contentHash,
      accessKind: source.accessKind, fields: record.fields };
  }).sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  // Independent expected input from fixture bytes/fields. Seed an existing result to
  // exercise the read-time hash and claims erasure without dispatching any provider.
  const job = await prisma.terraqoAnalysisJob.create({ data: {
    workspaceId, dossierId: dossier.id, createdById: userId, purpose: "EVIDENCE_SUMMARY", status: "READY",
    policyVersion: "s24-fixture", promptVersion: "s24-fixture", cacheKey: randomUUID(),
    sourceSetHash: createHash("sha256").update(JSON.stringify(expected)).digest("hex"),
    claims: ["synthetic authorized claim"], operationKey: randomUUID(), operationFingerprint: randomUUID(),
    sources: { create: expected.map(row => ({ evaluationSourceId: row.sourceId, worklogRevisionId: row.revisionId,
      contentHash: row.contentHash, accessKind: row.accessKind, accessReferenceId: input.projectionId })) },
  } });
  const readJob = () => getEvidenceAnalysisJob({ actorId: userId, workspaceId, jobId: job.id });
  const active = await readJob();
  assert.equal(active.status, "READY");
  for (const record of selection.records) {
    assert.deepEqual(active.sources.find(row => row.revisionId === record.revisionId)?.availableFields,
      Object.keys(record.fields));
  }
  await prisma.terraqoWorkspaceModule.create({ data: { workspaceId, code: "PROFESSIONAL_MESSAGING", active: true } });
  const conversation = await createConversationRequest({ ...actor, operationKey: randomUUID(), payload: { dossierId: dossier.id } });
  async function checkContext() {
    for (const id of [userId, input.ownerId]) {
      const row = (await listConversationRequests(id)).find(item => item.id === conversation.id);
      assert.ok(row);
      assert.deepEqual(row.context, id === userId ? { kind: "EVALUATION", title: "Nivelación", revisionNo: 1 }
        : { kind: "PROTECTED", title: "Contexto profesional protegido", revisionNo: null });
      for (const record of selection.records) {
        const serialized = JSON.stringify(row);
        for (const value of [record.revisionId, record.fields.summary, record.selected.id]) assert.ok(!serialized.includes(value));
      }
    }
  }
  await checkContext();
  return async () => {
    assert.deepEqual(await discover(), []);
    const withdrawn = await list();
    assert.deepEqual(withdrawn.sources, []);
    assert.equal(withdrawn.revokedSourceCount, 2);
    const revoked = await readJob();
    assert.equal(revoked.status, "SOURCE_REVOKED");
    assert.deepEqual(revoked.sources, []);
    assert.deepEqual(revoked.claims, []);
    await checkContext();
  };
}
