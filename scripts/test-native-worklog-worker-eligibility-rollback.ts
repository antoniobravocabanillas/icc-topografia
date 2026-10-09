import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { parseNativeWorklogPayload } from "../lib/server/native-worklog-payload";
import { planNativeWorklogDecision, saveNativeWorklogDecision } from "../lib/server/native-worklog-decision";
import { NativeWorklogBudget } from "../lib/server/native-worklog-budget";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";
import { inspectNativeWorkerEligibilityInTransaction } from "../lib/server/native-worklog-worker-eligibility";
import { chooseNativeFirstWorklogInTransaction, saveNativeFirstWorklogDecision } from "../lib/server/native-worklog-first-decision";

/** Only inside pinned five-table temporary DDL and the checker's outer rollback. */
export async function nativeWorkerEligibilityRollback(tx: Prisma.TransactionClient, workspaceId: string) {
  const marker = randomUUID(), id = createHash("sha256").update(marker).digest("hex");
  const user = await tx.user.create({ data: { role: "CUSTOMER", name: `ICC worker eligibility own ${marker}`,
    email: `worker-eligibility-${marker}@example.invalid` } });
  const profile = await tx.terraqoProfessionalProfile.create({ data: { userId: user.id, visibility: "PRIVATE", liveCvEnabled: false } });
  const member = await tx.terraqoWorkspaceMember.create({ data: { userId: user.id, workspaceId, role: "CLIENT", active: false } });
  const parsed = await parseNativeWorklogPayload(new Request("https://example.invalid/own", { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ operationKey: "a".repeat(32), title: "ICC elegibilidad propia",
      summary: "Fixture temporal propio para inspección histórica SQL.", outcome: "", type: "FIELD_UPDATE", projectId: "", projectVersion: "" }) }));
  const stamp = new Date("2026-09-01T12:00:00.000Z");
  await tx.terraqoWorklogEntry.create({ data: { authorId: user.id, professionalProfileId: profile.id, workspaceId,
    title: "ICC prior own uncredited entry", summary: "Own prior history for durable FIRST ineligibility.",
    visibility: "PRIVATE", createdAt: new Date("2026-08-01T12:00:00.000Z") } });
  const firstChoice = await chooseNativeFirstWorklogInTransaction(tx, user.id, id, stamp);
  assert.equal(firstChoice.disposition, "INELIGIBLE");
  // Manual historical fixture, not live creation/JWT or count provenance proof.
  const plan = await planNativeWorklogDecision(tx, user.id, parsed, stamp);
  const entry = await tx.terraqoWorklogEntry.create({ data: { authorId: user.id, workspaceId, professionalProfileId: profile.id,
    title: parsed.payload.title, summary: parsed.payload.summary, visibility: "PRIVATE", createdAt: stamp, updatedAt: stamp } });
  await tx.terraqoNativeWorklogOperation.create({ data: { id, actorId: user.id, workspaceId, professionalProfileId: profile.id,
    operationKey: parsed.payload.operationKey, fingerprint: parsed.fingerprint, targetWorklogId: entry.id, worklogId: entry.id,
    resultVersion: stamp, createdAt: stamp } });
  await saveNativeWorklogDecision(tx, id, plan);
  await saveNativeFirstWorklogDecision(tx, id, firstChoice);
  await tx.terraqoNativeWorklogAccounting.create({ data: { operationId: id, createdAt: stamp, nextAttemptAt: stamp } });
  await tx.terraqoNativeWorklogAuthority.create({ data: { operationId: id, actorId: user.id, workspaceId, professionalProfileId: profile.id,
    createdAt: stamp, fingerprint: parsed.fingerprint, policyVersion: "native-creation-authority-v1", grantHash: "c".repeat(64),
    tokenIssuedAt: stamp, tokenExpiresAt: new Date("2026-09-02T12:00:00.000Z"), grantExpiresAt: new Date("2026-09-02T12:00:00.000Z"),
    paidThrough: new Date("2026-09-03T12:00:00.000Z"), role: "PROFESSIONAL", modules: ["LIVE_CV", "PROFESSIONAL_NETWORK"] } });
  await tx.terraqoBuilderAccount.create({ data: { userId: user.id, pendingPoints: 3, availablePoints: 2, lifetimeEarned: 2,
    contributionScore: 2, trustScore: 4 } });
  const snapshot = async () => (await tx.$queryRaw<Array<{ state: unknown }>>(Prisma.sql`SELECT jsonb_build_object(
    'user',(SELECT to_jsonb(r) FROM icc."User" r WHERE r.id=${user.id}),
    'profile',(SELECT to_jsonb(r) FROM icc."TerraqoProfessionalProfile" r WHERE r.id=${profile.id}),
    'entries',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoWorklogEntry" r WHERE r."authorId"=${user.id}),
    'receipt',(SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogOperation" r WHERE r.id=${id}),
    'decision',(SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogDecision" r WHERE r."operationId"=${id}),
    'first',(SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogFirstDecision" r WHERE r."operationId"=${id}),
    'authority',(SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogAuthority" r WHERE r."operationId"=${id}),
    'outbox',(SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogAccounting" r WHERE r."operationId"=${id}),
    'account',(SELECT to_jsonb(r) FROM icc."TerraqoBuilderAccount" r WHERE r."userId"=${user.id}),
    'member',(SELECT to_jsonb(r) FROM icc."TerraqoWorkspaceMember" r WHERE r.id=${member.id}),
    'contributions',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderContribution" r WHERE r."userId"=${user.id}),
    'ledger',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderLedger" r
      JOIN icc."TerraqoBuilderAccount" a ON a.id=r."accountId" WHERE a."userId"=${user.id})
  ) AS state`))[0].state;
  const inspect = () => inspectNativeWorkerEligibilityInTransaction(tx, id, new NativeWorklogBudget());
  const baseline = await snapshot();
  assert.equal((await inspect()).disposition, "INSPECT_PHASES");
  assert.deepEqual(await inspect(), { disposition: "INSPECT_PHASES", completionAuthorized: false, ownerAccessAuthorized: false });
  assert.deepEqual(await snapshot(), baseline); // Expired historical proof, inactive CLIENT, no session grant.
  async function isolated(action: () => Promise<void>) {
    await tx.$executeRawUnsafe("SAVEPOINT own_worker_eligibility");
    try { await action(); } finally {
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_worker_eligibility");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_worker_eligibility");
    }
    assert.deepEqual(await snapshot(), baseline);
  }
  const rejected = () => assert.rejects(inspect, (e: unknown) => e instanceof NativeWorklogOperationError && e.status === 503);
  await isolated(async () => { await tx.terraqoNativeWorklogAuthority.delete({ where: { operationId: id } }); await rejected(); });
  await isolated(async () => { await tx.terraqoNativeWorklogDecision.delete({ where: { operationId: id } }); await rejected(); });
  await isolated(async () => { await tx.terraqoNativeWorklogFirstDecision.delete({ where: { operationId: id } }); await rejected(); });
  await isolated(async () => { await tx.terraqoNativeWorklogAccounting.delete({ where: { operationId: id } }); await rejected(); });
  await isolated(async () => {
    await tx.terraqoNativeWorklogAccounting.update({ where: { operationId: id }, data: { nextAttemptAt: new Date("2099-01-01T00:00:00.000Z") } });
    assert.equal((await inspect()).disposition, "NOT_DUE");
  });
  await isolated(async () => {
    await tx.terraqoNativeWorklogAccounting.update({ where: { operationId: id }, data: { attempts: 8 } });
    assert.equal((await inspect()).disposition, "REVIEW_REQUIRED");
  });
  for (const state of ["APPLIED", "QUARANTINED"]) await isolated(async () => {
    // Synthetic terminal marker checks preservation only, never full accounting completion.
    await tx.terraqoNativeWorklogAccounting.update({ where: { operationId: id }, data: { state, completedAt: state === "APPLIED" ? new Date() : null } });
    const before = await snapshot(); assert.equal((await inspect()).disposition, "TERMINAL"); assert.deepEqual(await snapshot(), before);
  });
  await isolated(async () => {
    await tx.terraqoWorklogEntry.delete({ where: { id: entry.id } });
    const before = await snapshot(); assert.equal((await inspect()).disposition, "TARGET_MISSING"); assert.deepEqual(await snapshot(), before);
  });
  assert.equal(await tx.terraqoBuilderContribution.count({ where: { userId: user.id } }), 0);
  const account = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { userId: user.id } });
  assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 0);
  assert.equal(await tx.activityLog.count({ where: { actorId: user.id } }), 0);
  await tx.terraqoBuilderAccount.delete({ where: { userId: user.id } });
  await tx.terraqoNativeWorklogFirstDecision.delete({ where: { operationId: id } });
  await tx.terraqoNativeWorklogAuthority.delete({ where: { operationId: id } });
  await tx.terraqoNativeWorklogDecision.delete({ where: { operationId: id } });
  await tx.terraqoNativeWorklogAccounting.delete({ where: { operationId: id } });
  await tx.terraqoNativeWorklogOperation.delete({ where: { id } });
  await tx.user.delete({ where: { id: user.id } });
  assert.equal(await tx.user.count({ where: { id: user.id } }), 0);
  assert.equal(await tx.terraqoProfessionalProfile.count({ where: { id: profile.id } }), 0);
  assert.equal(await tx.terraqoWorkspaceMember.count({ where: { id: member.id } }), 0);
  assert.equal(await tx.terraqoWorklogEntry.count({ where: { id: entry.id } }), 0);
  assert.equal(await tx.terraqoBuilderAccount.count({ where: { userId: user.id } }), 0);
  assert.equal(await tx.terraqoNativeWorklogOperation.count({ where: { id } }), 0);
}
