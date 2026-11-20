import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { confirmedLocalDisposableDatabaseUrl } from "./lib/confirmed-local-disposable-database";

async function main() {
  const connection = confirmedLocalDisposableDatabaseUrl({ value: process.env.DATABASE_URL,
    expected: process.env.S16_TEST_DATABASE, valueVariable: "DATABASE_URL", expectedVariable: "S16_TEST_DATABASE" });
  assert.equal(new URL(connection).username, "s16_projection_test");
  assert.equal(process.env.S16_TEST_SYNTHETIC, "confirmed");
  const { PrismaClient, Prisma } = await import("@prisma/client");
  const { prisma } = await import("../lib/prisma");
  const { saveClosureDraft, submitClosure, decideClosure } = await import("../lib/terraqo/closure");
  const { reviseCollaboration, decideCollaborationProposal } = await import("../lib/terraqo/collaboration");
  const observer = new PrismaClient({ datasourceUrl: connection, log: [] });
  const owner = randomUUID(), professional = randomUUID(), outsider = randomUUID(), workspaceId = randomUUID();
  const past = new Date("2026-01-01T00:00:00.000Z");
  const rejected = (result: PromiseSettledResult<unknown>) => {
    assert.equal(result.status, "rejected");
    if (result.status !== "rejected") return;
    const error = result.reason;
    assert.ok(error.status === 409 || error.code === "P2034" ||
      (error.code === "P2010" && error.meta?.code === "40001"), "Only domain conflict or serialization abort is allowed");
  };
  // Hold the real parent row, observe each service waiting on a PostgreSQL lock,
  // then release in queue order. This proves contention rather than relying on sleeps.
  const contend = async (id: string, actions: (() => Promise<unknown>)[]) => {
    let release!: () => void, acquired!: () => void;
    const held = new Promise<void>(resolve => { acquired = resolve; });
    const unblock = new Promise<void>(resolve => { release = resolve; });
    const gate = observer.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoCollaboration" WHERE id=${id} FOR UPDATE`);
      acquired();
      await unblock;
    }, { timeout: 15_000 });
    await Promise.race([held, gate.then(() => { throw new Error("Lock gate exited before acquisition"); })]);
    const outcomes: Promise<PromiseSettledResult<unknown>>[] = [];
    let failure: unknown;
    try {
      for (const action of actions) {
        outcomes.push(action().then(value => ({ status: "fulfilled" as const, value }), reason => ({ status: "rejected" as const, reason })));
        const deadline = Date.now() + 3_000;
        for (;;) {
          const [row] = await prisma.$queryRaw<{ waiting: bigint }[]>`SELECT count(*) AS waiting FROM pg_stat_activity
            WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock'
            AND query LIKE '%TerraqoCollaboration%' AND query LIKE '%FOR UPDATE%'`;
          if (Number(row.waiting) >= outcomes.length) break;
          assert.ok(Date.now() < deadline, "Service did not queue on parent collaboration lock");
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    } catch (error) { failure = error; }
    finally { release(); await gate; }
    // Even a failed lock assertion must settle its writers before fixture cleanup.
    const results = await Promise.all(outcomes);
    if (failure) throw failure;
    return results;
  };
  const seed = async () => {
    const conversation = await prisma.terraqoConversation.create({ data: { workspaceId, createdById: owner } });
    const collaboration = await prisma.terraqoCollaboration.create({ data: {
      workspaceId, conversationId: conversation.id, professionalUserId: professional,
      status: "ACCEPTED", acceptedRevisionNo: 1, acceptedAt: past,
      proposals: { create: { revisionNo: 1, scope: "SCOPE_A", roleTitle: "Role A", status: "ACCEPTED",
        decidedAt: past, createdById: owner, operationKey: randomUUID(), operationFingerprint: "fixture" } },
    } });
    const draftInput = { userId: owner, workspaceId, collaborationId: collaboration.id, operationKey: randomUUID(),
      payload: { contribution: "Contribution under scope A", deliverables: ["Plan"], result: "Synthetic result",
        referenceRevisionIds: [], expectedVersion: null } };
    const draft = await saveClosureDraft(draftInput);
    assert.deepEqual(await saveClosureDraft(draftInput), draft);
    const current = await prisma.terraqoCollaboration.findUniqueOrThrow({ where: { id: collaboration.id } });
    const reviseInput = { userId: owner, workspaceId, collaborationId: collaboration.id, operationKey: randomUUID(),
      payload: { expectedVersion: current.version, scope: "SCOPE_B", roleTitle: "Role B", deliverables: ["Revised plan"] } };
    await reviseCollaboration(reviseInput);
    const acceptInput = { userId: professional, collaborationId: collaboration.id, operationKey: randomUUID(),
      payload: { action: "ACCEPT" as const, expectedRevisionNo: 2 } };
    const submitInput = { userId: owner, workspaceId, collaborationId: collaboration.id, operationKey: randomUUID(),
      payload: { expectedRevisionNo: 1 } };
    const decideInput = { userId: professional, closureId: draft.id, operationKey: randomUUID(),
      payload: { action: "ACCEPT" as const, expectedRevisionNo: 1 } };
    const reviseAgain = async () => {
      const latest = await prisma.terraqoCollaboration.findUniqueOrThrow({ where: { id: collaboration.id } });
      return reviseCollaboration({ ...reviseInput, operationKey: randomUUID(), payload: { ...reviseInput.payload, expectedVersion: latest.version } });
    };
    return { collaboration, draft, draftInput, reviseInput, acceptInput, submitInput, decideInput, reviseAgain };
  };
  const state = (id: string) => prisma.terraqoCollaboration.findUniqueOrThrow({ where: { id }, include: {
    proposals: { orderBy: { revisionNo: "asc" }, include: { acceptances: true } },
    closure: { include: { revisions: { orderBy: { revisionNo: "asc" } }, certificate: true } },
  } });
  try {
    assert.deepEqual(await prisma.$queryRaw`SELECT current_user AS role, current_database() AS database`,
      [{ role: "s16_projection_test", database: "s16_projection_test" }]);
    await prisma.user.createMany({ data: [owner, professional, outsider].map(id => ({ id, email: `${id}@s16-scope.invalid` })) });
    await prisma.terraqoWorkspace.create({ data: { id: workspaceId, name: "S16 scope synthetic", slug: workspaceId } });

    const sentFirst = await seed();
    const firstRace = await contend(sentFirst.collaboration.id, [
      () => submitClosure(sentFirst.submitInput), () => decideCollaborationProposal(sentFirst.acceptInput),
    ]);
    assert.equal(firstRace[0].status, "fulfilled"); rejected(firstRace[1]);
    await assert.rejects(decideCollaborationProposal(sentFirst.acceptInput), { status: 409 });
    await assert.rejects(sentFirst.reviseAgain(), { status: 409 });
    const reviewing = await state(sentFirst.collaboration.id);
    assert.equal(reviewing.acceptedRevisionNo, 1);
    assert.equal(reviewing.closure?.revisions[0].status, "SUBMITTED");
    // Exact payload replays bypass mutation guards and leave persisted state unchanged.
    assert.deepEqual(await submitClosure(sentFirst.submitInput), await submitClosure(sentFirst.submitInput));
    await reviseCollaboration(sentFirst.reviseInput);
    await saveClosureDraft(sentFirst.draftInput);
    assert.deepEqual(await state(sentFirst.collaboration.id), reviewing);
    await assert.rejects(submitClosure({ ...sentFirst.submitInput, payload: { expectedRevisionNo: 2 } }), { status: 409 });
    await assert.rejects(decideClosure({ ...sentFirst.decideInput, userId: outsider }), { status: 404 });
    assert.deepEqual(await state(sentFirst.collaboration.id), reviewing);
    const certificateRace = await contend(sentFirst.collaboration.id, [
      () => decideClosure(sentFirst.decideInput), () => decideCollaborationProposal(sentFirst.acceptInput), sentFirst.reviseAgain,
    ]);
    assert.equal(certificateRace[0].status, "fulfilled"); rejected(certificateRace[1]); rejected(certificateRace[2]);
    const closedA = await state(sentFirst.collaboration.id);
    assert.equal(closedA.closure?.certificate?.proposalRevisionNo, 1);
    assert.equal(closedA.closure?.certificate?.scope, "SCOPE_A");
    assert.equal(closedA.proposals[1].status, "PENDING");
    if (certificateRace[0].status === "fulfilled") assert.deepEqual(await decideClosure(sentFirst.decideInput), certificateRace[0].value);
    await assert.rejects(decideClosure({ ...sentFirst.decideInput, payload: { ...sentFirst.decideInput.payload, action: "DECLINE", comment: "Changed replay" } }), { status: 409 });
    assert.deepEqual(await state(sentFirst.collaboration.id), closedA);
    console.log("PASS S16 scope: submit wins race; scope mutations blocked; decision wins race; certificate remains scope A; exact replays and conflicts do not mutate");

    const scopeFirst = await seed();
    const secondRace = await contend(scopeFirst.collaboration.id, [
      () => decideCollaborationProposal(scopeFirst.acceptInput), () => submitClosure(scopeFirst.submitInput),
    ]);
    assert.equal(secondRace[0].status, "fulfilled"); rejected(secondRace[1]);
    const stale = await state(scopeFirst.collaboration.id);
    await assert.rejects(submitClosure(scopeFirst.submitInput), { status: 409 });
    assert.deepEqual(await state(scopeFirst.collaboration.id), stale, "Stale draft refusal rolls back fully");
    assert.equal(stale.acceptedRevisionNo, 2);
    assert.equal(stale.closure?.certificate, null);
    assert.equal(stale.closure?.revisions[0].status, "DRAFT");
    const fresh = await saveClosureDraft({ ...scopeFirst.draftInput, operationKey: randomUUID(),
      payload: { ...scopeFirst.draftInput.payload, contribution: "Contribution reviewed under scope B", expectedVersion: 1 } });
    await submitClosure({ ...scopeFirst.submitInput, operationKey: randomUUID(), payload: { expectedRevisionNo: 2 } });
    const acceptedScopeBeforeReplay = await state(scopeFirst.collaboration.id);
    const scopeReplay = await decideCollaborationProposal(scopeFirst.acceptInput);
    assert.equal(scopeReplay.status, "CLOSURE_PROPOSED", "Replaying acceptance must not reopen submitted closure");
    assert.deepEqual(await state(scopeFirst.collaboration.id), acceptedScopeBeforeReplay);
    const acceptFresh = { ...scopeFirst.decideInput, operationKey: randomUUID(), payload: { action: "ACCEPT" as const, expectedRevisionNo: 2 } };
    const duplicates = await contend(scopeFirst.collaboration.id, [() => decideClosure(acceptFresh), () => decideClosure(acceptFresh)]);
    assert.equal(duplicates[0].status, "fulfilled"); assert.equal(duplicates[1].status, "fulfilled");
    if (duplicates[0].status === "fulfilled" && duplicates[1].status === "fulfilled") assert.deepEqual(duplicates[0].value, duplicates[1].value);
    const closedB = await state(scopeFirst.collaboration.id);
    assert.equal(closedB.closure?.certificate?.scope, "SCOPE_B");
    assert.equal(closedB.closure?.certificate?.proposalRevisionNo, 2);
    assert.equal(closedB.closure?.certificate?.closureRevisionId, fresh.currentRevision!.id);
    assert.equal(await prisma.terraqoCollaborationCertificate.count({ where: { closureId: fresh.id } }), 1);
    console.log("PASS S16 scope: acceptance wins race; old draft cannot send; explicit new draft certifies B; concurrent identical closure acceptance produces one identical certificate");

    const legacy = await seed();
    await submitClosure(legacy.submitInput);
    await prisma.terraqoCollaboration.update({ where: { id: legacy.collaboration.id }, data: { status: "IN_PROGRESS" } });
    await assert.rejects(legacy.reviseAgain(), { status: 409 });
    await assert.rejects(decideCollaborationProposal(legacy.acceptInput), { status: 409 });
    await prisma.terraqoCollaboration.update({ where: { id: legacy.collaboration.id }, data: { status: "CLOSURE_PROPOSED" } });
    await prisma.terraqoClosureRevision.update({ where: { id: legacy.draft.currentRevision!.id }, data: { status: "DRAFT" } });
    await assert.rejects(legacy.reviseAgain(), { status: 409 });
    await assert.rejects(decideCollaborationProposal(legacy.acceptInput), { status: 409 });
    await prisma.terraqoClosureRevision.update({ where: { id: legacy.draft.currentRevision!.id }, data: { status: "SUBMITTED", createdAt: past } });
    const tie = await state(legacy.collaboration.id);
    await assert.rejects(decideClosure(legacy.decideInput), { status: 409 });
    assert.deepEqual(await state(legacy.collaboration.id), tie, "Ambiguous binding cannot partially decide or emit certificate");
    await prisma.terraqoCollaboration.update({ where: { id: legacy.collaboration.id }, data: { acceptedAt: null } });
    await assert.rejects(decideClosure(legacy.decideInput), { status: 409 });
    await decideClosure({ ...legacy.decideInput, operationKey: randomUUID(), payload: {
      action: "REQUEST_CHANGES", expectedRevisionNo: 1, comment: "Resolve legacy scope evidence",
    } });
    assert.equal((await state(legacy.collaboration.id)).closure?.certificate, null);
    const uncertain = await seed();
    await prisma.terraqoCollaborationProposal.update({ where: { collaborationId_revisionNo: { collaborationId: uncertain.collaboration.id, revisionNo: 1 } }, data: { decidedAt: null } });
    await assert.rejects(submitClosure(uncertain.submitInput), { status: 409 });
    console.log("PASS S16 scope: inconsistent review states fail closed; tied/missing acceptance evidence blocks certification/submission; requesting correction still works");
  } finally {
    try {
      await prisma.$transaction(async tx => {
        await tx.terraqoCollaborationCertificate.deleteMany({ where: { closure: { collaboration: { workspaceId } } } });
        await tx.terraqoConversationContext.deleteMany({ where: { conversation: { workspaceId } } });
        await tx.terraqoCollaboration.deleteMany({ where: { workspaceId } });
        await tx.terraqoConversation.deleteMany({ where: { workspaceId } });
        await tx.terraqoWorkspace.deleteMany({ where: { id: workspaceId } });
        await tx.user.deleteMany({ where: { id: { in: [owner, professional, outsider] } } });
      });
      const counts = await observer.$transaction([observer.user.count(), observer.terraqoCollaboration.count(),
        observer.terraqoCollaborationProposal.count(), observer.terraqoCollaborationAcceptance.count(),
        observer.terraqoClosureRevision.count(), observer.terraqoCollaborationCertificate.count(), observer.terraqoConversationContext.count()]);
      assert.ok(counts.every(count => count === 0));
      console.log("PASS S16 scope fixture cleanup: independent client zero rows");
    } finally { await Promise.all([prisma.$disconnect(), observer.$disconnect()]); }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
