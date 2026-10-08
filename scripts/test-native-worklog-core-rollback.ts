import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";
import { parseNativeWorklogPayload } from "../lib/server/native-worklog-payload";
import { NativeWorklogBudget } from "../lib/server/native-worklog-budget";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";
import { createNativeWorklogInTransaction, readNativeWorklogInTransaction } from "../lib/server/native-worklog-operation";
import { assertLegacyWorklogs, assertLegacyFirstWorklog, assertLegacyReputationOwner, assertLegacyValidation, assertLegacyBuilderSource,
  NativeWorklogLegacyGuardError } from "../lib/server/native-worklog-legacy-guard";

import { applyNativeFirstWorklogInTransaction, reserveNativeFirstWorklog } from "../lib/server/native-worklog-first-award";
import { nativeWorklogContentKey } from "../lib/server/native-worklog-content-key";
import { applyNativeWorklogBaseInTransaction } from "../lib/server/native-worklog-base-accounting";

/** Invoked only within the pinned DDL checker's outer rollback, never standalone. */
export async function nativeWorklogCoreRollback(tx: Prisma.TransactionClient, workspaceId: string) {
  const marker = randomUUID();
  const user = await tx.user.create({ data: { name: `ICC native-core rollback ${marker}`,
    email: `native-core-${marker}@example.invalid`, role: "CUSTOMER" } });
  const profile = await tx.terraqoProfessionalProfile.create({ data: { userId: user.id, visibility: "PRIVATE", liveCvEnabled: false } });
  const member = await tx.terraqoWorkspaceMember.create({ data: { userId: user.id, workspaceId, role: "PROFESSIONAL", active: true } });
  const token: WorkspacePortalToken = { sub: user.id, workspaceId, workspaceSlug: "icc-topografia", role: "PROFESSIONAL",
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, jti: randomUUID() };
  const identifier = `portal-session:${workspaceId}:${user.id}`, grantHash = createHash("sha256").update(token.jti!).digest("hex");
  await tx.verificationToken.create({ data: { identifier, token: grantHash, expires: new Date(Date.now() + 3600000) } });
  const payload = { operationKey: "a".repeat(32), title: "ICC bitácora privada propia",
    summary: "Resumen temporal exclusivo de verificación del core SQL.", outcome: "Resultado propio", type: "FIELD_UPDATE",
    projectId: "", projectVersion: "" };
  const parsed = (changes = {}) => parseNativeWorklogPayload(new Request("https://api.terraqoglobal.com/own-test", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, ...changes }),
  }));
  const initial = await parsed();
  const budget = () => new NativeWorklogBudget();
  const counts = async () => ({ entry: await tx.terraqoWorklogEntry.count({ where: { authorId: user.id } }),
    receipt: await tx.terraqoNativeWorklogOperation.count({ where: { actorId: user.id } }),
    accounting: await tx.terraqoNativeWorklogAccounting.count({ where: { operation: { actorId: user.id } } }),
    decision: await tx.terraqoNativeWorklogDecision.count({ where: { operation: { actorId: user.id } } }),
    audit: await tx.activityLog.count({ where: { actorId: user.id } }) });
  async function rejected(run: () => Promise<unknown>, expected?: number) {
    const before = await counts();
    await tx.$executeRawUnsafe("SAVEPOINT native_core_own_case");
    let caught: unknown;
    try { await run(); } catch (error) { caught = error; }
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT native_core_own_case");
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT native_core_own_case");
    assert.ok(caught);
    if (expected) { assert.ok(caught instanceof NativeWorklogOperationError); assert.equal(caught.status, expected); }
    assert.deepEqual(await counts(), before);
  }
  assert.deepEqual(await readNativeWorklogInTransaction(tx, token, payload.operationKey, budget()), { receipt: null, current: null });
  assert.deepEqual(await counts(), { entry: 0, receipt: 0, accounting: 0, decision: 0, audit: 0 });
  await rejected(() => createNativeWorklogInTransaction(tx, { ...token, jti: undefined }, initial, budget()), 401);
  await rejected(() => createNativeWorklogInTransaction(tx, { ...token, exp: Number.NaN }, initial, budget()), 401);
  await rejected(async () => {
    await tx.terraqoWorkspaceMember.update({ where: { id: member.id }, data: { role: "CLIENT" } });
    return createNativeWorklogInTransaction(tx, token, initial, budget());
  }, 403);
  await rejected(async () => {
    await tx.verificationToken.delete({ where: { identifier_token: { identifier, token: grantHash } } });
    return createNativeWorklogInTransaction(tx, token, initial, budget());
  }, 401);
  await rejected(async () => {
    await tx.verificationToken.delete({ where: { identifier_token: { identifier, token: grantHash } } });
    return readNativeWorklogInTransaction(tx, token, payload.operationKey, budget());
  }, 401);
  // A structurally identical object cannot forge the parser's internal snapshot provenance.
  await rejected(() => createNativeWorklogInTransaction(tx, token, Object.freeze({ ...initial }), budget()), 503);
  // Fault before the very first receipt must also roll back the reserved bonus decision.
  await rejected(() => createNativeWorklogInTransaction(new Proxy(tx, { get(target, property) {
    if (property === "activityLog") return { create: async () => { throw new Error("CONTROLLED_FIRST_RESERVATION_FAULT"); } };
    return Reflect.get(target, property);
  } }), token, initial, budget()));
  assert.equal(await tx.terraqoBuilderContribution.count({ where: { userId: user.id } }), 0);
  const created = await createNativeWorklogInTransaction(tx, token, initial, budget());
  assert.ok(created.receipt && created.current);
  assert.ok((await tx.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: profile.id } })).updatedAt > profile.updatedAt);
  assert.equal(created.receipt.worklogId, created.current.worklogId);
  assert.deepEqual(await counts(), { entry: 1, receipt: 1, accounting: 1, decision: 1, audit: 1 });
  const operation = await tx.terraqoNativeWorklogOperation.findFirstOrThrow({ where: { actorId: user.id } });
  const savedDecision = await tx.terraqoNativeWorklogDecision.findUniqueOrThrow({ where: { operationId: operation.id } });
  assert.equal(savedDecision.tqPoints, 1); assert.equal(savedDecision.trustScore, 1);
  assert.equal(savedDecision.rewardedInDay, 0); assert.equal(savedDecision.trustedInWindow, 0);
  const accounting = await tx.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId: operation.id } });
  assert.equal(accounting.state, "PENDING"); assert.equal(accounting.completedAt, null); assert.equal(accounting.attempts, 0);
  const first = await tx.terraqoBuilderContribution.findUniqueOrThrow({ where: { sourceKey: `first-worklog:${user.id}` } });
  assert.equal(first.approvedPoints, 0); assert.equal(first.requestedPoints, 25);
  assert.equal(await tx.terraqoBuilderAccount.count({ where: { userId: user.id } }), 0);
  await tx.$executeRawUnsafe("SAVEPOINT native_base_own_phase");
  await rejected(() => applyNativeWorklogBaseInTransaction(new Proxy(tx, { get(target, key) {
    if (key === "terraqoBuilderContribution") return new Proxy(target.terraqoBuilderContribution, { get(delegate, field) {
      if (field === "create") return async () => {
        const a = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { userId: user.id } });
        assert.equal(a.pendingPoints, 1); assert.equal(a.trustScore, 1);
        throw new Error("CONTROLLED_BASE_CONTRIBUTION_FAULT");
      };
      return Reflect.get(delegate, field);
    } });
    return Reflect.get(target, key);
  } }), operation.id));
  assert.equal(await tx.terraqoBuilderAccount.count({ where: { userId: user.id } }), 0);
  assert.equal(await applyNativeWorklogBaseInTransaction(tx, operation.id), "allocated");
  assert.equal(await applyNativeWorklogBaseInTransaction(tx, operation.id), "historical");
  const baseAccount = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { userId: user.id } });
  assert.equal(baseAccount.pendingPoints, 1); assert.equal(baseAccount.trustScore, 1);
  assert.equal(baseAccount.availablePoints, 0); assert.equal(baseAccount.lifetimeEarned, 0);
  assert.equal(baseAccount.contributionScore, 0);
  assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: baseAccount.id } }), 0);
  await tx.terraqoBuilderContribution.create({ data: { userId: user.id, type: "BUG_REPORT", title: "Own retained future",
    detail: "Own temporary accounting floor", approvedPoints: 2, availableAt: new Date(Date.now() + 86400000) } });
  await tx.terraqoBuilderAccount.update({ where: { id: baseAccount.id }, data: { pendingPoints: 3, trustScore: 4 } });
  assert.equal(await applyNativeWorklogBaseInTransaction(tx, operation.id), "historical");
  const retainedAccount = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: baseAccount.id } });
  assert.equal(retainedAccount.pendingPoints, 3); assert.equal(retainedAccount.trustScore, 4);
  await rejected(async () => {
    await tx.terraqoBuilderAccount.update({ where: { id: baseAccount.id }, data: { pendingPoints: 2 } });
    return applyNativeWorklogBaseInTransaction(tx, operation.id);
  }, 503);
  assert.equal((await tx.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId: operation.id } })).state, "PENDING");
  assert.deepEqual(await tx.terraqoNativeWorklogDecision.findUniqueOrThrow({ where: { operationId: operation.id } }), savedDecision);
  await rejected(async () => {
    await tx.terraqoWorklogEntry.update({ where: { id: created.receipt!.worklogId }, data: { trustScoreAwarded: 0 } });
    return applyNativeWorklogBaseInTransaction(tx, operation.id);
  }, 503);
  await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT native_base_own_phase");
  await tx.$executeRawUnsafe("RELEASE SAVEPOINT native_base_own_phase");
  await tx.$executeRawUnsafe("SAVEPOINT native_first_own_award");
  // Fail after the account increment, before ledger creation: outer transaction must roll back.
  await rejected(() => applyNativeFirstWorklogInTransaction(new Proxy(tx, { get(target, property) {
    if (property === "terraqoBuilderLedger") return { create: async () => { throw new Error("CONTROLLED_FIRST_LEDGER_FAULT"); } };
    return Reflect.get(target, property);
  } }), operation.id));
  assert.equal(await tx.terraqoBuilderAccount.count({ where: { userId: user.id } }), 0);
  assert.equal(await applyNativeFirstWorklogInTransaction(tx, operation.id), "credited");
  assert.equal(await applyNativeFirstWorklogInTransaction(tx, operation.id), "historical");
  const ownAccount = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { userId: user.id } });
  assert.equal(ownAccount.availablePoints, 25); assert.equal(ownAccount.lifetimeEarned, 25);
  assert.equal(ownAccount.contributionScore, 25); assert.equal(ownAccount.pendingPoints, 0);
  assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: ownAccount.id } }), 1);
  assert.equal((await tx.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId: operation.id } })).state, "PENDING");
  await rejected(async () => {
    await tx.terraqoBuilderContribution.update({ where: { id: first.id }, data: { approvedPoints: 0 } });
    return applyNativeFirstWorklogInTransaction(tx, operation.id);
  }, 503);
  await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT native_first_own_award");
  await tx.$executeRawUnsafe("RELEASE SAVEPOINT native_first_own_award");
  // Existing legacy reservation is recovered on the same source/contribution, never another25.
  await tx.$executeRawUnsafe("SAVEPOINT native_first_existing_own");
  await tx.terraqoBuilderContribution.update({ where: { id: first.id }, data: { detail: "Own legacy contribution", status: "IN_REVIEW" } });
  assert.equal(await applyNativeFirstWorklogInTransaction(tx, operation.id), "deferred");
  await tx.terraqoBuilderContribution.update({ where: { id: first.id }, data: { status: "VALIDATED" } });
  assert.equal(await applyNativeFirstWorklogInTransaction(tx, operation.id), "credited");
  assert.equal(await applyNativeFirstWorklogInTransaction(tx, operation.id), "historical");
  assert.equal(await tx.terraqoBuilderContribution.count({ where: { userId: user.id } }), 1);
  await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT native_first_existing_own");
  await tx.$executeRawUnsafe("RELEASE SAVEPOINT native_first_existing_own");
  await tx.$executeRawUnsafe("SAVEPOINT native_first_ineligible_own");
  await tx.terraqoBuilderContribution.delete({ where: { id: first.id } });
  await reserveNativeFirstWorklog(tx, { actorId: user.id, operationId: operation.id, createdAt: new Date() });
  assert.equal(await applyNativeFirstWorklogInTransaction(tx, operation.id), "ineligible");
  assert.equal(await tx.terraqoBuilderContribution.count({ where: { userId: user.id } }), 0);
  await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT native_first_ineligible_own");
  await tx.$executeRawUnsafe("RELEASE SAVEPOINT native_first_ineligible_own");
  const entry = await tx.terraqoWorklogEntry.findUniqueOrThrow({ where: { id: created.receipt.worklogId } });
  const guardRejected = (run: () => Promise<unknown>) => assert.rejects(run, (error: unknown) =>
    error instanceof NativeWorklogLegacyGuardError && error.status === 409);
  await guardRejected(() => assertLegacyWorklogs(tx, [entry.id]));
  await guardRejected(() => assertLegacyFirstWorklog(tx, user.id));
  await guardRejected(() => assertLegacyBuilderSource(tx, { userId: user.id, type: "FIRST_WORKLOG", sourceKey: `first-worklog:${user.id}` }));
  const validation = await tx.terraqoWorklogValidation.create({ data: { worklogId: entry.id, workspaceId,
    requestedByUserId: user.id, validatorUserId: user.id } });
  await guardRejected(() => assertLegacyValidation(tx, validation.id));
  await guardRejected(() => assertLegacyBuilderSource(tx, { userId: user.id, type: "EXPERIENCE_VALIDATION", sourceKey: `worklog-validation:${validation.id}` }));
  await guardRejected(() => assertLegacyBuilderSource(tx, { userId: user.id, type: "BETA_PARTICIPATION", sourceKey: `worklog:${entry.id}` }));
  await tx.$executeRawUnsafe("SAVEPOINT native_guard_own_state");
  await tx.terraqoNativeWorklogAccounting.update({ where: { operationId: operation.id }, data: { state: "APPLIED", completedAt: new Date() } });
  await tx.terraqoWorklogEntry.update({ where: { id: entry.id }, data: { moderationStatus: "STRONG_VERIFIED" } });
  await guardRejected(() => assertLegacyWorklogs(tx, [entry.id]));
  await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT native_guard_own_state");
  await tx.$executeRawUnsafe("RELEASE SAVEPOINT native_guard_own_state");
  await tx.terraqoWorklogValidation.delete({ where: { id: validation.id } });
  const legacy = await tx.terraqoWorklogEntry.create({ data: { authorId: user.id, professionalProfileId: profile.id,
    workspaceId, title: "ICC legacy propia", summary: "Entrada legacy propia temporal no adjudicada.", visibility: "PRIVATE" } });
  await assertLegacyWorklogs(tx, [legacy.id]);
  await guardRejected(() => assertLegacyReputationOwner(tx, user.id));
  await guardRejected(() => assertLegacyBuilderSource(tx, { userId: user.id, type: "BETA_PARTICIPATION", sourceKey: `worklog:${legacy.id}` }));
  // Actor-level exclusion does not prohibit unrelated reward sources.
  await assertLegacyBuilderSource(tx, { userId: user.id, type: "BUG_REPORT", sourceKey: `own-bug:${user.id}` });
  await tx.terraqoWorklogEntry.delete({ where: { id: legacy.id } });
  assert.equal(entry.visibility, "PRIVATE"); assert.equal(entry.tqPointsAwarded, 0); assert.equal(entry.trustScoreAwarded, 0);
  assert.deepEqual(entry.evidenceUrls, []); assert.deepEqual(entry.skills, []);
  assert.equal(operation.createdAt.toISOString(), entry.updatedAt.toISOString());
  assert.deepEqual(await createNativeWorklogInTransaction(tx, token, await parsed(), budget()), created);
  assert.deepEqual(await readNativeWorklogInTransaction(tx, token, payload.operationKey, budget()), created);
  await rejected(async () => {
    await tx.terraqoNativeWorklogAccounting.delete({ where: { operationId: operation.id } });
    return readNativeWorklogInTransaction(tx, token, payload.operationKey, budget());
  }, 503);
  await rejected(async () => createNativeWorklogInTransaction(tx, token, await parsed({ outcome: "Otro resultado" }), budget()), 409);
  const newAction = await parsed({ operationKey: "b".repeat(32) });
  function faultPort(delegate: "terraqoNativeWorklogAccounting" | "terraqoNativeWorklogDecision" | "activityLog", after?: () => void) {
    return new Proxy(tx, { get(target, property) {
      if (property === delegate) return new Proxy(target[delegate], { get(port, key) {
        if (key === "create") return async (args: never) => {
          if (!after) throw new Error("CONTROLLED_OWN_ROLLBACK_FAULT");
          const saved = await (port.create as (input: never) => Promise<unknown>)(args); after(); return saved;
        };
        return Reflect.get(port, key);
      } });
      return Reflect.get(target, property);
    } });
  }
  await rejected(() => createNativeWorklogInTransaction(faultPort("terraqoNativeWorklogAccounting"), token, newAction, budget()));
  await rejected(() => createNativeWorklogInTransaction(faultPort("terraqoNativeWorklogDecision"), token, newAction, budget()));
  await rejected(() => createNativeWorklogInTransaction(faultPort("activityLog"), token, newAction, budget()));
  const expiring = { ...token };
  await rejected(() => createNativeWorklogInTransaction(faultPort("activityLog", () => { expiring.exp = 0; }), expiring, newAction, budget()), 401);
  let clock = 0;
  const exhausted = new NativeWorklogBudget(() => clock);
  await rejected(() => createNativeWorklogInTransaction(faultPort("activityLog", () => { clock = 50000; }), token, newAction, exhausted), 503);
  const project = await tx.project.create({ data: { title: `ICC own native ${marker}`, slug: `native-${marker}`,
    terraqoWorkspaceId: workspaceId, servicesApplied: [], summary: "Fixture propio", description: "Fixture propio", isPublic: false } });
  const projectInput = await parsed({ operationKey: "c".repeat(32), projectId: project.id, projectVersion: project.updatedAt.toISOString() });
  await rejected(() => createNativeWorklogInTransaction(tx, token, projectInput, budget()), 403);
  const experience = await tx.terraqoProfessionalExperience.create({ data: { professionalProfileId: profile.id,
    projectId: project.id, workspaceId, title: "ICC vínculo propio", visibility: "PRIVATE" } });
  await rejected(async () => createNativeWorklogInTransaction(tx, token,
    await parsed({ operationKey: "c".repeat(32), projectId: project.id, projectVersion: "2020-01-01T00:00:00.000Z" }), budget()), 409);
  const bound = await createNativeWorklogInTransaction(tx, token, projectInput, budget());
  assert.equal(bound.receipt?.originalProjectVersion, project.updatedAt.toISOString());
  await tx.terraqoProfessionalExperience.delete({ where: { id: experience.id } });
  const job = await tx.terraqoJobPost.create({ data: { workspaceId, projectId: project.id,
    title: "ICC post propio", slug: `native-${marker}`, summary: "ICC propio", description: "ICC propio", visibility: "PRIVATE" } });
  const application = await tx.terraqoProjectApplication.create({ data: { workspaceId, jobPostId: job.id,
    professionalProfileId: profile.id, userId: user.id, status: "ACCEPTED" } });
  const accepted = await parsed({ operationKey: "d".repeat(32), projectId: project.id, projectVersion: project.updatedAt.toISOString() });
  await createNativeWorklogInTransaction(tx, token, accepted, budget());
  await rejected(async () => {
    await tx.terraqoProjectApplication.update({ where: { id: application.id }, data: { status: "SUBMITTED" } });
    return createNativeWorklogInTransaction(tx, token,
      await parsed({ operationKey: "e".repeat(32), projectId: project.id, projectVersion: project.updatedAt.toISOString() }), budget());
  }, 403);
  await tx.terraqoJobPost.delete({ where: { id: job.id } });
  await tx.project.delete({ where: { id: project.id } });
  // Historical replay does not revalidate or recreate a former project binding.
  assert.deepEqual(await createNativeWorklogInTransaction(tx, token, projectInput, budget()), bound);
  await tx.terraqoWorklogEntry.delete({ where: { id: entry.id } });
  const historical = await readNativeWorklogInTransaction(tx, token, payload.operationKey, budget());
  assert.deepEqual(historical.receipt, created.receipt); assert.equal(historical.current, null);
  await guardRejected(() => assertLegacyWorklogs(tx, [entry.id]));
  assert.deepEqual(await createNativeWorklogInTransaction(tx, token, initial, budget()), historical);
  await rejected(async () => {
    await tx.terraqoNativeWorklogDecision.delete({ where: { operationId: operation.id } });
    return readNativeWorklogInTransaction(tx, token, payload.operationKey, budget());
  }, 503);
  await rejected(async () => {
    await tx.terraqoNativeWorklogDecision.delete({ where: { operationId: operation.id } });
    return createNativeWorklogInTransaction(tx, token, await parsed({ operationKey: "f".repeat(32), title: "ICC incomplete decision" }), budget());
  }, 503);
  await tx.$executeRawUnsafe("SAVEPOINT native_decision_own_quota");
  const normalized = await parsed({ operationKey: "1".repeat(32), title: payload.title.toUpperCase(), summary: payload.summary.toUpperCase(), outcome: "Different outcome" });
  const dup = await createNativeWorklogInTransaction(tx, token, normalized, budget());
  const dupReceipt = await tx.terraqoNativeWorklogOperation.findUniqueOrThrow({ where: { actorId_workspaceId_operationKey: { actorId: user.id, workspaceId, operationKey: normalized.payload.operationKey } } });
  const dupDecision = await tx.terraqoNativeWorklogDecision.findUniqueOrThrow({ where: { operationId: dupReceipt.id } });
  assert.ok(dup.receipt); assert.ok(dupDecision.priorDuplicates >= 1);
  assert.equal(dupDecision.tqPoints + dupDecision.trustScore, 0); // First native target was deleted, key remains durable.
  const unique = async (key: string, title: string) => {
    const input = await parsed({ operationKey: key.repeat(32), title });
    await createNativeWorklogInTransaction(tx, token, input, budget());
    const op = await tx.terraqoNativeWorklogOperation.findUniqueOrThrow({ where: { actorId_workspaceId_operationKey: { actorId: user.id, workspaceId, operationKey: input.payload.operationKey } } });
    return tx.terraqoNativeWorklogDecision.findUniqueOrThrow({ where: { operationId: op.id } });
  };
  const third = await unique("2", "ICC unique third own allocation");
  assert.equal(third.rewardedInDay, 2); assert.equal(third.tqPoints, 1);
  const fourth = await unique("3", "ICC unique fourth own allocation");
  assert.equal(fourth.rewardedInDay, 3); assert.equal(fourth.tqPoints, 0); assert.equal(fourth.trustScore, 1);
  // Manual own legacy state exercises retained counts, not a legacy awarding flow.
  for (let i = 0; i < 8; i++) await tx.terraqoWorklogEntry.create({ data: { authorId: user.id, professionalProfileId: profile.id,
    workspaceId, title: `ICC own legacy count ${i}`, summary: "Own temporary legacy trust count", visibility: "PRIVATE", trustScoreAwarded: 1 } });
  const capped = await unique("4", "ICC unique weekly cap allocation");
  assert.ok(capped.trustedInWindow >= 10); assert.equal(capped.trustScore, 0);
  const legacyInput = await parsed({ operationKey: "5".repeat(32), title: "ICC own legacy duplicate" });
  await tx.terraqoWorklogEntry.create({ data: { authorId: user.id, professionalProfileId: profile.id, workspaceId,
    title: legacyInput.payload.title, summary: legacyInput.payload.summary, visibility: "PRIVATE", contentFingerprint: nativeWorklogContentKey(legacyInput.payload) } });
  await createNativeWorklogInTransaction(tx, token, legacyInput, budget());
  const legacyOp = await tx.terraqoNativeWorklogOperation.findUniqueOrThrow({ where: { actorId_workspaceId_operationKey: { actorId: user.id, workspaceId, operationKey: legacyInput.payload.operationKey } } });
  assert.equal((await tx.terraqoNativeWorklogDecision.findUniqueOrThrow({ where: { operationId: legacyOp.id } })).moderationStatus, "DUPLICATE");
  assert.deepEqual(await tx.terraqoNativeWorklogDecision.findUniqueOrThrow({ where: { operationId: operation.id } }), savedDecision);
  await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT native_decision_own_quota");
  await tx.$executeRawUnsafe("RELEASE SAVEPOINT native_decision_own_quota");
  assert.deepEqual(await counts(), { entry: 2, receipt: 3, accounting: 3, decision: 3, audit: 3 });
  assert.equal(await tx.terraqoBuilderAccount.count({ where: { userId: user.id } }), 0);
  assert.equal(await tx.terraqoBuilderContribution.count({ where: { userId: user.id } }), 1);
  assert.equal((await tx.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: profile.id } })).liveCvEnabled, false);
  assert.deepEqual(await tx.terraqoNativeWorklogDecision.findUniqueOrThrow({ where: { operationId: operation.id } }), savedDecision);
  await tx.terraqoNativeWorklogDecision.deleteMany({ where: { operation: { actorId: user.id } } });
  await tx.$executeRaw`DELETE FROM icc."TerraqoNativeWorklogAuthority" WHERE "actorId"=${user.id}`;
  await tx.terraqoNativeWorklogAccounting.deleteMany({ where: { operation: { actorId: user.id } } });
  await tx.terraqoNativeWorklogOperation.deleteMany({ where: { actorId: user.id } });
  await tx.activityLog.deleteMany({ where: { actorId: user.id } });
  await tx.verificationToken.deleteMany({ where: { identifier } });
  await tx.terraqoBuilderContribution.deleteMany({ where: { userId: user.id } });
  await tx.user.delete({ where: { id: user.id } });
  assert.equal(await tx.user.count({ where: { id: user.id } }), 0);
  assert.equal(await tx.terraqoWorklogEntry.count({ where: { authorId: user.id } }), 0);
  assert.equal(await tx.activityLog.count({ where: { actorId: user.id } }), 0);
}
