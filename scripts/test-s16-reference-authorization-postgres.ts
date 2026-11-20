import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { confirmedLocalDisposableDatabaseUrl } from "./lib/confirmed-local-disposable-database";

async function main() {
  const connection = confirmedLocalDisposableDatabaseUrl({ value: process.env.DATABASE_URL,
    expected: process.env.S16_TEST_DATABASE, valueVariable: "DATABASE_URL", expectedVariable: "S16_TEST_DATABASE" });
  assert.equal(new URL(connection).username, "s16_projection_test");
  assert.equal(process.env.S16_TEST_SYNTHETIC, "confirmed");
  const { PrismaClient } = await import("@prisma/client");
  const { prisma } = await import("../lib/prisma");
  const { saveClosureDraft, submitClosure, decideClosure } = await import("../lib/terraqo/closure");
  const { listCollaborations } = await import("../lib/terraqo/collaboration");
  const observer = new PrismaClient({ datasourceUrl: connection });
  const owner = randomUUID(), professional = randomUUID(), outsider = randomUUID();
  const workspaceId = randomUUID(), otherWorkspaceId = randomUUID();
  const actors = [owner, professional, outsider];
  const title = "REFERENCE_TITLE_SENTINEL", hash = "REFERENCE_HASH_SENTINEL";
  const clean = (value: unknown, hidden = false) => {
    const text = JSON.stringify(value);
    for (const internal of ["accessSnapshot", "contentHash", "currentFor", "operationKey", "operationFingerprint", "submitFingerprint", "decisionFingerprint"])
      assert.ok(!text.includes(`"${internal}"`), `Leaked internal ${internal}`);
    assert.ok(!text.includes(hash));
    if (hidden) assert.ok(!text.includes(title), "Withdrawn title leaked");
  };
  try {
    assert.deepEqual(await prisma.$queryRaw`SELECT current_user AS role, current_database() AS database`,
      [{ role: "s16_projection_test", database: "s16_projection_test" }]);
    await prisma.user.createMany({ data: actors.map(id => ({ id, email: `${id}@s16-reference.invalid` })) });
    await prisma.terraqoWorkspace.createMany({ data: [workspaceId, otherWorkspaceId].map(id => ({ id, name: "Synthetic S16", slug: id })) });
    // Identity privacy is independent of the public CV evidence permission.
    const profile = await prisma.terraqoProfessionalProfile.create({ data: {
      userId: professional, liveCvEnabled: true, liveCvVisibility: "PUBLIC", visibility: "PRIVATE",
    } });
    const otherProfile = await prisma.terraqoProfessionalProfile.create({ data: {
      userId: outsider, liveCvEnabled: true, liveCvVisibility: "PUBLIC",
    } });
    const project = await prisma.project.create({ data: {
      terraqoWorkspaceId: workspaceId, title: "Public synthetic project", slug: randomUUID(),
      summary: "Synthetic", description: "Synthetic", servicesApplied: [], isPublic: true,
    } });
    const worklog = await prisma.terraqoWorklogEntry.create({ data: {
      professionalProfileId: profile.id, authorId: professional, title, summary: "Synthetic",
      visibility: "PUBLIC", lifecycle: "PUBLISHED", projectId: project.id,
    } });
    const source = await prisma.terraqoWorklogRevision.create({ data: {
      worklogId: worklog.id, revisionNo: 1, title, summary: "Synthetic", contentHash: hash, createdById: professional,
    } });
    const replacement = await prisma.terraqoWorklogRevision.create({ data: {
      worklogId: worklog.id, revisionNo: 2, title: "Replacement", summary: "Synthetic", contentHash: "new-hash", createdById: professional,
    } });
    const wrongRoot = await prisma.terraqoWorklogEntry.create({ data: {
      professionalProfileId: profile.id, authorId: professional, title: "Wrong root", summary: "Synthetic", visibility: "PUBLIC",
    } });
    const restore = async () => {
      await prisma.terraqoWorklogEntry.update({ where: { id: wrongRoot.id }, data: { currentRevisionId: null } });
      await prisma.terraqoProfessionalProfile.update({ where: { id: profile.id }, data: { liveCvEnabled: true, liveCvVisibility: "PUBLIC" } });
      await prisma.project.update({ where: { id: project.id }, data: { isPublic: true, deletedAt: null } });
      await prisma.terraqoWorklogRevision.update({ where: { id: source.id }, data: { contentHash: hash } });
      await prisma.terraqoWorklogEntry.update({ where: { id: worklog.id }, data: {
        workspaceId: null, projectId: project.id, currentRevisionId: source.id,
        professionalProfileId: profile.id, visibility: "PUBLIC", lifecycle: "PUBLISHED", deletedAt: null,
      } });
    };
    const entry = (data: Prisma.TerraqoWorklogEntryUncheckedUpdateInput) =>
      prisma.terraqoWorklogEntry.update({ where: { id: worklog.id }, data });
    const scenarios: { name: string; withdraw: () => Promise<unknown>; sourceDenied?: boolean; snapshot?: Prisma.InputJsonValue }[] = [
      { name: "disabled CV", withdraw: () => prisma.terraqoProfessionalProfile.update({ where: { id: profile.id }, data: { liveCvEnabled: false } }) },
      { name: "private CV", withdraw: () => prisma.terraqoProfessionalProfile.update({ where: { id: profile.id }, data: { liveCvVisibility: "PRIVATE" } }) },
      { name: "private project", withdraw: () => prisma.project.update({ where: { id: project.id }, data: { isPublic: false } }) },
      { name: "deleted project", withdraw: () => prisma.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } }) },
      { name: "legacy company PUBLIC_CV", withdraw: () => entry({ workspaceId }) },
      { name: "different owner", withdraw: () => entry({ professionalProfileId: otherProfile.id }) },
      { name: "private entry", withdraw: () => entry({ visibility: "PRIVATE" }) },
      { name: "deleted entry", withdraw: () => entry({ deletedAt: new Date() }) },
      { name: "unpublished entry", withdraw: () => entry({ lifecycle: "DRAFT" }) },
      { name: "replaced revision", withdraw: () => entry({ currentRevisionId: replacement.id }) },
      { name: "missing current revision", withdraw: () => entry({ currentRevisionId: null }) },
      { name: "wrong current root", withdraw: async () => {
        await entry({ currentRevisionId: null });
        await prisma.terraqoWorklogEntry.update({ where: { id: wrongRoot.id }, data: { currentRevisionId: source.id } });
      } },
      { name: "changed exact hash", sourceDenied: false, withdraw: () => prisma.terraqoWorklogRevision.update({ where: { id: source.id }, data: { contentHash: "changed-hash" } }) },
      ...[{}, { kind: "PUBLIC_SELECTION" }, { kind: "PUBLIC_CV", policy: "future-policy" },
        { kind: "PUBLIC_CV", revisionId: replacement.id, title, contentHash: hash, capturedAt: new Date().toISOString() },
        { kind: "PUBLIC_CV", revisionId: source.id, title, contentHash: "wrong-hash", capturedAt: new Date().toISOString() },
      ].map((snapshot, index) => ({ name: `invalid snapshot ${index + 1}`, snapshot: snapshot as Prisma.InputJsonValue,
        sourceDenied: false, withdraw: async () => {} })),
    ];
    for (const scenario of scenarios) {
      await restore();
      const conversation = await prisma.terraqoConversation.create({ data: { workspaceId, createdById: owner } });
      const past = new Date("2026-01-01T00:00:00Z");
      const collaboration = await prisma.terraqoCollaboration.create({ data: {
        workspaceId, conversationId: conversation.id, professionalUserId: professional,
        status: "ACCEPTED", acceptedRevisionNo: 1, acceptedAt: past,
        proposals: { create: { revisionNo: 1, roleTitle: "Surveyor", scope: "Synthetic scope", status: "ACCEPTED",
          decidedAt: past, createdById: owner, operationKey: randomUUID(), operationFingerprint: "fixture" } },
      } });
      const draftInput = { userId: owner, workspaceId, collaborationId: collaboration.id, operationKey: randomUUID(),
        payload: { contribution: "Contribution", deliverables: ["Plan"], result: "Result", referenceRevisionIds: [source.id], expectedVersion: null } };
      const first = await saveClosureDraft(draftInput);
      clean(first);
      assert.equal(first.currentRevision?.references[0]?.worklogRevision.title, title);
      const reference = await prisma.terraqoClosureReference.findFirstOrThrow({ where: { closureRevisionId: first.currentRevision!.id } });
      const withdraw = async () => {
        await scenario.withdraw();
        if (scenario.snapshot) await prisma.terraqoClosureReference.update({ where: { id: reference.id }, data: { accessSnapshot: scenario.snapshot } });
      };
      const recover = async () => {
        await restore();
        await prisma.terraqoClosureReference.update({ where: { id: reference.id }, data: { accessSnapshot: reference.accessSnapshot as Prisma.InputJsonValue } });
      };
      const persisted = () => observer.terraqoCollaboration.findUniqueOrThrow({ where: { id: collaboration.id }, include: {
        closure: { include: { revisions: { include: { references: true } }, certificate: true } },
        conversation: { include: { contexts: true } },
      } });
      const read = async (audience: "workspace" | "professional") => {
        const rows = await listCollaborations({ userId: audience === "workspace" ? owner : professional,
          ...(audience === "workspace" ? { workspaceId } : {}) });
        return rows.find(row => row.id === collaboration.id)!.closure;
      };
      const hidden = (value: Awaited<ReturnType<typeof saveClosureDraft>>) => {
        clean(value, true);
        assert.deepEqual(value.currentRevision?.references, []);
        assert.ok(value.revisions.every(revision => revision.references.length === 0));
        assert.ok(!JSON.stringify(value).includes(source.id));
      };
      assert.equal(await read("professional"), null);
      await withdraw();
      let before = await persisted();
      hidden(await saveClosureDraft(draftInput));
      if (scenario.sourceDenied !== false) await assert.rejects(saveClosureDraft({ ...draftInput,
        operationKey: randomUUID(), payload: { ...draftInput.payload, expectedVersion: 1 } }), { status: 403 });
      const submitInput = { userId: owner, workspaceId, collaborationId: collaboration.id,
        operationKey: randomUUID(), payload: { expectedRevisionNo: 1 } };
      await assert.rejects(submitClosure(submitInput), { status: 409 });
      assert.deepEqual(await persisted(), before, "Failed save/submit and replay must leave state unchanged");
      hidden((await read("workspace"))!);
      assert.equal(await read("professional"), null);
      await assert.rejects(saveClosureDraft({ ...draftInput, workspaceId: otherWorkspaceId }), { status: 409 });
      await assert.rejects(saveClosureDraft({ ...draftInput, payload: { ...draftInput.payload, result: "Different payload" } }), { status: 409 });
      await recover();
      clean(await submitClosure(submitInput));
      await withdraw();
      before = await persisted();
      const decisionInput = { userId: professional, closureId: first.id, operationKey: randomUUID(),
        payload: { action: "ACCEPT" as const, expectedRevisionNo: 1 } };
      await assert.rejects(decideClosure(decisionInput), { status: 409 });
      assert.deepEqual(await persisted(), before, "ACCEPT rollback must include decision, certificate, context and parent state");
      hidden(await submitClosure(submitInput));
      hidden(await saveClosureDraft(draftInput));
      for (const audience of ["workspace", "professional"] as const) hidden((await read(audience))!);
      await assert.rejects(decideClosure({ ...decisionInput, userId: outsider }), { status: 404 });
      await recover();
      const accepted = await decideClosure(decisionInput);
      clean(accepted);
      assert.equal(accepted.certificate?.closureRevisionNo, 1);
      await withdraw();
      before = await persisted();
      hidden(await decideClosure(decisionInput));
      hidden(await saveClosureDraft(draftInput));
      for (const audience of ["workspace", "professional"] as const) hidden((await read(audience))!);
      assert.deepEqual(await persisted(), before, "Accepted replay must not duplicate certificate/context or modify state");
      assert.equal(await observer.terraqoCollaborationCertificate.count({ where: { closureId: first.id } }), 1);
      assert.equal(await observer.terraqoConversationContext.count({ where: { conversationId: conversation.id, kind: "CLOSURE" } }), 1);
      console.log(`PASS S16 reference: ${scenario.name}; read/replay redaction, write denial and atomic rollback`);
    }
    await restore();
    // Absence of a project is canonical standalone eligibility, not missing permission.
    await entry({ projectId: null });
    const { loadAuthorizedClosureReferenceSources } = await import("../lib/terraqo/closure-reference-access");
    assert.equal((await loadAuthorizedClosureReferenceSources(prisma, [source.id], professional)).length, 1);
    assert.equal((await loadAuthorizedClosureReferenceSources(prisma, [source.id], outsider)).length, 0);
    assert.deepEqual(await listCollaborations({ userId: outsider }), []);
    assert.deepEqual(await listCollaborations({ userId: owner, workspaceId: otherWorkspaceId }), []);

    const raceConversation = await prisma.terraqoConversation.create({ data: { workspaceId, createdById: owner } });
    const past = new Date("2026-01-01T00:00:00Z");
    const raceCollaboration = await prisma.terraqoCollaboration.create({ data: {
      workspaceId, conversationId: raceConversation.id, professionalUserId: professional,
      status: "ACCEPTED", acceptedRevisionNo: 1, acceptedAt: past,
      proposals: { create: { revisionNo: 1, roleTitle: "Surveyor", scope: "Race scope", status: "ACCEPTED",
        decidedAt: past, createdById: owner, operationKey: randomUUID(), operationFingerprint: "fixture" } },
    } });
    const raceDraft = await saveClosureDraft({ userId: owner, workspaceId, collaborationId: raceCollaboration.id,
      operationKey: randomUUID(), payload: { contribution: "Race", deliverables: ["Plan"], result: "Result",
        referenceRevisionIds: [source.id], expectedVersion: null } });
    await submitClosure({ userId: owner, workspaceId, collaborationId: raceCollaboration.id,
      operationKey: randomUUID(), payload: { expectedRevisionNo: 1 } });
    const raceState = () => observer.terraqoCollaboration.findUniqueOrThrow({ where: { id: raceCollaboration.id }, include: {
      closure: { include: { currentRevision: true, certificate: true } }, conversation: { include: { contexts: true } },
    } });
    const beforeRace = await raceState();
    const raceDecision = { userId: professional, closureId: raceDraft.id, operationKey: randomUUID(),
      payload: { action: "ACCEPT" as const, expectedRevisionNo: 1 } };
    type Outcome = { ok: true; value: Awaited<ReturnType<typeof decideClosure>> } | { ok: false; error: unknown };
    let outcome: Promise<Outcome> | undefined;
    // Pause ACCEPT on its actual revision lock after it established a Serializable
    // snapshot. Commit a CV withdrawal before releasing it. Either valid serial
    // order is allowed; subsequent DTOs must redact even if ACCEPT serialized first.
    try {
      await observer.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM icc."TerraqoClosureRevision" WHERE id=${raceDraft.currentRevision!.id} FOR UPDATE`;
        outcome = decideClosure(raceDecision).then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
        const deadline = Date.now() + 4_000;
        for (;;) {
          const [row] = await tx.$queryRaw<{ waiting: bigint }[]>`SELECT count(*) AS waiting FROM pg_stat_activity
            WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock'
            AND query LIKE '%TerraqoClosureRevision%' AND query LIKE '%FOR UPDATE%'`;
          if (Number(row.waiting) > 0) break;
          assert.ok(Date.now() < deadline, "ACCEPT never reached the revision lock barrier");
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        await tx.terraqoProfessionalProfile.update({ where: { id: profile.id }, data: { liveCvEnabled: false } });
      }, { timeout: 10_000 });
    } finally {
      // Even a failed barrier must settle the service before fixture cleanup.
      if (outcome) await outcome;
    }
    assert.ok(outcome);
    const raced = await outcome;
    if (raced.ok) {
      clean(raced.value, true);
      assert.deepEqual(raced.value.currentRevision?.references, []);
      assert.equal(raced.value.certificate?.closureRevisionNo, 1);
      clean(await decideClosure(raceDecision), true);
      assert.equal(await observer.terraqoCollaborationCertificate.count({ where: { closureId: raceDraft.id } }), 1);
      assert.equal(await observer.terraqoConversationContext.count({ where: { conversationId: raceConversation.id, kind: "CLOSURE" } }), 1);
    } else {
      const error = raced.error as { status?: number; code?: string; meta?: { code?: string } };
      assert.ok(error.status === 409 || error.code === "P2034" || (error.code === "P2010" && error.meta?.code === "40001"));
      assert.deepEqual(await raceState(), beforeRace, "Failed concurrent ACCEPT must roll back completely");
    }
    for (const audience of ["workspace", "professional"] as const) {
      const rows = await listCollaborations({ userId: audience === "workspace" ? owner : professional,
        ...(audience === "workspace" ? { workspaceId } : {}) });
      const closure = rows.find(row => row.id === raceCollaboration.id)!.closure;
      clean(closure, true);
      assert.deepEqual(closure?.currentRevision?.references, []);
    }
    console.log(`PASS S16 CV withdrawal/ACCEPT lock barrier: ${raced.ok ? "acceptance serialized first" : "acceptance rolled back"}; post-commit DTOs redacted`);
  } finally {
    try {
      await prisma.$transaction(async tx => {
        await tx.terraqoCollaborationCertificate.deleteMany({ where: { closure: { collaboration: { workspaceId } } } });
        await tx.terraqoConversationContext.deleteMany({ where: { conversation: { workspaceId } } });
        await tx.terraqoCollaboration.deleteMany({ where: { workspaceId } });
        await tx.terraqoConversation.deleteMany({ where: { workspaceId } });
        await tx.terraqoWorklogEntry.updateMany({ where: { authorId: { in: actors } }, data: { currentRevisionId: null } });
        await tx.terraqoWorklogEntry.deleteMany({ where: { authorId: { in: actors } } });
        await tx.project.deleteMany({ where: { terraqoWorkspaceId: workspaceId } });
        await tx.terraqoWorkspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
        await tx.user.deleteMany({ where: { id: { in: actors } } });
      });
      const counts = await observer.$transaction([observer.user.count(), observer.project.count(), observer.terraqoWorkspace.count(),
        observer.terraqoWorklogEntry.count(), observer.terraqoWorklogRevision.count(), observer.terraqoCollaboration.count(),
        observer.terraqoClosureReference.count(), observer.terraqoClosureRevision.count(), observer.terraqoCollaborationCertificate.count(),
        observer.terraqoConversation.count(), observer.terraqoConversationContext.count()]);
      assert.ok(counts.every(count => count === 0));
      console.log("PASS S16 reference cleanup: independent client confirmed zero fixture rows");
    } finally { await Promise.all([observer.$disconnect(), prisma.$disconnect()]); }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
