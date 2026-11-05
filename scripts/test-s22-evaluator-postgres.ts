import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { listWorkspaceEvaluators as list, updateWorkspaceEvaluator as update,
  listAssignedEvaluations as assigned, WorkspaceEvaluatorError } from "../lib/terraqo/workspace-evaluators";
import { acceptWorkspaceInvitation as accept, createWorkspaceInvitation as invite,
  WorkspaceInvitationError } from "../lib/terraqo/workspace-invitations";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.username, "terraqo_s22_test");
  assert.equal(url.pathname, "/postgres");
  assert.equal(url.searchParams.get("schema"), "icc");
  assert.equal(process.env.TERRAQO_LOCAL_S22_TEST, "synthetic-only");
  const db = new PrismaClient({ datasourceUrl: url.href });
  const flag = process.env.TERRAQO_WORKSPACE_EVALUATORS_V1;
  const denied = (status: number) => (e: unknown) => e instanceof WorkspaceEvaluatorError && e.status === status;
  const inviteDenied = (status: number) => (e: unknown) => e instanceof WorkspaceInvitationError && e.status === status;
  const suffix = randomUUID();
  try {
    const owner = await db.user.create({ data: { email: `owner-${suffix}@s22.invalid`, emailVerified: new Date() } });
    const reader = await db.user.create({ data: { email: `reader-${suffix}@s22.invalid`, name: "Evaluator" } });
    const workspace = (name: string) => db.terraqoWorkspace.create({ data: { name, slug: `${name}-${suffix}`,
      members: { create: { userId: owner.id, role: "ADMIN" } } } });
    const a = await workspace("local"), b = await workspace("foreign");
    const invitation = { workspaceId: a.id, email: reader.email, role: "EVALUATOR", canReadEvaluations: true, operationKey: randomUUID() };
    process.env.TERRAQO_WORKSPACE_EVALUATORS_V1 = "false";
    await assert.rejects(invite(db, owner.id, invitation), inviteDenied(404));
    await assert.rejects(assigned(db, reader.id), denied(404));
    process.env.TERRAQO_WORKSPACE_EVALUATORS_V1 = "true";
    await assert.rejects(invite(db, owner.id, { ...invitation, role: "VIEWER" }), inviteDenied(422));
    const issuance = await invite(db, owner.id, invitation);
    assert.ok(issuance.token);
    const token = issuance.token;
    assert.equal((await invite(db, owner.id, invitation)).token, null);
    await assert.rejects(invite(db, owner.id, { ...invitation, canReadEvaluations: false }), inviteDenied(409));
    await assert.rejects(accept(db, owner.id, token), inviteDenied(404));
    await assert.rejects(accept(db, reader.id, token), inviteDenied(404));
    await db.user.update({ where: { id: reader.id }, data: { emailVerified: new Date() } });
    process.env.TERRAQO_WORKSPACE_EVALUATORS_V1 = "false";
    await assert.rejects(accept(db, reader.id, token), inviteDenied(404));
    process.env.TERRAQO_WORKSPACE_EVALUATORS_V1 = "true";
    const accepted = await Promise.all([accept(db, reader.id, token), accept(db, reader.id, token)]);
    assert.deepEqual(accepted.map(r => r.replayed).sort(), [false, true]);
    assert.equal(await db.terraqoWorkspaceMember.count({ where: { userId: reader.id } }), 0);
    await assert.rejects(list(db, reader.id, a.id), denied(403));
    await assert.rejects(db.$queryRaw`SELECT "role"::text::icc."TerraqoMemberRole" FROM icc."TerraqoWorkspaceInvitation" WHERE id=${issuance.id}`,
      (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.meta?.code === "22P02");
    const historical = await invite(db, owner.id, { ...invitation, role: "VIEWER", canReadEvaluations: false, operationKey: randomUUID() });
    for (const role of ["OWNER", "ADMIN", "MANAGER"] as const) {
      await db.terraqoWorkspaceInvitation.update({ where: { id: historical.id }, data: { role } });
      await assert.rejects(accept(db, reader.id, historical.token!), inviteDenied(404));
    }
    assert.equal(await db.terraqoWorkspaceMember.count({ where: { userId: reader.id } }), 0);
    await db.terraqoWorkspaceInvitation.update({ where: { id: historical.id }, data: { status: "CANCELLED" } });
    assert.deepEqual(await assigned(db, reader.id), []);

    const identity = () => ({ createdById: owner.id, operationKey: randomUUID(), operationFingerprint: "fixture" });
    const profile = await db.terraqoProfessionalProfile.create({ data: { userId: owner.id } });
    const dossier = async (workspaceId: string, title: string) => {
      const need = await db.terraqoWorkNeed.create({ data: { workspaceId, ...identity() } });
      const revision = await db.terraqoWorkNeedRevision.create({ data: { needId: need.id, title, revisionNo: 1,
        problem: "private problem", contentHash: "fixture", ...identity(),
        requirements: { create: { label: "Independent requirement", priority: "REQUIRED" } } } });
      return db.terraqoEvaluationDossier.create({ data: { workspaceId, needRevisionId: revision.id,
        professionalProfileId: profile.id, privateSummary: "private summary", ...identity() } });
    };
    const first = await dossier(a.id, "Assigned"), second = await dossier(a.id, "Unassigned"), foreign = await dossier(b.id, "Foreign");
    const catalog = await list(db, owner.id, a.id);
    assert.deepEqual(catalog.dossiers.map(d => d.id).sort(), [first.id, second.id].sort());
    const [person] = catalog.evaluators;
    assert.equal(catalog.evaluators.length, 1);
    assert.deepEqual(person, { id: person.id, userId: reader.id, name: "Evaluator", email: reader.email, active: true,
      canReadEvaluations: true, updatedAt: new Date(person.updatedAt).toISOString(), dossierIds: [] });
    const change = { workspaceId: a.id, evaluatorId: person.id, active: true, canReadEvaluations: true,
      expectedUpdatedAt: person.updatedAt, dossierIds: [first.id] };
    await assert.rejects(update(db, reader.id, change), denied(403));
    await assert.rejects(update(db, owner.id, { ...change, dossierIds: [first.id, first.id] }), denied(422));
    await assert.rejects(update(db, owner.id, { ...change, active: "true" }), denied(422));
    await assert.rejects(update(db, owner.id, { ...change, dossierIds: [foreign.id] }), denied(404));
    await assert.rejects(update(db, owner.id, { ...change, workspaceId: b.id }), denied(404));
    const fk = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003";
    await assert.rejects(db.terraqoWorkspaceEvaluatorAssignment.create({ data: { workspaceId: a.id, evaluatorId: person.id, dossierId: foreign.id } }), fk);
    await assert.rejects(db.terraqoWorkspaceEvaluatorAssignment.create({ data: { workspaceId: b.id, evaluatorId: person.id, dossierId: foreign.id } }), fk);
    const race = await Promise.allSettled([first, second].map(d => update(db, owner.id, { ...change, dossierIds: [d.id] })));
    assert.equal(race.filter(r => r.status === "fulfilled").length, 1);
    assert.ok(race.some(r => r.status === "rejected" && denied(409)(r.reason)));
    const refresh = async () => (await list(db, owner.id, a.id)).evaluators[0].updatedAt;
    const save = async (options: Partial<typeof change>) => update(db, owner.id, { ...change, expectedUpdatedAt: await refresh(), ...options });
    const saved = await save({});
    const countAudit = () => db.activityLog.count({ where: { terraqoWorkspaceId: a.id, actorId: owner.id, entityId: person.id, entityType: "WorkspaceEvaluator" } });
    const count = await countAudit();
    assert.ok(count >= 1);
    const audit = await db.activityLog.findFirstOrThrow({ where: { entityId: person.id, terraqoWorkspaceId: a.id }, orderBy: { createdAt: "desc" } });
    assert.deepEqual((audit.metadata as Prisma.JsonObject).after, { active: true, canReadEvaluations: true, dossierIds: [first.id] });
    assert.equal((await update(db, owner.id, change)).replayed, true);
    assert.equal(await countAudit(), count);
    await assert.rejects(update(db, owner.id, { ...change, expectedUpdatedAt: person.updatedAt, active: false }), denied(409));
    assert.equal(saved.updatedAt, await refresh());
    assert.deepEqual(await assigned(db, owner.id), []);

    const entry = await db.terraqoWorklogEntry.create({ data: { authorId: owner.id, professionalProfileId: profile.id, title: "Evidence", summary: "private" } });
    const revision = await db.terraqoWorklogRevision.create({ data: { worklogId: entry.id, revisionNo: 1, createdById: owner.id,
      title: "Permitted title", summary: "private evidence", contentHash: "fixture" } });
    await db.terraqoWorklogEntry.update({ where: { id: entry.id }, data: { currentRevisionId: revision.id } });
    const collection = await db.terraqoShareCollection.create({ data: { professionalProfileId: profile.id, title: "Collection", lifecycle: "ACTIVE", ...identity() } });
    const item = await db.terraqoShareCollectionItem.create({ data: { collectionId: collection.id, revisionId: revision.id, allowedFields: ["title", "summary"] } });
    const grant = await db.terraqoAccessGrant.create({ data: { collectionId: collection.id, subjectUserId: owner.id,
      issuedById: owner.id, scopes: ["VIEW_COLLECTION"], expiresAt: new Date(Date.now() + 3600000), operationKey: randomUUID(), operationFingerprint: "fixture" } });
    const source = await db.terraqoEvaluationSource.create({ data: { dossierId: first.id, worklogRevisionId: revision.id,
      addedById: owner.id, accessKind: "PRIVATE_GRANT", accessReferenceId: grant.id, accessSnapshot: { allowedFields: ["title"] } } });
    await db.terraqoEvaluationAssessment.create({ data: { dossierId: first.id, criterionKey: "private", criterionLabel: "withdrawn quotation",
      rationale: "sensitive rationale", claimState: "UNKNOWN", revisionNo: 1, ...identity(), sourceLinks: { create: { sourceId: source.id } } } });
    await db.terraqoEvaluationNote.create({ data: { dossierId: first.id, body: "private note", ...identity() } });
    const read = async (sources: { id: string; title?: string; summary?: string }[]) => assert.deepEqual(await assigned(db, reader.id),
      [{ id: first.id, title: "Assigned", workspaceName: a.name, criteria: ["Independent requirement"], sources }]);
    await read([]); // The issuer's grant is never borrowed by the evaluator.
    await db.terraqoAccessGrant.update({ where: { id: grant.id }, data: { subjectUserId: reader.id } });
    await read([{ id: source.id, title: revision.title }]);
    await db.terraqoShareCollectionItem.update({ where: { id: item.id }, data: { allowedFields: ["summary"] } });
    await read([{ id: source.id }]);
    await db.terraqoEvaluationSource.update({ where: { id: source.id }, data: { accessSnapshot: { allowedFields: ["summary"] } } });
    await db.terraqoShareCollectionItem.update({ where: { id: item.id }, data: { allowedFields: ["summary", "title"] } });
    await read([{ id: source.id, summary: revision.summary }]); // Live title permission cannot widen the frozen summary-only scope.
    await db.terraqoShareCollection.update({ where: { id: collection.id }, data: { lifecycle: "ARCHIVED" } });
    await read([]);
    await db.terraqoShareCollection.update({ where: { id: collection.id }, data: { lifecycle: "ACTIVE" } });
    await db.terraqoAccessGrant.update({ where: { id: grant.id }, data: { lifecycle: "REVOKED", revokedAt: new Date() } });
    await read([]);

    const empty = async () => assert.deepEqual(await assigned(db, reader.id), []);
    await save({ canReadEvaluations: false }); await empty();
    await accept(db, reader.id, token);
    await empty();
    await save({ active: false }); await empty();
    const reissue = await invite(db, owner.id, { ...invitation, operationKey: randomUUID() });
    await assert.rejects(accept(db, reader.id, reissue.token!), inviteDenied(409));
    await save({ dossierIds: [] }); await empty();
    await save({});
    await db.terraqoWorkspaceMember.create({ data: { workspaceId: a.id, userId: reader.id, role: "VIEWER", active: false } });
    await empty();
    await assert.rejects(accept(db, reader.id, reissue.token!), inviteDenied(409));
    const seat = { workspaceId_userId: { workspaceId: a.id, userId: reader.id } };
    await db.terraqoWorkspaceMember.update({ where: seat, data: { active: true } });
    await accept(db, reader.id, reissue.token!);
    assert.equal((await db.terraqoWorkspaceMember.findUniqueOrThrow({ where: seat })).role, "VIEWER");
    await read([]);
    await db.terraqoWorkspace.update({ where: { id: a.id }, data: { active: false } }); await empty();
    await db.terraqoWorkspace.update({ where: { id: a.id }, data: { active: true } });
    await db.terraqoEvaluationDossier.update({ where: { id: first.id }, data: { lifecycle: "ARCHIVED" } }); await empty();
    await assert.rejects(save({}), denied(404));
    const version = await refresh();
    // Force the admin change to commit while a service mutation waits on the workspace lock.
    let waiting: Promise<void> | undefined;
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM icc."TerraqoWorkspace" WHERE id=${a.id} FOR UPDATE`;
      waiting = assert.rejects(update(db, owner.id, { ...change, dossierIds: [], expectedUpdatedAt: version }), denied(403));
      let blocked = false;
      for (let i = 0; i < 150 && !blocked; i++) {
        const [state] = await tx.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS (SELECT FROM pg_locks WHERE NOT granted AND pg_backend_pid() = ANY(pg_blocking_pids(pid))) AS waiting`;
        blocked = state.waiting;
        if (!blocked) await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.ok(blocked, "The evaluator mutation must wait on the membership lock");
      await tx.terraqoWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId: a.id, userId: owner.id } }, data: { role: "MEMBER" } });
    }, { timeout: 10_000 });
    await waiting;
    await assert.rejects(list(db, owner.id, a.id), denied(403));
    await assert.rejects(update(db, owner.id, { ...change, expectedUpdatedAt: version }), denied(403));
    await assert.rejects(accept(db, reader.id, token), inviteDenied(403));
    console.log("PASS S22 evaluator PostgreSQL: verified invite and replay, separate identity, rollback cast, composite tenant FKs, stale concurrent edits, audit, exact dossier scope, source revocation and field intersection, suspension and archive.");
  } finally {
    if (flag === undefined) delete process.env.TERRAQO_WORKSPACE_EVALUATORS_V1;
    else process.env.TERRAQO_WORKSPACE_EVALUATORS_V1 = flag;
    await db.$disconnect();
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
