import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { confirmedLocalDisposableDatabaseUrl } from "./lib/confirmed-local-disposable-database";

let phase = "identity";
let checks = 0;
const pass = (label: string) => { checks++; console.log(`PASS ${label}`); };

async function main() {
  const connection = confirmedLocalDisposableDatabaseUrl({ value: process.env.DATABASE_URL,
    expected: process.env.S17_BOUND_TEST_DATABASE, valueVariable: "DATABASE_URL", expectedVariable: "S17_BOUND_TEST_DATABASE" });
  const url = new URL(connection);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.username, "s17_bound_service_test");
  assert.equal(process.env.S17_BOUND_TEST_DATABASE, "s17_bound_service_test");
  assert.equal(process.env.S17_BOUND_TEST_SYNTHETIC, "confirmed");
  assert.equal(process.env.DIRECT_URL, connection);
  assert.ok(process.env.S17_BOUND_TEST_DATA_DIRECTORY);
  const { PrismaClient, Prisma } = await import("@prisma/client");
  const observer = new PrismaClient({ datasourceUrl: connection, log: [] });
  let runtime: typeof import("../lib/prisma")["prisma"] | undefined;
  const owner = randomUUID(), professional = randomUUID(), outsider = randomUUID(), workspaceId = randomUUID();
  const identity = async () => {
    assert.deepEqual(await observer.$queryRaw`SELECT current_database() AS db, current_user AS role,
      host(inet_server_addr()) AS host, inet_server_port() AS port,
      current_setting('data_directory') AS data, current_setting('listen_addresses') AS listeners`, [{
      db: "s17_bound_service_test", role: "s17_bound_service_test", host: "127.0.0.1", port: Number(url.port),
      data: process.env.S17_BOUND_TEST_DATA_DIRECTORY, listeners: "127.0.0.1",
    }]);
  };
  const guards = async () => {
    const rows = await observer.$queryRaw<{ name: string; enabled: string }[]>`SELECT tgname AS name, tgenabled::text AS enabled
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='icc' AND tgname LIKE 's17_%' AND NOT tgisinternal ORDER BY tgname`;
    assert.deepEqual(rows, ["s17_acceptance_guard", "s17_certificate_guard", "s17_closure_parent_guard",
      "s17_closure_revision_guard", "s17_collaboration_parties_guard", "s17_proposal_payload_guard"]
      .map(name => ({ name, enabled: "O" })));
  };
  try {
    await identity();
    await guards();
    const tables = await observer.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='icc' ORDER BY tablename`;
    assert.ok(tables.length > 0);
    const ident = (name: string) => { assert.match(name, /^[A-Za-z_][A-Za-z0-9_]*$/); return `"${name}"`; };
    // One SQL statement gives a consistent independent snapshot of EVERY table,
    // including context/idempotency rows, not just the expected closure fields.
    const snapshot = () => observer.$queryRawUnsafe<{ name: string; rows: unknown[] }[]>(tables.map(({ tablename }) =>
      `SELECT '${tablename}' AS name, COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb) AS rows FROM icc.${ident(tablename)} t`
    ).join(" UNION ALL "));
    const zeros = async () => {
      assert.deepEqual((await snapshot()).filter(row => row.rows.length), []);
      await guards();
    };
    await zeros();
    pass(`identity verified; ${tables.length} empty tables; all six SQL guards enabled`);
    const { prisma } = await import("../lib/prisma");
    runtime = prisma;
    const { saveClosureDraft, submitClosure, decideClosure } = await import("../lib/terraqo/closure");
    const { reviseCollaboration, decideCollaborationProposal } = await import("../lib/terraqo/collaboration");
    const { terraqoClosureDraftSchema } = await import("../lib/validations/terraqo");
    const unchanged = async (label: string, action: () => Promise<unknown>, status?: number) => {
      phase = label;
      const before = await snapshot();
      if (status !== undefined) await assert.rejects(action, { status });
      else await action();
      assert.deepEqual(await snapshot(), before, `${label}: mutation across independent full-database snapshot`);
      await guards();
      pass(`${label}: ${status ?? "replay"}, no mutations`);
    };
    const state = (id: string) => observer.terraqoCollaboration.findUniqueOrThrow({ where: { id }, include: {
      proposals: { orderBy: { revisionNo: "asc" }, include: { acceptances: { orderBy: { party: "asc" } } } },
      closure: { include: { revisions: { orderBy: { revisionNo: "asc" } }, certificate: true } },
    } });
    const seed = async (omit?: "WORKSPACE" | "PROFESSIONAL") => prisma.$transaction(async tx => {
      const past = new Date("2026-01-01T00:00:00.000Z");
      const conversation = await tx.terraqoConversation.create({ data: { workspaceId, createdById: owner } });
      const collaboration = await tx.terraqoCollaboration.create({ data: {
        workspaceId, conversationId: conversation.id, professionalUserId: professional,
        status: "ACCEPTED", acceptedRevisionNo: 1, acceptedAt: past,
      } });
      const proposal = await tx.terraqoCollaborationProposal.create({ data: {
        collaborationId: collaboration.id, revisionNo: 1, scope: "SCOPE_A synthetic accepted scope", roleTitle: "Role A",
        deliverables: ["Scope A plan"], status: "ACCEPTED", createdById: owner, decidedById: professional,
        decidedAt: past, operationKey: randomUUID(), operationFingerprint: "synthetic-fixture",
        acceptances: { create: (["WORKSPACE", "PROFESSIONAL"] as const).filter(party => party !== omit)
          .map(party => ({ party, actorId: party === "WORKSPACE" ? owner : professional, acceptedAt: past })) },
      } });
      const save = { userId: owner, workspaceId, collaborationId: collaboration.id, operationKey: randomUUID(),
        payload: terraqoClosureDraftSchema.parse({ contribution: "Contribution reviewed under scope A", deliverables: ["Closure plan"],
          result: "Synthetic result", authorizedExcerpt: "Private synthetic excerpt", referenceRevisionIds: [],
          expectedVersion: null, expectedAcceptedProposalId: proposal.id }) };
      return { collaboration, proposal, save };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    try {
      phase = "seed synthetic identities";
      await prisma.$transaction(async tx => {
        await tx.user.createMany({ data: [owner, professional, outsider].map(id => ({ id, name: `Synthetic ${id}`, email: `${id}@s17-bound.invalid` })) });
        await tx.terraqoWorkspace.create({ data: { id: workspaceId, name: "S17 bound synthetic", slug: workspaceId, ownerUserId: owner } });
        await tx.terraqoWorkspaceMember.create({ data: { workspaceId, userId: owner, role: "OWNER" } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      for (const party of ["WORKSPACE", "PROFESSIONAL"] as const) {
        const missing = await seed(party);
        await unchanged(`missing ${party} acceptance denies save`, () => saveClosureDraft(missing.save), 409);
      }
      const f = await seed();
      await unchanged("outsider cannot save A", () => saveClosureDraft({ ...f.save, userId: outsider }), 404);
      phase = "runtime save bound A";
      const a = await saveClosureDraft(f.save);
      assert.equal(a.currentRevision?.acceptedScope?.id, f.proposal.id);
      const aState = await state(f.collaboration.id);
      assert.equal(aState.closure?.revisions[0].acceptedProposalId, f.proposal.id);
      assert.equal(aState.closure?.version, 1);
      assert.equal(aState.version, f.collaboration.version + 1);
      pass("runtime save A persists exact proposal identity under active SQL guards");
      await unchanged("same-key save A replay", async () => assert.deepEqual(await saveClosureDraft(f.save), a));
      await unchanged("same-key changed payload", () => saveClosureDraft({ ...f.save,
        payload: { ...f.save.payload, result: "Conflicting replay" } }), 409);
      await unchanged("outsider cannot replay saved A", () => saveClosureDraft({ ...f.save, userId: outsider }), 404);

      phase = "runtime revise and accept scope B";
      const scopeB = { scope: "SCOPE_B explicit newly accepted scope", roleTitle: "Role B", deliverables: ["Scope B plan"] };
      await reviseCollaboration({ userId: owner, workspaceId, collaborationId: f.collaboration.id, operationKey: randomUUID(),
        payload: { ...scopeB, expectedVersion: aState.version } });
      const acceptB = { userId: professional, collaborationId: f.collaboration.id, operationKey: randomUUID(),
        payload: { action: "ACCEPT" as const, expectedRevisionNo: 2 } };
      await decideCollaborationProposal(acceptB);
      const acceptedB = await state(f.collaboration.id);
      const proposalB = acceptedB.proposals[1];
      assert.equal(acceptedB.acceptedRevisionNo, 2);
      assert.equal(proposalB.status, "ACCEPTED");
      assert.equal(proposalB.acceptances.length, 2);
      assert.deepEqual(acceptedB.proposals[0], aState.proposals[0], "Accept B must preserve historical A evidence");
      pass("real proposal services revise/accept B with A still bound");
      const submitA = { userId: owner, workspaceId, collaborationId: f.collaboration.id, operationKey: randomUUID(),
        payload: { expectedRevisionNo: 1 } };
      await unchanged("stale save A after B", () => saveClosureDraft({ ...f.save, operationKey: randomUUID(),
        payload: { ...f.save.payload, expectedVersion: 1 } }), 409);
      await unchanged("stale submit A after B", () => submitClosure(submitA), 409);
      await unchanged("old committed A replay after B acceptance", async () => {
        assert.equal((await saveClosureDraft(f.save)).currentRevision?.acceptedScope?.id, f.proposal.id);
      });

      phase = "runtime new closure revision explicitly bound B";
      const saveB = { ...f.save, operationKey: randomUUID(), payload: { ...f.save.payload,
        contribution: "Contribution explicitly reviewed under B", expectedVersion: 1, expectedAcceptedProposalId: proposalB.id } };
      const b = await saveClosureDraft(saveB);
      assert.equal(b.currentRevision?.acceptedScope?.id, proposalB.id);
      assert.equal(b.revisions.find(r => r.revisionNo === 1)?.acceptedScope?.id, f.proposal.id);
      const bState = await state(f.collaboration.id);
      assert.deepEqual(bState.closure?.revisions[0], { ...aState.closure!.revisions[0], status: "SUPERSEDED" });
      assert.equal(bState.closure?.revisions[1].acceptedProposalId, proposalB.id);
      assert.equal(bState.closure?.version, 2);
      assert.equal(bState.closure?.revisions.length, 2);
      pass("explicit B revision retains immutable A payload and proposal history");
      await unchanged("old A replay returns current B without rebinding A", async () => assert.deepEqual(await saveClosureDraft(f.save), b));
      const submitB = { ...submitA, operationKey: randomUUID(), payload: { expectedRevisionNo: 2 } };
      await unchanged("outsider cannot submit B", () => submitClosure({ ...submitB, userId: outsider }), 404);
      phase = "runtime submit B";
      const sent = await submitClosure(submitB);
      assert.equal(sent.currentRevision?.status, "SUBMITTED");
      assert.equal(sent.currentRevision?.acceptedScope?.id, proposalB.id);
      await unchanged("submit B exact replay", async () => assert.deepEqual(await submitClosure(submitB), sent));
      await unchanged("submit B duplicate different key", () => submitClosure({ ...submitB, operationKey: randomUUID() }), 409);
      await unchanged("submit B changed replay", () => submitClosure({ ...submitB, payload: { expectedRevisionNo: 1 } }), 409);
      const decideB = { userId: professional, closureId: b.id, operationKey: randomUUID(),
        payload: { action: "ACCEPT" as const, expectedRevisionNo: 2 } };
      await unchanged("outsider cannot accept B", () => decideClosure({ ...decideB, userId: outsider }), 404);
      phase = "runtime concurrent identical ACCEPT B";
      // Both real service transactions must queue on the same parent lock before
      // release. Settle both writers even if the observation fails, before cleanup.
      let release!: () => void, acquired!: () => void;
      const held = new Promise<void>(resolve => { acquired = resolve; });
      const unblock = new Promise<void>(resolve => { release = resolve; });
      const gate = observer.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM icc."TerraqoCollaboration" WHERE id=${f.collaboration.id} FOR UPDATE`;
        acquired();
        await unblock;
      }, { timeout: 15_000 });
      const writers: Promise<PromiseSettledResult<Awaited<ReturnType<typeof decideClosure>>>>[] = [];
      let observationError: unknown;
      try {
        await Promise.race([held, gate.then(() => { throw new Error("Gate ended before lock acquisition"); })]);
        for (let i = 0; i < 2; i++) writers.push(decideClosure(decideB).then(
          value => ({ status: "fulfilled" as const, value }), reason => ({ status: "rejected" as const, reason })));
        const deadline = Date.now() + 4_000;
        for (;;) {
          const [waiting] = await prisma.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_stat_activity
            WHERE datname=current_database() AND wait_event_type='Lock'
            AND query LIKE '%TerraqoCollaboration%' AND query LIKE '%FOR UPDATE%'`;
          if (waiting.count >= 2) break;
          assert.ok(Date.now() < deadline, "Both actual ACCEPT services must wait on parent locks");
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      } catch (error) { observationError = error; }
      finally {
        release();
        try { await gate; } catch (error) { observationError ??= error; }
      }
      const decisions = await Promise.all(writers);
      if (observationError) throw observationError;
      const values = decisions.map(outcome => {
        if (outcome.status === "rejected") throw outcome.reason;
        return outcome.value;
      });
      assert.equal(values.length, 2);
      assert.deepEqual(values[0], values[1]);
      const certified = values[0];
      const closed = await state(f.collaboration.id);
      const cert = closed.closure!.certificate!;
      assert.ok(cert);
      const revisionB = closed.closure!.revisions[1];
      assert.equal(closed.status, "CLOSED");
      assert.equal(revisionB.status, "ACCEPTED");
      assert.equal(closed.version, bState.version + 2, "Exactly one submit and one acceptance increment");
      assert.equal(revisionB.acceptedProposalId, proposalB.id);
      assert.equal(cert.closureId, b.id);
      assert.equal(cert.closureRevisionId, revisionB.id);
      assert.equal(cert.proposalRevisionNo, proposalB.revisionNo);
      assert.equal(cert.scope, proposalB.scope);
      assert.equal(cert.roleTitle, proposalB.roleTitle);
      assert.equal(cert.closureRevisionNo, revisionB.revisionNo);
      assert.equal(cert.contribution, revisionB.contribution);
      assert.deepEqual(cert.deliverables, revisionB.deliverables);
      assert.equal(cert.result, revisionB.result);
      assert.equal(cert.authorizedExcerpt, revisionB.authorizedExcerpt);
      assert.equal(cert.issuedById, professional);
      assert.equal(cert.privateByDefault, true);
      assert.equal(await observer.terraqoCollaborationCertificate.count({ where: { closureId: b.id } }), 1);
      assert.equal(await observer.terraqoConversationContext.count({ where: { conversationId: f.collaboration.conversationId, kind: "CLOSURE" } }), 1);
      pass("two lock-observed runtime ACCEPT calls produce one exact-B private certificate and context");
      await unchanged("decision exact replay", async () => assert.deepEqual(await decideClosure(decideB), certified));
      await unchanged("decision duplicate different key", () => decideClosure({ ...decideB, operationKey: randomUUID() }), 409);
      await unchanged("decision changed same-key payload", () => decideClosure({ ...decideB,
        payload: { ...decideB.payload, action: "DECLINE", comment: "Changed decision" } }), 409);
      await unchanged("scope B acceptance replay after closure", () => decideCollaborationProposal(acceptB));

      phase = "legacy NULL private runtime path";
      const legacy = await seed();
      const { expectedAcceptedProposalId: omittedBinding, ...legacyPayload } = legacy.save.payload;
      assert.equal(omittedBinding, legacy.proposal.id);
      assert.equal(Object.hasOwn(legacyPayload, "expectedAcceptedProposalId"), false);
      const legacySave = { ...legacy.save, payload: legacyPayload };
      const legacyDraft = await saveClosureDraft(legacySave);
      assert.equal(legacyDraft.currentRevision?.acceptedScope, null);
      await submitClosure({ ...submitA, collaborationId: legacy.collaboration.id, operationKey: randomUUID() });
      const legacyDecision = { ...decideB, closureId: legacyDraft.id, operationKey: randomUUID(),
        payload: { action: "ACCEPT" as const, expectedRevisionNo: 1 } };
      const legacyCertified = await decideClosure(legacyDecision);
      assert.equal(legacyCertified.currentRevision?.acceptedScope, null);
      assert.equal(legacyCertified.certificate?.privateByDefault, true);
      assert.equal((await state(legacy.collaboration.id)).closure?.revisions[0].acceptedProposalId, null);
      await unchanged("legacy original save replay remains unbound", async () => {
        assert.equal((await saveClosureDraft(legacySave)).currentRevision?.acceptedScope, null);
      });
      await unchanged("legacy decision replay remains private", async () => assert.deepEqual(await decideClosure(legacyDecision), legacyCertified));
      pass("legacy NULL save/submit/ACCEPT remains private and unbound with all guards active");
    } finally {
      const failedPhase = phase;
      phase = "ordered SERIALIZABLE fixture cleanup";
      await guards();
      await prisma.$transaction(async tx => {
        const [isolation] = await tx.$queryRaw<{ isolation: string }[]>`SELECT current_setting('transaction_isolation') AS isolation`;
        assert.equal(isolation.isolation, "serializable");
        const closure = { collaboration: { workspaceId } };
        await tx.terraqoCollaborationCertificate.deleteMany({ where: { closure } });
        await tx.terraqoCollaborationClosure.updateMany({ where: closure, data: { currentRevisionId: null } });
        await tx.terraqoClosureReference.deleteMany({ where: { closureRevision: { closure } } });
        await tx.terraqoClosureRevision.deleteMany({ where: { closure } });
        await tx.terraqoCollaborationClosure.deleteMany({ where: closure });
        await tx.terraqoCollaborationAcceptance.deleteMany({ where: { proposal: { collaboration: { workspaceId } } } });
        await tx.terraqoCollaborationProposal.deleteMany({ where: { collaboration: { workspaceId } } });
        await tx.terraqoConversationContext.deleteMany({ where: { conversation: { workspaceId } } });
        await tx.terraqoCollaboration.deleteMany({ where: { workspaceId } });
        await tx.terraqoConversation.deleteMany({ where: { workspaceId } });
        await tx.terraqoWorkspaceMember.deleteMany({ where: { workspaceId } });
        await tx.terraqoWorkspace.deleteMany({ where: { id: workspaceId } });
        await tx.user.deleteMany({ where: { id: { in: [owner, professional, outsider] } } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
      await zeros();
      pass(`ordered SERIALIZABLE cleanup committed; independent ${tables.length}-table zeros; guards still enabled`);
      phase = failedPhase;
    }
  } finally {
    await Promise.all([runtime?.$disconnect(), observer.$disconnect()]);
  }
  console.log(`RESULT ${checks} runtime integration checks passed`);
}

main().catch(error => {
  // Preserve the SQLSTATE and trigger message for the owner; never dump URL/env.
  const diagnostic = error as { code?: string; status?: number; message?: string; meta?: unknown };
  const secret = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).password : "";
  const output = JSON.stringify({ phase, code: diagnostic.code, status: diagnostic.status,
    message: diagnostic.message, meta: diagnostic.meta });
  console.error("FAIL S17 bound service runtime", secret ? output.replaceAll(secret, "[redacted]") : output);
  process.exitCode = 1;
});
