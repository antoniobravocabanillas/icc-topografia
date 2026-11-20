import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { confirmedLocalDisposableDatabaseUrl } from "./lib/confirmed-local-disposable-database";

async function main() {
  const connection = confirmedLocalDisposableDatabaseUrl({ value: process.env.DATABASE_URL,
    expected: process.env.S16_TEST_DATABASE, valueVariable: "DATABASE_URL", expectedVariable: "S16_TEST_DATABASE" });
  assert.equal(new URL(connection).username, "s16_cancellation_test");
  assert.equal(process.env.S16_TEST_DATABASE, "s16_cancellation_test");
  assert.equal(process.env.S16_TEST_SYNTHETIC, "confirmed");
  const { PrismaClient, Prisma } = await import("@prisma/client");
  const { prisma } = await import("../lib/prisma");
  const { cancelCollaboration, listCollaborations, decideCollaborationProposal } = await import("../lib/terraqo/collaboration");
  const { saveClosureDraft, submitClosure, decideClosure } = await import("../lib/terraqo/closure");
  const { terraqoCollaborationCancellationSchema: schema } = await import("../lib/validations/terraqo");
  const observer = new PrismaClient({ datasourceUrl: connection, log: [] });
  const owner = randomUUID(), manager = randomUUID(), professional = randomUUID(), outsider = randomUUID(), admin = randomUUID();
  const workspaceId = randomUUID(), otherWorkspaceId = randomUUID();
  const users = [owner, manager, professional, outsider, admin], workspaces = [workspaceId, otherWorkspaceId];
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const receiptId = (input: { workspaceId: string; userId: string; operationKey: string }) =>
    `collaboration-cancel:v1:${hash([input.workspaceId, input.userId, input.operationKey.trim().toLowerCase()])}`;
  const state = (id: string) => observer.terraqoCollaboration.findUniqueOrThrow({ where: { id }, include: {
    proposals: { orderBy: { revisionNo: "asc" }, include: { acceptances: true } },
    closure: { include: { revisions: { orderBy: { revisionNo: "asc" }, include: { references: true } }, certificate: true } },
  } });
  const events = (id: string) => observer.activityLog.findMany({ where: { entityType: "TerraqoCollaboration", entityId: id } });
  const seed = async (status: "PROPOSAL_PENDING" | "ACCEPTED" | "IN_PROGRESS" | "CHANGES_REQUESTED" = "ACCEPTED", tenant = workspaceId) => {
    const past = new Date("2026-01-01T00:00:00.000Z");
    const conversation = await prisma.terraqoConversation.create({ data: { workspaceId: tenant, createdById: owner } });
    return prisma.terraqoCollaboration.create({ data: {
      workspaceId: tenant, conversationId: conversation.id, professionalUserId: professional, status,
      ...(status === "PROPOSAL_PENDING" ? {} : { acceptedRevisionNo: 1, acceptedAt: past }),
      proposals: { create: { revisionNo: 1, scope: "Synthetic accepted scope", roleTitle: "Surveyor",
        status: status === "PROPOSAL_PENDING" ? "PENDING" : "ACCEPTED", decidedAt: past,
        createdById: owner, operationKey: randomUUID(), operationFingerprint: "fixture",
        acceptances: { create: { party: "WORKSPACE", actorId: owner } },
      } },
    } });
  };
  const inputFor = (collaboration: { id: string; workspaceId: string; version: number }) => ({
    userId: owner, workspaceId: collaboration.workspaceId, collaborationId: collaboration.id, operationKey: randomUUID(),
    payload: { expectedVersion: collaboration.version, reason: "  Cancelación solicitada por el responsable.  " },
  });
  const withDraft = async () => {
    const collaboration = await seed();
    const draftInput = { userId: owner, workspaceId, collaborationId: collaboration.id, operationKey: randomUUID(),
      payload: { contribution: "Synthetic contribution to accepted scope", deliverables: ["Plan"], result: "Synthetic result",
        referenceRevisionIds: [], expectedVersion: null } };
    const draft = await saveClosureDraft(draftInput);
    return { collaboration, draft, draftInput, cancel: inputFor(await state(collaboration.id)),
      submit: { userId: owner, workspaceId, collaborationId: collaboration.id, operationKey: randomUUID(), payload: { expectedRevisionNo: 1 } },
      decide: { userId: professional, closureId: draft.id, operationKey: randomUUID(), payload: { action: "ACCEPT" as const, expectedRevisionNo: 1 } },
    };
  };
  const conflict = (result: PromiseSettledResult<unknown>) => {
    assert.equal(result.status, "rejected");
    if (result.status !== "rejected") return;
    assert.ok(result.reason.status === 409 || result.reason.code === "P2034" ||
      (result.reason.code === "P2010" && result.reason.meta?.code === "40001"), "Expected domain/serialization conflict");
  };
  // Both callers must be observed queued in pg_stat_activity before releasing
  // the parent. This proves actual contention, independent of scheduling speed.
  const contend = async (ids: string[], actions: (() => Promise<unknown>)[], beforeRelease?: () => Promise<unknown>) => {
    let release!: () => void, acquired!: () => void;
    const held = new Promise<void>(resolve => { acquired = resolve; });
    const unblock = new Promise<void>(resolve => { release = resolve; });
    const gate = observer.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoCollaboration" WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`);
      acquired(); await unblock;
    }, { timeout: 20_000 });
    await Promise.race([held, gate.then(() => { throw new Error("Parent lock not acquired"); })]);
    const outcomes: Promise<PromiseSettledResult<unknown>>[] = [];
    let failure: unknown;
    try {
      for (const action of actions) {
        outcomes.push(action().then(value => ({ status: "fulfilled" as const, value }), reason => ({ status: "rejected" as const, reason })));
        const deadline = Date.now() + 5_000;
        for (;;) {
          const [row] = await prisma.$queryRaw<{ waiting: bigint }[]>`SELECT count(*) AS waiting FROM pg_stat_activity
            WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock'
            AND query LIKE '%TerraqoCollaboration%' AND query LIKE '%FOR UPDATE%'`;
          if (Number(row.waiting) >= outcomes.length) break;
          assert.ok(Date.now() < deadline, "Writer did not queue on parent lock");
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      await beforeRelease?.();
    } catch (error) { failure = error; }
    finally { release(); await gate; }
    const results = await Promise.all(outcomes);
    if (failure) throw failure;
    return results;
  };
  try {
    assert.deepEqual(await observer.$queryRaw`SELECT current_user AS role, current_database() AS database`,
      [{ role: "s16_cancellation_test", database: "s16_cancellation_test" }]);
    await prisma.user.createMany({ data: users.map(id => ({ id, name: id === owner ? "Original responsible" : "Synthetic actor",
      email: `${id}@s16-cancel.invalid`, ...(id === admin ? { role: "SUPER_ADMIN" as const } : {}) })) });
    for (const id of workspaces) await prisma.terraqoWorkspace.create({ data: { id, name: "S16 cancellation synthetic", slug: id,
      members: { create: [{ userId: owner, role: "OWNER" }, { userId: manager, role: "MANAGER" },
        { userId: professional, role: "PROFESSIONAL" }, { userId: outsider, role: "VIEWER" }] },
    } });

    for (const payload of [{ reason: " " , expectedVersion: 1 }, { reason: "x".repeat(1201), expectedVersion: 1 },
      { reason: "x" }, { expectedVersion: 1 }, { reason: "x", expectedVersion: 0 }, { reason: "x", expectedVersion: 1.5 },
      { reason: "x", expectedVersion: 2147483647 }]) assert.equal(schema.safeParse(payload).success, false);
    assert.equal(schema.parse({ reason: ` ${"x".repeat(1200)} `, expectedVersion: 1 }).reason.length, 1200);

    for (const status of ["PROPOSAL_PENDING", "ACCEPTED", "IN_PROGRESS", "CHANGES_REQUESTED"] as const) {
      const collaboration = await seed(status), input = inputFor(collaboration), before = await state(collaboration.id);
      await assert.rejects(cancelCollaboration({ ...input, operationKey: "" }), { status: 400 });
      await assert.rejects(cancelCollaboration({ ...input, payload: { ...input.payload, expectedVersion: 999 } }), { status: 409 });
      assert.deepEqual(await state(collaboration.id), before);
      const [start] = await observer.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
      const result = await cancelCollaboration(input);
      const [end] = await observer.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
      assert.deepEqual(result, { id: collaboration.id, workspaceId, status: "CANCELLED", version: 2,
        cancelledAt: result.cancelledAt, cancellationReason: input.payload.reason.trim() });
      assert.ok(new Date(result.cancelledAt) >= start.now && new Date(result.cancelledAt) <= end.now);
      const after = await state(collaboration.id), audit = await events(collaboration.id);
      assert.equal(after.cancelledAt?.toISOString(), result.cancelledAt);
      assert.deepEqual(after.proposals, before.proposals); assert.deepEqual(after.closure, before.closure);
      assert.equal(audit.length, 1); assert.equal(audit[0].id, receiptId(input));
      assert.equal(audit[0].terraqoWorkspaceId, workspaceId);
      assert.equal(audit[0].createdAt.toISOString(), result.cancelledAt);
      const metadata = audit[0].metadata as Record<string, unknown>;
      assert.equal(metadata.schemaVersion, 1);
      assert.equal(metadata.operationFingerprint, hash({ collaborationId: collaboration.id, reason: input.payload.reason.trim(), expectedVersion: 1 }));
      assert.deepEqual(metadata.actor, { id: owner, name: "Original responsible", role: "CUSTOMER", workspaceRole: "OWNER" });
      assert.deepEqual(await cancelCollaboration({ ...input, operationKey: input.operationKey.toUpperCase(),
        payload: { ...input.payload, reason: input.payload.reason.trim() } }), result);
      for (const changed of [{ ...input.payload, reason: "Different reason" }, { ...input.payload, expectedVersion: 2 }])
        await assert.rejects(cancelCollaboration({ ...input, payload: changed }), { status: 409 });
      await assert.rejects(cancelCollaboration({ ...input, operationKey: randomUUID() }), { status: 409 });
      await assert.rejects(cancelCollaboration({ ...input, userId: manager }), { status: 409 });
      await assert.rejects(cancelCollaboration({ ...input, workspaceId: otherWorkspaceId }), { status: 404 });
      await assert.rejects(cancelCollaboration({ ...input, userId: professional }), { status: 403 });
      if (status === "PROPOSAL_PENDING") await assert.rejects(decideCollaborationProposal({ userId: professional,
        collaborationId: collaboration.id, operationKey: randomUUID(), payload: { action: "ACCEPT", expectedRevisionNo: 1 } }), { status: 409 });
      assert.deepEqual(await state(collaboration.id), after); assert.deepEqual(await events(collaboration.id), audit);
    }
    console.log("PASS cancellation: all mutable states; DB clock; reason/version/key validation; exact replay; conflicting payload/actor/tenant; PENDING acceptance blocked; history unchanged");

    const scoped = await seed(), sharedInput = inputFor(scoped);
    const result = await cancelCollaboration(sharedInput);
    const otherResource = await seed();
    await assert.rejects(cancelCollaboration({ ...sharedInput, collaborationId: otherResource.id }), { status: 409 });
    const anotherActor = { ...inputFor(otherResource), userId: manager, operationKey: sharedInput.operationKey };
    await cancelCollaboration(anotherActor);
    await cancelCollaboration({ ...inputFor(await seed("ACCEPTED", otherWorkspaceId)), operationKey: sharedInput.operationKey });
    await prisma.user.update({ where: { id: owner }, data: { name: "Renamed responsible" } });
    assert.deepEqual(await cancelCollaboration(sharedInput), result);
    for (const scope of [{ userId: owner, workspaceId }, { userId: professional }]) {
      const list = await listCollaborations(scope), item = list.find(row => row.id === scoped.id)!;
      assert.deepEqual(item.cancellationActor, { id: owner, name: "Original responsible" });
      assert.equal(item.cancellationReason, sharedInput.payload.reason.trim());
      assert.equal(item.cancelledAt?.toISOString(), result.cancelledAt);
    }
    assert.equal((await listCollaborations({ userId: outsider })).length, 0);
    const legacy = await seed();
    await prisma.terraqoCollaboration.update({ where: { id: legacy.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: "Legacy" } });
    assert.equal((await listCollaborations({ userId: professional })).find(row => row.id === legacy.id)?.cancellationActor, null);
    // Current permission controls both initial mutation and exact receipt replay.
    for (const change of [{ active: false }, { active: true, role: "VIEWER" as const }]) {
      await prisma.terraqoWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId: owner } }, data: change });
      await assert.rejects(cancelCollaboration(sharedInput), { status: 403 });
    }
    await prisma.terraqoWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId: owner } }, data: { active: true, role: "OWNER" } });
    for (const change of [{ active: false }, { active: true, deletedAt: new Date() }]) {
      await prisma.terraqoWorkspace.update({ where: { id: workspaceId }, data: change });
      await assert.rejects(cancelCollaboration(sharedInput), { status: 403 });
    }
    await prisma.terraqoWorkspace.update({ where: { id: workspaceId }, data: { active: true, deletedAt: null } });
    const adminInput = { ...inputFor(await seed()), userId: admin };
    await cancelCollaboration(adminInput);
    await prisma.user.update({ where: { id: admin }, data: { role: "CUSTOMER" } });
    await assert.rejects(cancelCollaboration(adminInput), { status: 403 });
    console.log("PASS cancellation: key scoped by workspace+actor; stable historical name; GET minimizes actor; legacy actor null; revoked membership/role/workspace/admin cannot replay");

    const preserved = await withDraft(), prior = await state(preserved.collaboration.id);
    await cancelCollaboration(preserved.cancel);
    const cancelled = await state(preserved.collaboration.id);
    assert.deepEqual(cancelled.closure, prior.closure); assert.deepEqual(cancelled.proposals, prior.proposals);
    await assert.rejects(submitClosure(preserved.submit), { status: 409 });
    await assert.rejects(saveClosureDraft({ ...preserved.draftInput, operationKey: randomUUID(),
      payload: { ...preserved.draftInput.payload, expectedVersion: 1 } }), { status: 409 });

    const cancelFirst = await withDraft();
    const cancellationRace = await contend([cancelFirst.collaboration.id], [
      () => cancelCollaboration(cancelFirst.cancel), () => submitClosure(cancelFirst.submit),
    ]);
    assert.equal(cancellationRace[0].status, "fulfilled"); conflict(cancellationRace[1]);
    assert.equal((await state(cancelFirst.collaboration.id)).status, "CANCELLED");
    await assert.rejects(submitClosure(cancelFirst.submit), { status: 409 });
    const submitFirst = await withDraft();
    const submissionRace = await contend([submitFirst.collaboration.id], [
      () => submitClosure(submitFirst.submit), () => cancelCollaboration(submitFirst.cancel),
    ]);
    assert.equal(submissionRace[0].status, "fulfilled"); conflict(submissionRace[1]);
    const reviewing = await state(submitFirst.collaboration.id);
    await assert.rejects(cancelCollaboration(inputFor(reviewing)), { status: 409 });
    assert.deepEqual(await events(submitFirst.collaboration.id), []);
    const decisionRace = await contend([submitFirst.collaboration.id], [
      () => decideClosure(submitFirst.decide), () => cancelCollaboration(inputFor(reviewing)),
    ]);
    assert.equal(decisionRace[0].status, "fulfilled"); conflict(decisionRace[1]);
    const closed = await state(submitFirst.collaboration.id);
    assert.equal(closed.status, "CLOSED"); assert.ok(closed.closure?.certificate);
    await assert.rejects(cancelCollaboration(inputFor(closed)), { status: 409 });
    // Independently exercise every guard, including inconsistent historical rows.
    await prisma.terraqoCollaboration.update({ where: { id: closed.id }, data: { status: "IN_PROGRESS" } });
    await assert.rejects(cancelCollaboration(inputFor(await state(closed.id))), { status: 409 });
    const submitted = await withDraft(); await submitClosure(submitted.submit);
    await prisma.terraqoCollaboration.update({ where: { id: submitted.collaboration.id }, data: { status: "IN_PROGRESS" } });
    await assert.rejects(cancelCollaboration(inputFor(await state(submitted.collaboration.id))), { status: 409 });
    await prisma.terraqoClosureRevision.update({ where: { id: submitted.draft.currentRevision!.id }, data: { status: "DRAFT" } });
    await prisma.terraqoCollaboration.update({ where: { id: submitted.collaboration.id }, data: { status: "CLOSURE_PROPOSED" } });
    await assert.rejects(cancelCollaboration(inputFor(await state(submitted.collaboration.id))), { status: 409 });
    const closedWithoutCertificate = await seed();
    await prisma.terraqoCollaboration.update({ where: { id: closedWithoutCertificate.id }, data: { status: "CLOSED" } });
    await assert.rejects(cancelCollaboration(inputFor(closedWithoutCertificate)), { status: 409 });
    console.log("PASS cancellation/closure: both parent-lock race orders; certification race; CLOSED/certificate/CLOSURE_PROPOSED/SUBMITTED guards; draft and proposal history retained");

    const duplicate = await seed(), duplicateInput = inputFor(duplicate);
    const duplicates = await contend([duplicate.id], [() => cancelCollaboration(duplicateInput), () => cancelCollaboration(duplicateInput)]);
    assert.equal(duplicates[0].status, "fulfilled"); assert.equal(duplicates[1].status, "fulfilled");
    assert.deepEqual(duplicates[0], duplicates[1]); assert.equal((await events(duplicate.id)).length, 1);
    assert.equal((await state(duplicate.id)).version, 2);
    const different = await seed(), differentInput = inputFor(different);
    const differentRace = await contend([different.id], [() => cancelCollaboration(differentInput),
      () => cancelCollaboration({ ...differentInput, payload: { ...differentInput.payload, reason: "Other payload" } })]);
    assert.equal(differentRace[0].status, "fulfilled"); conflict(differentRace[1]);
    const resourceA = await seed(), resourceB = await seed(), resourceInput = inputFor(resourceA);
    const resourceRace = await contend([resourceA.id, resourceB.id], [() => cancelCollaboration(resourceInput),
      () => cancelCollaboration({ ...resourceInput, collaborationId: resourceB.id })]);
    assert.equal(resourceRace.filter(item => item.status === "fulfilled").length, 1);
    for (const item of resourceRace.filter(item => item.status === "rejected")) conflict(item);
    assert.equal((await events(resourceA.id)).length + (await events(resourceB.id)).length, 1);
    assert.deepEqual([(await state(resourceA.id)).version, (await state(resourceB.id)).version].sort(), [1, 2]);
    const revoked = await seed(), revokedBefore = await state(revoked.id);
    const revocation = await contend([revoked.id], [() => cancelCollaboration(inputFor(revoked))], () =>
      observer.terraqoWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId: owner } }, data: { active: false } }));
    assert.equal(revocation[0].status, "rejected");
    if (revocation[0].status === "rejected") assert.equal(revocation[0].reason.status, 403);
    assert.deepEqual(await state(revoked.id), revokedBefore); assert.equal((await events(revoked.id)).length, 0);
    await prisma.terraqoWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId: owner } }, data: { active: true } });
    console.log("PASS cancellation concurrency: identical requests return identical receipt once; conflicting payload/resource cannot double-write; committed concurrent revocation aborts mutation");

    const rollback = await withDraft(), rollbackBefore = await state(rollback.collaboration.id);
    // Real PostgreSQL trigger failure AFTER the parent UPDATE, not a mocked tx.
    await observer.$executeRawUnsafe(`CREATE FUNCTION icc.s16_cancellation_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'S16 synthetic audit failure'; END $$`);
    await observer.$executeRawUnsafe(`CREATE TRIGGER s16_cancellation_reject_audit BEFORE INSERT ON icc."ActivityLog"
      FOR EACH ROW EXECUTE FUNCTION icc.s16_cancellation_reject_audit()`);
    try {
      await assert.rejects(cancelCollaboration(rollback.cancel), /S16 synthetic audit failure/);
      assert.deepEqual(await state(rollback.collaboration.id), rollbackBefore);
      assert.deepEqual(await events(rollback.collaboration.id), []);
    } finally {
      await observer.$executeRawUnsafe(`DROP TRIGGER s16_cancellation_reject_audit ON icc."ActivityLog"`);
      await observer.$executeRawUnsafe(`DROP FUNCTION icc.s16_cancellation_reject_audit()`);
    }
    await cancelCollaboration(rollback.cancel);
    assert.equal((await events(rollback.collaboration.id)).length, 1);
    console.log("PASS cancellation audit rollback: real trigger failure rolls back state/version/date/reason/history; same key succeeds after failure removal");
  } finally {
    try {
      await prisma.$transaction(async tx => {
        await tx.activityLog.deleteMany({ where: { terraqoWorkspaceId: { in: workspaces } } });
        await tx.terraqoCollaborationCertificate.deleteMany({ where: { closure: { collaboration: { workspaceId: { in: workspaces } } } } });
        await tx.terraqoConversationContext.deleteMany({ where: { conversation: { workspaceId: { in: workspaces } } } });
        await tx.terraqoCollaboration.deleteMany({ where: { workspaceId: { in: workspaces } } });
        await tx.terraqoConversation.deleteMany({ where: { workspaceId: { in: workspaces } } });
        await tx.terraqoWorkspace.deleteMany({ where: { id: { in: workspaces } } });
        await tx.user.deleteMany({ where: { id: { in: users } } });
      }, { timeout: 15_000 });
      const counts = await observer.$transaction([observer.user.count(), observer.terraqoWorkspace.count(), observer.terraqoWorkspaceMember.count(),
        observer.terraqoCollaboration.count(), observer.terraqoCollaborationProposal.count(), observer.terraqoCollaborationAcceptance.count(),
        observer.terraqoCollaborationClosure.count(), observer.terraqoClosureRevision.count(), observer.terraqoClosureReference.count(),
        observer.terraqoCollaborationCertificate.count(), observer.terraqoConversation.count(), observer.terraqoConversationContext.count(), observer.activityLog.count()]);
      assert.ok(counts.every(count => count === 0), `Fixture leak counts: ${counts.join(",")}`);
      console.log("PASS cancellation fixture cleanup: independent observer confirms zero rows in 13 tables");
    } finally { await Promise.all([prisma.$disconnect(), observer.$disconnect()]); }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
