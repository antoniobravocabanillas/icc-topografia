import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";
import { createNativeWorklogInTransaction, readNativeWorklogInTransaction } from "../lib/server/native-worklog-operation";
import { parseNativeWorklogPayload } from "../lib/server/native-worklog-payload";
import { NativeWorklogBudget } from "../lib/server/native-worklog-budget";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";
import { applyNativeFirstWorklogInTransaction } from "../lib/server/native-worklog-first-award";
import { inspectNativeWorkerEligibilityInTransaction } from "../lib/server/native-worklog-worker-eligibility";

/** Actual creation core with own SQL grant and typed token. No JWT/HTTP claim.
 * All DDL, points and fixtures belong to the checker's outer rollback transaction.
 */
export async function nativeFirstCreationRollback(tx: Prisma.TransactionClient, workspaceId: string,
  disposition: "RESERVED" | "EXISTING" | "INELIGIBLE") {
  const marker = randomUUID();
  const user = await tx.user.create({ data: { name: `ICC FIRST creation own ${marker}`,
    email: `first-creation-${marker}@example.invalid`, role: "CUSTOMER" } });
  const profile = await tx.terraqoProfessionalProfile.create({ data: { userId: user.id, visibility: "PRIVATE", liveCvEnabled: false } });
  await tx.terraqoWorkspaceMember.create({ data: { userId: user.id, workspaceId, active: true, role: "PROFESSIONAL" } });
  const token: WorkspacePortalToken = { sub: user.id, workspaceId, workspaceSlug: "icc-topografia", role: "PROFESSIONAL",
    iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600, jti: randomUUID() };
  const identifier = `portal-session:${workspaceId}:${user.id}`;
  await tx.verificationToken.create({ data: { identifier, token: createHash("sha256").update(token.jti!).digest("hex"),
    expires: new Date(Date.now()+3500000) } });
  let previous: string | null = null;
  if (disposition === "INELIGIBLE") previous = (await tx.terraqoWorklogEntry.create({ data: {
    authorId: user.id, professionalProfileId: profile.id, workspaceId, title: "ICC propia anterior",
    summary: "Entrada previa propia para la decisión FIRST.", visibility: "PRIVATE" } })).id;
  if (disposition === "EXISTING") await tx.terraqoBuilderContribution.create({ data: {
    userId: user.id, sourceKey: `first-worklog:${user.id}`, type: "FIRST_WORKLOG", requestedPoints: 25,
    approvedPoints: 0, status: "IN_REVIEW", title: "ICC aporte previo propio", detail: "Own unfinished legacy FIRST" } });
  const parse = (key = "a".repeat(32)) => parseNativeWorklogPayload(new Request("https://example.invalid/own", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operationKey: key,
      title: "ICC decisión FIRST creación real", summary: "Texto temporal propio para snapshot FIRST dentro de creación real.",
      outcome: "", type: "FIELD_UPDATE", projectId: "", projectVersion: "" }) }));
  const parsed = await parse(), budget = () => new NativeWorklogBudget();
  const snapshot = async () => (await tx.$queryRaw<Array<{ state: unknown }>>(Prisma.sql`SELECT jsonb_build_object(
    'profile',(SELECT to_jsonb(r) FROM icc."TerraqoProfessionalProfile" r WHERE r.id=${profile.id}),
    'entries',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoWorklogEntry" r WHERE r."authorId"=${user.id}),
    'receipt',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoNativeWorklogOperation" r WHERE r."actorId"=${user.id}),
    'first',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r."operationId") FROM icc."TerraqoNativeWorklogFirstDecision" r WHERE r."actorId"=${user.id}),
    'decision',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r."operationId") FROM icc."TerraqoNativeWorklogDecision" r JOIN icc."TerraqoNativeWorklogOperation" o ON o.id=r."operationId" WHERE o."actorId"=${user.id}),
    'authority',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r."operationId") FROM icc."TerraqoNativeWorklogAuthority" r WHERE r."actorId"=${user.id}),
    'outbox',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r."operationId") FROM icc."TerraqoNativeWorklogAccounting" r JOIN icc."TerraqoNativeWorklogOperation" o ON o.id=r."operationId" WHERE o."actorId"=${user.id}),
    'contributions',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderContribution" r WHERE r."userId"=${user.id}),
    'account',(SELECT to_jsonb(r) FROM icc."TerraqoBuilderAccount" r WHERE r."userId"=${user.id}),
    'ledger',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderLedger" r JOIN icc."TerraqoBuilderAccount" a ON a.id=r."accountId" WHERE a."userId"=${user.id}),
    'audit',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."ActivityLog" r WHERE r."actorId"=${user.id})) AS state`))[0].state;
  const reject503 = (e: unknown) => e instanceof NativeWorklogOperationError && e.status === 503;
  async function isolated(action: () => Promise<void>) {
    const before = await snapshot();
    await tx.$executeRawUnsafe("SAVEPOINT own_first_creation");
    try { await action(); } finally {
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_first_creation");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_first_creation");
    }
    assert.deepEqual(await snapshot(), before);
  }
  await isolated(async () => {
    const faulty = new Proxy(tx, { get(target, field) {
      if (field === "$executeRaw") return async (...args: unknown[]) => {
        const result = await Reflect.apply(target.$executeRaw, target, args);
        const statement = args[0];
        const sql = Array.isArray(statement) ? statement.join("?") : (statement as Prisma.Sql).sql;
        if (sql.includes('INSERT INTO icc."TerraqoNativeWorklogFirstDecision"')) {
          assert.equal(await tx.terraqoNativeWorklogFirstDecision.count({ where: { actorId: user.id } }), 1);
          throw new Error("CONTROLLED_AFTER_FIRST_DECISION_INSERT");
        }
        return result;
      };
      return Reflect.get(target, field);
    } });
    await assert.rejects(() => createNativeWorklogInTransaction(faulty, token, parsed, budget()),
      (e: unknown) => e instanceof Error && e.message === "CONTROLLED_AFTER_FIRST_DECISION_INSERT");
  });
  const created = await createNativeWorklogInTransaction(tx, token, parsed, budget());
  const receipt = await tx.terraqoNativeWorklogOperation.findFirstOrThrow({ where: { actorId: user.id } });
  const first = await tx.terraqoNativeWorklogFirstDecision.findUniqueOrThrow({ where: { operationId: receipt.id } });
  assert.equal(first.disposition, disposition); assert.equal(first.actorId, user.id);
  assert.equal(first.priorReceipts, 0); assert.equal(first.priorEntries, previous ? 1 : 0);
  assert.equal(first.fingerprint, receipt.fingerprint); assert.deepEqual(first.createdAt, receipt.createdAt);
  const beforeReads = await snapshot();
  assert.deepEqual(await readNativeWorklogInTransaction(tx, token, parsed.payload.operationKey, budget()), created);
  assert.deepEqual(await createNativeWorklogInTransaction(tx, token, parsed, budget()), created);
  assert.equal((await inspectNativeWorkerEligibilityInTransaction(tx, receipt.id, budget())).disposition, "INSPECT_PHASES");
  assert.deepEqual(await snapshot(), beforeReads);
  await isolated(async () => {
    await tx.terraqoNativeWorklogFirstDecision.delete({ where: { operationId: receipt.id } });
    await assert.rejects(() => readNativeWorklogInTransaction(tx, token, parsed.payload.operationKey, budget()), reject503);
    await assert.rejects(() => createNativeWorklogInTransaction(tx, token, parsed, budget()), reject503);
    await assert.rejects(async () => createNativeWorklogInTransaction(tx, token, await parse("b".repeat(32)), budget()), reject503);
    await assert.rejects(() => inspectNativeWorkerEligibilityInTransaction(tx, receipt.id, budget()), reject503);
    await assert.rejects(() => applyNativeFirstWorklogInTransaction(tx, receipt.id), reject503);
  });
  if (previous) await tx.terraqoWorklogEntry.delete({ where: { id: previous } });
  assert.equal(await applyNativeFirstWorklogInTransaction(tx, receipt.id),
    disposition === "RESERVED" ? "credited" : disposition === "EXISTING" ? "deferred" : "ineligible");
  const afterPhase = await snapshot();
  assert.equal(await applyNativeFirstWorklogInTransaction(tx, receipt.id),
    disposition === "RESERVED" ? "historical" : disposition === "EXISTING" ? "deferred" : "ineligible");
  assert.deepEqual(await snapshot(), afterPhase);
  assert.deepEqual(await tx.terraqoNativeWorklogFirstDecision.findUniqueOrThrow({ where: { operationId: receipt.id } }), first);
  const account = await tx.terraqoBuilderAccount.findUnique({ where: { userId: user.id } });
  if (disposition === "RESERVED") {
    assert.equal(account?.availablePoints, 25); assert.equal(account?.lifetimeEarned, 25);
    assert.equal(account?.contributionScore, 25); assert.equal(account?.pendingPoints, 0);
    assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account!.id } }), 1);
  } else assert.equal(account, null);
  await tx.terraqoWorklogEntry.delete({ where: { id: receipt.targetWorklogId } });
  const historical = await readNativeWorklogInTransaction(tx, token, parsed.payload.operationKey, budget());
  assert.equal(historical.current, null); assert.deepEqual(historical.receipt, created.receipt);
  const deletedState = await snapshot();
  assert.deepEqual(await createNativeWorklogInTransaction(tx, token, parsed, budget()), historical);
  assert.deepEqual(await snapshot(), deletedState);
  assert.equal((await tx.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId: receipt.id } })).state, "PENDING");
  if (account) await tx.terraqoBuilderLedger.deleteMany({ where: { accountId: account.id } });
  await tx.terraqoNativeWorklogFirstDecision.deleteMany({ where: { actorId: user.id } });
  await tx.terraqoBuilderContribution.deleteMany({ where: { userId: user.id } });
  await tx.terraqoBuilderAccount.deleteMany({ where: { userId: user.id } });
  await tx.terraqoNativeWorklogAuthority.deleteMany({ where: { actorId: user.id } });
  await tx.terraqoNativeWorklogDecision.deleteMany({ where: { operation: { actorId: user.id } } });
  await tx.terraqoNativeWorklogAccounting.deleteMany({ where: { operation: { actorId: user.id } } });
  await tx.terraqoNativeWorklogOperation.deleteMany({ where: { actorId: user.id } });
  await tx.activityLog.deleteMany({ where: { actorId: user.id } });
  await tx.verificationToken.deleteMany({ where: { identifier } });
  await tx.user.delete({ where: { id: user.id } });
  assert.equal(await tx.user.count({ where: { id: user.id } }), 0);
  assert.equal(await tx.terraqoNativeWorklogFirstDecision.count({ where: { actorId: user.id } }), 0);
  assert.equal(await tx.terraqoBuilderContribution.count({ where: { userId: user.id } }), 0);
  assert.equal(await tx.terraqoBuilderAccount.count({ where: { userId: user.id } }), 0);
}
