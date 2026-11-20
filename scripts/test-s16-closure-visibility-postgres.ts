import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { confirmedLocalDisposableDatabaseUrl } from "./lib/confirmed-local-disposable-database";

async function main() {
  const connection = confirmedLocalDisposableDatabaseUrl({
    value: process.env.DATABASE_URL, expected: process.env.S16_TEST_DATABASE,
    valueVariable: "DATABASE_URL", expectedVariable: "S16_TEST_DATABASE",
  });
  assert.equal(new URL(connection).username, "s16_projection_test");
  assert.equal(process.env.S16_TEST_SYNTHETIC, "confirmed");
  const { prisma } = await import("../lib/prisma");
  const { PrismaClient } = await import("@prisma/client");
  const { listCollaborations, reviseCollaboration, decideCollaborationProposal } = await import("../lib/terraqo/collaboration");
  const { saveClosureDraft, submitClosure, decideClosure } = await import("../lib/terraqo/closure");
  const { closureProjectionInclude, projectClosure } = await import("../lib/terraqo/closure-projection");
  const owner = randomUUID(), professional = randomUUID(), outsider = randomUUID();
  const workspaceId = randomUUID(), otherWorkspaceId = randomUUID();
  const actors = [owner, professional, outsider];
  try {
    assert.deepEqual(await prisma.$queryRaw`SELECT current_user AS role, current_database() AS database`,
      [{ role: "s16_projection_test", database: "s16_projection_test" }]);
    await prisma.user.createMany({ data: actors.map(id => ({ id, email: `${id}@s16.invalid` })) });
    await prisma.terraqoWorkspace.createMany({ data: [workspaceId, otherWorkspaceId].map(id => ({ id, name: "Synthetic S16", slug: id, ownerUserId: owner })) });
    await prisma.terraqoWorkspaceMember.createMany({ data: [workspaceId, otherWorkspaceId].map(id => ({ workspaceId: id, userId: owner, role: "OWNER" })) });
    const profile = await prisma.terraqoProfessionalProfile.create({ data: {
      userId: professional, liveCvEnabled: true, liveCvVisibility: "PUBLIC",
    } });
    const otherProfile = await prisma.terraqoProfessionalProfile.create({ data: { userId: outsider } });
    const conversation = await prisma.terraqoConversation.create({ data: { workspaceId, createdById: owner } });
    const collaboration = await prisma.terraqoCollaboration.create({ data: {
      workspaceId, conversationId: conversation.id, professionalUserId: professional,
      status: "ACCEPTED", acceptedRevisionNo: 1, acceptedAt: new Date("2026-01-01T00:00:00Z"),
      proposals: { create: { revisionNo: 1, scope: "Accepted scope", roleTitle: "Surveyor", status: "ACCEPTED", decidedAt: new Date("2026-01-01T00:00:00Z"), createdById: owner, operationKey: randomUUID(), operationFingerprint: "fixture" } },
    } });
    const worklog = await prisma.terraqoWorklogEntry.create({ data: {
      professionalProfileId: profile.id, authorId: professional,
      title: "SOURCE_TITLE_SENTINEL", summary: "Synthetic reference", visibility: "PUBLIC",
    } });
    const source = await prisma.terraqoWorklogRevision.create({ data: {
      worklogId: worklog.id, revisionNo: 1, title: worklog.title,
      summary: worklog.summary, contentHash: "SOURCE_HASH_SENTINEL", createdById: professional,
    } });
    await prisma.terraqoWorklogEntry.update({ where: { id: worklog.id }, data: { currentRevisionId: source.id } });
    const read = async (audience: "professional" | "workspace") => {
      const rows = await listCollaborations({ userId: audience === "workspace" ? owner : professional,
        ...(audience === "workspace" ? { workspaceId } : {}) });
      assert.equal(rows.length, 1);
      return rows[0].closure;
    };
    const draft = async (label: string) => saveClosureDraft({
      userId: owner, workspaceId, collaborationId: collaboration.id, operationKey: randomUUID(),
      payload: { contribution: `${label} contribution`, deliverables: [`${label} deliverable`], result: `${label} result`,
        authorizedExcerpt: `${label} excerpt`, referenceRevisionIds: [source.id], expectedVersion: (await read("workspace"))?.version ?? null },
    });
    const submit = async (revisionNo: number) => submitClosure({ userId: owner, workspaceId,
      collaborationId: collaboration.id, operationKey: randomUUID(), payload: { expectedRevisionNo: revisionNo } });
    const cleanProfessional = (value: unknown, forbidden: string[]) => {
      const serialized = JSON.stringify(value);
      for (const secret of forbidden) assert.ok(!serialized.includes(secret), `DTO leaked ${secret}`);
      for (const internal of ["operationKey", "operationFingerprint", "submitFingerprint", "accessSnapshot", "currentFor"])
        assert.ok(!serialized.includes(`"${internal}"`), `DTO leaked internal ${internal}`);
    };

    assert.equal(await read("professional"), null);
    const first = await draft("UNSENT_ONE");
    assert.equal(await read("professional"), null, "Saving does not send");
    assert.equal((await read("workspace"))?.currentRevision?.contribution, "UNSENT_ONE contribution");
    await draft("SENT_TWO");
    assert.equal(await read("professional"), null, "SUPERSEDED unsent draft is still private");
    await submit(2);
    let visible = await read("professional");
    assert.equal(visible?.currentRevision?.contribution, "SENT_TWO contribution");
    assert.deepEqual(visible?.revisions.map(revision => revision.revisionNo), [2]);
    assert.equal(visible?.currentRevision?.references[0]?.worklogRevision.title, worklog.title);
    const submittedId = visible!.currentRevision!.id;
    await decideClosure({ userId: professional, closureId: first.id, operationKey: randomUUID(),
      payload: { action: "REQUEST_CHANGES", expectedRevisionNo: 2, comment: "Please clarify the result" } });
    const third = await draft("UNSENT_THREE");
    await draft("UNSENT_FOUR");
    visible = await read("professional");
    assert.equal(visible?.currentRevisionId, submittedId);
    assert.equal(visible?.version, 2);
    assert.equal(visible?.currentRevision?.status, "SUPERSEDED");
    assert.equal(visible?.currentRevision?.decisionComment, "Please clarify the result");
    assert.deepEqual(visible?.revisions.map(revision => revision.revisionNo), [2]);
    cleanProfessional(visible, ["UNSENT_ONE", "UNSENT_THREE", "UNSENT_FOUR", third.currentRevision!.id]);
    const company = await read("workspace");
    assert.equal(company?.version, 4);
    assert.equal(company?.currentRevision?.contribution, "UNSENT_FOUR contribution");
    assert.deepEqual(company?.revisions.map(revision => revision.revisionNo), [4, 3, 2, 1]);
    assert.deepEqual(await listCollaborations({ userId: outsider }), []);
    assert.deepEqual(await listCollaborations({ userId: owner, workspaceId: otherWorkspaceId }), []);

    // Both the ordinary read and the professional mutation/replay response use the DTO.
    const beforeRevision = await prisma.terraqoCollaboration.findUniqueOrThrow({ where: { id: collaboration.id } });
    const revised = await reviseCollaboration({ userId: owner, workspaceId, collaborationId: collaboration.id,
      operationKey: randomUUID(), payload: { expectedVersion: beforeRevision.version, scope: "Updated accepted scope", roleTitle: "Surveyor", deliverables: ["Plan"] } });
    assert.equal(revised.closure?.currentRevision?.contribution, "UNSENT_FOUR contribution");
    const decision = { userId: professional, collaborationId: collaboration.id, operationKey: randomUUID(),
      payload: { action: "ACCEPT" as const, expectedRevisionNo: 2 } };
    for (let retry = 0; retry < 2; retry++) {
      const response = await decideCollaborationProposal(decision);
      assert.equal(response.closure?.currentRevisionId, submittedId);
      cleanProfessional(response.closure, ["UNSENT_ONE", "UNSENT_THREE", "UNSENT_FOUR"]);
    }
    assert.equal(await prisma.terraqoCollaborationAcceptance.count({ where: { proposal: { collaborationId: collaboration.id, revisionNo: 2 }, party: "PROFESSIONAL" } }), 1);

    const assertHiddenSource = async () => {
      for (const audience of ["workspace", "professional"] as const) {
        const projection = await read(audience);
        assert.deepEqual(projection?.currentRevision?.references, []);
        cleanProfessional(projection, ["SOURCE_TITLE_SENTINEL", "SOURCE_HASH_SENTINEL", source.id]);
      }
    };
    await prisma.terraqoWorklogEntry.update({ where: { id: worklog.id }, data: { visibility: "PRIVATE" } });
    await assertHiddenSource();
    await prisma.terraqoWorklogEntry.update({ where: { id: worklog.id }, data: { visibility: "PUBLIC", deletedAt: new Date() } });
    await assertHiddenSource();
    await prisma.terraqoWorklogEntry.update({ where: { id: worklog.id }, data: { deletedAt: null, lifecycle: "DRAFT" } });
    await assertHiddenSource();
    await prisma.terraqoWorklogEntry.update({ where: { id: worklog.id }, data: { lifecycle: "PUBLISHED", currentRevisionId: null } });
    await assertHiddenSource();
    await prisma.terraqoWorklogEntry.update({ where: { id: worklog.id }, data: { currentRevisionId: source.id, professionalProfileId: otherProfile.id } });
    await assertHiddenSource();
    await prisma.terraqoWorklogEntry.update({ where: { id: worklog.id }, data: { professionalProfileId: profile.id } });
    assert.equal((await read("professional"))?.currentRevision?.references.length, 1);
    const raw = await prisma.terraqoCollaborationClosure.findUniqueOrThrow({ where: { id: first.id }, include: closureProjectionInclude });
    const snapshot = structuredClone(raw);
    projectClosure(raw, "professional", professional);
    projectClosure(raw, "workspace", professional);
    assert.deepEqual(raw, snapshot, "Projection must not mutate shared source data");
    const noSubmission = structuredClone(raw);
    noSubmission.revisions.forEach(revision => { revision.submittedAt = null; });
    assert.equal(projectClosure(noSubmission, "professional", professional), null, "Status alone never proves submission");

    await assert.rejects(submit(4), { status: 409 }, "New accepted scope invalidates an older draft");
    await draft("SENT_FIVE");
    await submit(5);
    visible = await read("professional");
    assert.equal(visible?.currentRevision?.contribution, "SENT_FIVE contribution", "Only explicit submission exposes new content");
    assert.deepEqual(visible?.revisions.map(revision => revision.revisionNo), [5, 2]);
    await decideClosure({ userId: professional, closureId: first.id, operationKey: randomUUID(), payload: { action: "ACCEPT", expectedRevisionNo: 5 } });
    visible = await read("professional");
    assert.equal(visible?.currentRevision?.status, "ACCEPTED");
    assert.equal(visible?.certificate?.closureRevisionNo, 5);
    assert.equal(visible?.certificate?.privateByDefault, true);
    cleanProfessional(visible, ["UNSENT_ONE", "UNSENT_THREE"]);
    console.log("PASS S16 real PostgreSQL: draft-only hidden; submitted exact version/history; workspace drafts; mutation/replay DTO; one acceptance; outsider/workspace isolation; 5 reference revocations; pure projection; explicit resubmit; private certificate");
  } finally {
    try {
      await prisma.$transaction(async tx => {
        await tx.terraqoCollaborationCertificate.deleteMany({ where: { closure: { collaboration: { workspaceId } } } });
        await tx.terraqoConversationContext.deleteMany({ where: { createdById: { in: actors } } });
        await tx.terraqoCollaboration.deleteMany({ where: { workspaceId } });
        await tx.terraqoConversation.deleteMany({ where: { workspaceId } });
        await tx.terraqoWorklogEntry.deleteMany({ where: { authorId: { in: actors } } });
        await tx.terraqoWorkspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
        await tx.user.deleteMany({ where: { id: { in: actors } } });
      });
      const independent = new PrismaClient({ datasourceUrl: connection });
      try {
        const counts = await independent.$transaction([
          independent.user.count(), independent.terraqoWorkspace.count(), independent.terraqoConversation.count(),
          independent.terraqoCollaboration.count(), independent.terraqoClosureRevision.count(),
          independent.terraqoClosureReference.count(), independent.terraqoCollaborationCertificate.count(),
          independent.terraqoWorklogEntry.count(), independent.terraqoWorklogRevision.count(),
        ]);
        assert.ok(counts.every(count => count === 0));
        console.log("PASS S16 fixture cleanup: independent client confirmed zero rows");
      } finally { await independent.$disconnect(); }
    } finally { await prisma.$disconnect(); }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
