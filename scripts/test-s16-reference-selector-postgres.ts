import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { confirmedLocalDisposableDatabaseUrl } from "./lib/confirmed-local-disposable-database";

async function main() {
  const connection = confirmedLocalDisposableDatabaseUrl({ value: process.env.DATABASE_URL,
    expected: process.env.S16_TEST_DATABASE, valueVariable: "DATABASE_URL", expectedVariable: "S16_TEST_DATABASE" });
  assert.equal(new URL(connection).username, "s16_projection_test");
  assert.equal(process.env.S16_TEST_SYNTHETIC, "confirmed");
  const { prisma } = await import("../lib/prisma");
  const { saveClosureDraft, submitClosure, decideClosure, closureOperationFingerprint } = await import("../lib/terraqo/closure");
  const { listCollaborations } = await import("../lib/terraqo/collaboration");
  const { listClosureReferenceCandidates, getClosureReferenceDetail, closureReferenceSnapshotSchema } = await import("../lib/terraqo/closure-reference-access");
  const { terraqoClosureDraftSchema } = await import("../lib/validations/terraqo");
  const { publicationSourceSelect } = await import("../lib/terraqo/publication-review");
  const { buildPublicationSnapshot, publicationSnapshotHash } = await import("../lib/terraqo/publication-review-policy");
  const { preparePublicationProjection } = await import("../lib/terraqo/publication-projection");
  const owner = randomUUID(), professional = randomUUID(), outsider = randomUUID();
  const workspaceId = randomUUID(), otherWorkspace = randomUUID();
  const title = "PRIVATE_TITLE_SENTINEL", hash = "PRIVATE_HASH_SENTINEL";
  const clean = (value: unknown, hiddenTitle = true) => {
    const json = JSON.stringify(value);
    for (const key of ["accessSnapshot", "contentHash", "storageKey", "operationKey", "operationFingerprint", "currentFor"])
      assert.ok(!json.includes(`"${key}"`), `Internal leak ${key}`);
    assert.ok(!json.includes(hash));
    if (hiddenTitle) assert.ok(!json.includes(title), "Unauthorized title");
  };
  try {
    assert.deepEqual(await prisma.$queryRaw`SELECT current_user AS role, current_database() AS database`,
      [{ role: "s16_projection_test", database: "s16_projection_test" }]);
    await prisma.user.createMany({ data: [owner, professional, outsider].map(id => ({ id, email: `${id}@s16-selector.invalid` })) });
    await prisma.terraqoWorkspace.createMany({ data: [workspaceId, otherWorkspace].map(id => ({ id, name: "Synthetic reference test", slug: id })) });
    await prisma.terraqoWorkspaceMember.create({ data: { workspaceId, userId: owner, role: "OWNER", active: true } });
    const profile = await prisma.terraqoProfessionalProfile.create({ data: { userId: professional, liveCvEnabled: true, liveCvVisibility: "PUBLIC", visibility: "PRIVATE" } });
    const createSource = async (company: boolean) => {
      const worklog = await prisma.terraqoWorklogEntry.create({ data: { professionalProfileId: profile.id, authorId: professional,
        workspaceId: company ? workspaceId : null, title, summary: "Authorized summary", visibility: "PUBLIC", lifecycle: "PUBLISHED" } });
      const revision = await prisma.terraqoWorklogRevision.create({ data: { worklogId: worklog.id, revisionNo: 1, title,
        summary: "Authorized summary", contentHash: hash, createdById: professional } });
      await prisma.terraqoWorklogEntry.update({ where: { id: worklog.id }, data: { currentRevisionId: revision.id } });
      return { worklog, revision };
    };
    const company = await createSource(true), personal = await createSource(false);
    const collection = await prisma.terraqoShareCollection.create({ data: { professionalProfileId: profile.id, title: "Public collection",
      createdById: professional, operationKey: randomUUID(), operationFingerprint: "fixture", items: { create: { revisionId: company.revision.id, allowedFields: ["summary"] } } } });
    const source = await prisma.terraqoShareCollection.findUniqueOrThrow({ where: { id: collection.id }, select: publicationSourceSelect });
    const snapshot = buildPublicationSnapshot(source, workspaceId, undefined, { listOnCv: true });
    const approval = await prisma.terraqoPublicationReview.create({ data: { collectionId: collection.id, workspaceId, collectionVersion: 1,
      scopeHash: publicationSnapshotHash(snapshot), snapshot, requestedById: professional, decidedById: owner, decision: "APPROVED", decidedAt: new Date() } });
    const projection = await prisma.terraqoPublicProjection.create({ data: { collectionId: collection.id, slug: randomUUID(), policyVersion: "public-selection-v2",
      snapshot: await preparePublicationProjection(prisma, collection.id, 1, undefined, true) } });
    const createCollaboration = async () => {
      const conversation = await prisma.terraqoConversation.create({ data: { workspaceId, createdById: owner } });
      const past = new Date("2026-01-01T00:00:00Z");
      return prisma.terraqoCollaboration.create({ data: { workspaceId, conversationId: conversation.id, professionalUserId: professional,
        status: "ACCEPTED", acceptedRevisionNo: 1, acceptedAt: past,
        proposals: { create: { revisionNo: 1, roleTitle: "Surveyor", scope: "Synthetic scope", status: "ACCEPTED", decidedAt: past,
          createdById: owner, operationKey: randomUUID(), operationFingerprint: "fixture" } } } });
    };
    const collaboration = await createCollaboration(), other = await createCollaboration();
    const actor = { userId: owner, workspaceId, collaborationId: collaboration.id };
    const choice = { worklogRevisionId: company.revision.id, accessKind: "PUBLIC_SELECTION" as const, accessReferenceId: projection.id };
    const personalChoice = { worklogRevisionId: personal.revision.id, accessKind: "PUBLIC_CV" as const, accessReferenceId: personal.worklog.id };
    let page = await listClosureReferenceCandidates(prisma, actor);
    assert.equal(page.items.length, 1); assert.deepEqual(page.items[0].source, personalChoice);
    const cursor = page.nextCursor!;
    page = await listClosureReferenceCandidates(prisma, { ...actor, cursor });
    assert.deepEqual(page.items.map(item => item.source), [choice]); clean(page);
    assert.equal(page.items[0].fields.title, undefined); assert.deepEqual(page.items[0].media, []);
    assert.equal(page.items[0].label, "Referencia autorizada");
    await assert.rejects(listClosureReferenceCandidates(prisma, { ...actor, collaborationId: other.id, cursor }), { status: 400 });
    await assert.rejects(listClosureReferenceCandidates(prisma, { ...actor, limit: 31 }));
    for (const bad of [{ userId: outsider, workspaceId }, { userId: owner, workspaceId: otherWorkspace }, { userId: professional }]) {
      await assert.rejects(listClosureReferenceCandidates(prisma, { ...bad, collaborationId: collaboration.id }), { status: 404 });
      await assert.rejects(getClosureReferenceDetail(prisma, { ...bad, collaborationId: collaboration.id, revisionId: company.revision.id, source: choice }), { status: 404 });
    }
    clean(await getClosureReferenceDetail(prisma, { ...actor, revisionId: company.revision.id, source: choice }));
    await assert.rejects(getClosureReferenceDetail(prisma, { ...actor, revisionId: company.revision.id,
      source: { ...choice, accessKind: "PUBLIC_CV", accessReferenceId: company.worklog.id } }), { status: 404 });
    console.log("PASS selector: bounded discovery, exact actor/cursor isolation, no enterprise fallback, title omitted");

    const payload = { contribution: "Synthetic contribution", deliverables: ["Plan"], result: "Result", referenceSources: [choice], expectedVersion: null };
    assert.equal(terraqoClosureDraftSchema.safeParse({ ...payload, referenceRevisionIds: [] }).success, false);
    assert.equal(terraqoClosureDraftSchema.safeParse({ ...payload, referenceSources: [choice, choice] }).success, false);
    assert.equal(terraqoClosureDraftSchema.safeParse({ ...payload, referenceSources: [{ ...choice, grant: "spoof" }] }).success, false);
    const saveInput = { ...actor, operationKey: randomUUID(), payload };
    const saved = await saveClosureDraft(saveInput); clean(saved);
    const reference = saved.currentRevision!.references[0];
    assert.deepEqual(reference.source, choice); assert.equal(reference.worklogRevision.title, undefined);
    const stored = await prisma.terraqoClosureReference.findUniqueOrThrow({ where: { id: reference.id } });
    const ceiling = closureReferenceSnapshotSchema.parse(stored.accessSnapshot);
    assert.deepEqual(ceiling.allowedFields, ["summary"]); assert.deepEqual(ceiling.mediaIds, []);
    assert.equal(closureReferenceSnapshotSchema.safeParse({ ...ceiling, allowedFields: ["summary", "summary"] }).success, false);
    assert.equal(closureReferenceSnapshotSchema.safeParse({ ...ceiling, policy: "future" }).success, false);
    await assert.rejects(getClosureReferenceDetail(prisma, { userId: professional, collaborationId: collaboration.id,
      revisionId: company.revision.id, referenceId: reference.id }), { status: 404 });
    await assert.rejects(getClosureReferenceDetail(prisma, { ...actor, collaborationId: other.id,
      revisionId: company.revision.id, referenceId: reference.id }), { status: 404 });
    assert.deepEqual((await saveClosureDraft(saveInput)).currentRevision?.references[0].source, choice);
    assert.equal(await prisma.terraqoClosureRevision.count({ where: { closureId: saved.id } }), 1);
    console.log("PASS save: strict descriptors, frozen fields/media, replay, unsent professional denial");

    const persisted = () => prisma.terraqoCollaboration.findUniqueOrThrow({ where: { id: collaboration.id }, include: {
      closure: { include: { revisions: { include: { references: true } }, certificate: true } }, conversation: { include: { contexts: true } } } });
    const submitInput = { ...actor, operationKey: randomUUID(), payload: { expectedRevisionNo: 1 } };
    await prisma.terraqoPublicationReview.update({ where: { id: approval.id }, data: { revokedAt: new Date() } });
    let before = await persisted();
    await assert.rejects(submitClosure(submitInput), { status: 409 });
    assert.deepEqual(await persisted(), before);
    assert.deepEqual((await saveClosureDraft(saveInput)).currentRevision?.references, []);
    await assert.rejects(getClosureReferenceDetail(prisma, { ...actor, revisionId: company.revision.id, referenceId: reference.id }), { status: 404 });
    assert.deepEqual((await listClosureReferenceCandidates(prisma, { ...actor, cursor })).items, []);
    await prisma.terraqoPublicationReview.update({ where: { id: approval.id }, data: { revokedAt: null } });
    await submitClosure(submitInput);
    clean(await getClosureReferenceDetail(prisma, { userId: professional, collaborationId: collaboration.id,
      revisionId: company.revision.id, referenceId: reference.id }));
    await assert.rejects(listClosureReferenceCandidates(prisma, actor), { status: 404 });
    await prisma.terraqoShareCollectionItem.updateMany({ where: { collectionId: collection.id }, data: { allowedFields: [] } });
    before = await persisted();
    const decisionInput = { userId: professional, closureId: saved.id, operationKey: randomUUID(), payload: { action: "ACCEPT" as const, expectedRevisionNo: 1 } };
    await assert.rejects(decideClosure(decisionInput), { status: 409 });
    assert.deepEqual(await persisted(), before, "Full rollback on allowedFields withdrawal");
    for (const view of [{ userId: owner, workspaceId }, { userId: professional }]) {
      const rows = await listCollaborations({ ...view, collaborationId: collaboration.id });
      assert.deepEqual(rows[0].closure?.currentRevision?.references, []); clean(rows[0].closure);
    }
    await prisma.terraqoShareCollectionItem.updateMany({ where: { collectionId: collection.id }, data: { allowedFields: ["summary"] } });
    // Revoke the company approval during the submitted phase too; ACCEPT must roll back all outputs.
    await prisma.terraqoPublicationReview.update({ where: { id: approval.id }, data: { revokedAt: new Date() } });
    before = await persisted();
    await assert.rejects(decideClosure(decisionInput), { status: 409 });
    assert.deepEqual(await persisted(), before);
    await prisma.terraqoPublicationReview.update({ where: { id: approval.id }, data: { revokedAt: null } });
    const accepted = await decideClosure(decisionInput); clean(accepted);
    assert.ok(accepted.certificate);
    await prisma.terraqoPublicationReview.update({ where: { id: approval.id }, data: { revokedAt: new Date() } });
    before = await persisted();
    assert.deepEqual((await decideClosure(decisionInput)).currentRevision?.references, []);
    assert.deepEqual(await persisted(), before);
    assert.equal(await prisma.terraqoCollaborationCertificate.count({ where: { closureId: saved.id } }), 1);
    console.log("PASS withdrawal: company approval and allowedFields revoke; submit/ACCEPT atomic rollback; accepted replay redacted");

    await prisma.terraqoPublicationReview.update({ where: { id: approval.id }, data: { revokedAt: null } });
    // Simulate a broader current approved publication; an existing closure never grows its ceiling.
    await prisma.terraqoShareCollectionItem.updateMany({ where: { collectionId: collection.id }, data: { allowedFields: ["title", "summary"] } });
    const widerSource = await prisma.terraqoShareCollection.findUniqueOrThrow({ where: { id: collection.id }, select: publicationSourceSelect });
    const wider = buildPublicationSnapshot(widerSource, workspaceId, undefined, { listOnCv: true });
    await prisma.terraqoPublicationReview.update({ where: { id: approval.id }, data: { snapshot: wider, scopeHash: publicationSnapshotHash(wider) } });
    const widerProjection = await preparePublicationProjection(prisma, collection.id, 1, undefined, true);
    await prisma.terraqoPublicProjection.update({ where: { id: projection.id }, data: { snapshot: widerProjection } });
    clean(await getClosureReferenceDetail(prisma, { ...actor, revisionId: company.revision.id, referenceId: reference.id }));
    // Exact original root still readable once it is unlisted; never offered as a fresh candidate.
    const unlisted = buildPublicationSnapshot(widerSource, workspaceId);
    await prisma.terraqoPublicationReview.update({ where: { id: approval.id }, data: { snapshot: unlisted, scopeHash: publicationSnapshotHash(unlisted) } });
    await prisma.terraqoPublicProjection.update({ where: { id: projection.id }, data: { snapshot: await preparePublicationProjection(prisma, collection.id, 1) } });
    clean(await getClosureReferenceDetail(prisma, { ...actor, revisionId: company.revision.id, referenceId: reference.id }));
    await assert.rejects(getClosureReferenceDetail(prisma, { ...actor, collaborationId: other.id, revisionId: company.revision.id, source: choice }), { status: 404 });
    process.env.TERRAQO_SCOPED_SHARING_V1 = "false";
    await assert.rejects(getClosureReferenceDetail(prisma, { ...actor, revisionId: company.revision.id, referenceId: reference.id }), { status: 404 });
    process.env.TERRAQO_SCOPED_SHARING_V1 = "true";
    await prisma.terraqoProfessionalProfile.update({ where: { id: profile.id }, data: { liveCvEnabled: false } });
    await assert.rejects(getClosureReferenceDetail(prisma, { ...actor, revisionId: company.revision.id, referenceId: reference.id }), { status: 404 });
    await prisma.terraqoProfessionalProfile.update({ where: { id: profile.id }, data: { liveCvEnabled: true } });
    console.log("PASS frozen policy: expansion redacted, original unlisted root rechecked, fresh unlisted/flags/disabled CV denied");

    const optionalResultPayload = { contribution: "Synthetic contribution", deliverables: ["Plan"], result: "   " };
    assert.equal(terraqoClosureDraftSchema.parse(optionalResultPayload).result, "");
    for (const result of ["x", "abc", "x".repeat(5001), null, undefined])
      assert.equal(terraqoClosureDraftSchema.safeParse({ ...optionalResultPayload, result }).success, false);
    assert.equal(terraqoClosureDraftSchema.parse({ ...optionalResultPayload, result: "  Done  " }).result, "Done");
    const emptyCollaboration = await createCollaboration();
    const emptyPayload = terraqoClosureDraftSchema.parse({ ...optionalResultPayload, expectedVersion: null });
    const emptyInput = { ...actor, collaborationId: emptyCollaboration.id, operationKey: randomUUID(), payload: emptyPayload };
    const emptySaved = await saveClosureDraft(emptyInput);
    assert.equal(emptySaved.currentRevision?.result, "");
    assert.equal((await saveClosureDraft(emptyInput)).currentRevision?.id, emptySaved.currentRevision?.id);
    await submitClosure({ ...emptyInput, operationKey: randomUUID(), payload: { expectedRevisionNo: 1 } });
    const emptyAccepted = await decideClosure({ userId: professional, closureId: emptySaved.id, operationKey: randomUUID(), payload: { action: "ACCEPT", expectedRevisionNo: 1 } });
    assert.equal(emptyAccepted.certificate?.result, "");
    console.log("PASS optional result: trim/empty/length contract, persisted empty, idempotent replay and accepted certificate");

    const legacyPayload = { contribution: "Synthetic contribution", deliverables: ["Plan"], result: "Result", referenceRevisionIds: [personal.revision.id], expectedVersion: null };
    assert.equal(JSON.stringify(terraqoClosureDraftSchema.parse(legacyPayload)), JSON.stringify(legacyPayload));
    const noReferences = { contribution: legacyPayload.contribution, deliverables: legacyPayload.deliverables, result: legacyPayload.result };
    assert.equal(JSON.stringify(terraqoClosureDraftSchema.parse(noReferences)), JSON.stringify({ ...noReferences, referenceRevisionIds: [] }));
    const legacyInput = { ...actor, collaborationId: other.id, operationKey: randomUUID(), payload: legacyPayload };
    const legacySaved = await saveClosureDraft(legacyInput);
    const legacyRef = legacySaved.currentRevision!.references[0];
    await prisma.terraqoClosureReference.update({ where: { id: legacyRef.id }, data: { accessSnapshot: {
      kind: "PUBLIC_CV", revisionId: personal.revision.id, title: "OLD_STALE_TITLE", contentHash: hash, capturedAt: new Date().toISOString(),
    } } });
    const revision = await prisma.terraqoClosureRevision.findUniqueOrThrow({ where: { id: legacySaved.currentRevision!.id } });
    assert.equal(revision.operationFingerprint, closureOperationFingerprint(legacyPayload));
    const legacyReplay = await saveClosureDraft(legacyInput);
    assert.deepEqual(legacyReplay.currentRevision!.references[0].fields, { title });
    assert.deepEqual(legacyReplay.currentRevision!.references[0].source, personalChoice); clean(legacyReplay, false);
    await submitClosure({ ...legacyInput, operationKey: randomUUID(), payload: { expectedRevisionNo: 1 } });
    const legacyDecision = { userId: professional, closureId: legacySaved.id, operationKey: randomUUID(), payload: { action: "ACCEPT" as const, expectedRevisionNo: 1 } };
    assert.ok((await decideClosure(legacyDecision)).certificate);
    await prisma.terraqoProfessionalProfile.update({ where: { id: profile.id }, data: { liveCvVisibility: "PRIVATE" } });
    assert.deepEqual((await decideClosure(legacyDecision)).currentRevision!.references, []);
    assert.deepEqual((await saveClosureDraft(legacyInput)).currentRevision!.references, []);
    await prisma.terraqoProfessionalProfile.update({ where: { id: profile.id }, data: { liveCvVisibility: "PUBLIC" } });
    await prisma.terraqoWorklogEntry.update({ where: { id: personal.worklog.id }, data: { workspaceId } });
    assert.deepEqual((await saveClosureDraft(legacyInput)).currentRevision!.references, []);
    await prisma.terraqoWorkspaceMember.updateMany({ where: { workspaceId, userId: owner }, data: { active: false } });
    await assert.rejects(saveClosureDraft(legacyInput), { status: 404 });
    await assert.rejects(listCollaborations({ userId: owner, workspaceId, collaborationId: other.id }), { status: 404 });
    await assert.rejects(getClosureReferenceDetail(prisma, { ...actor, revisionId: company.revision.id, referenceId: reference.id }), { status: 404 });
    await prisma.user.update({ where: { id: owner }, data: { role: "SUPER_ADMIN" } });
    clean(await getClosureReferenceDetail(prisma, { ...actor, revisionId: company.revision.id, referenceId: reference.id }));
    console.log("PASS legacy: historical fingerprints/title-only replay; private CV/enterprise deny; current admin and SUPER_ADMIN semantics");
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
