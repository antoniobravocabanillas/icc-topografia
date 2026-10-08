import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";
import { createNativeWorklogInTransaction, readNativeWorklogInTransaction } from "../lib/server/native-worklog-operation";
import { parseNativeWorklogPayload } from "../lib/server/native-worklog-payload";
import { NativeWorklogBudget } from "../lib/server/native-worklog-budget";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";

/** Only the pinned checker's temporary DDL and outer rollback may invoke this proof. */
export async function nativeCreationAuthorityRollback(tx: Prisma.TransactionClient, workspaceId: string) {
  const marker = randomUUID();
  const user = await tx.user.create({ data: { name: `ICC creation authority own ${marker}`, email: `creation-authority-${marker}@example.invalid`, role: "CUSTOMER" } });
  const profile = await tx.terraqoProfessionalProfile.create({ data: { userId: user.id, visibility: "PRIVATE", liveCvEnabled: false } });
  const member = await tx.terraqoWorkspaceMember.create({ data: { userId: user.id, workspaceId, active: true, role: "PROFESSIONAL" } });
  const token: WorkspacePortalToken = { sub: user.id, workspaceId, workspaceSlug: "icc-topografia", role: "PROFESSIONAL",
    iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600, jti: randomUUID() };
  const identifier = `portal-session:${workspaceId}:${user.id}`;
  const hash = (jti: string) => createHash("sha256").update(jti).digest("hex");
  const grantExpires = new Date(Date.now()+3500000);
  await tx.verificationToken.create({ data: { identifier, token: hash(token.jti!), expires: grantExpires } });
  const parse = (operationKey = "a".repeat(32)) => parseNativeWorklogPayload(new Request("https://example.invalid/own", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operationKey,
      title: "ICC autoridad de creación propia", summary: "Texto temporal propio para captura de autoridad real SQL.",
      outcome: "", type: "FIELD_UPDATE", projectId: "", projectVersion: "" }) }));
  const initial = await parse();
  const budget = () => new NativeWorklogBudget();
  const state = async () => ({
    entries: await tx.terraqoWorklogEntry.count({ where: { authorId: user.id } }),
    receipts: await tx.terraqoNativeWorklogOperation.count({ where: { actorId: user.id } }),
    decisions: await tx.terraqoNativeWorklogDecision.count({ where: { operation: { actorId: user.id } } }),
    pending: await tx.terraqoNativeWorklogAccounting.count({ where: { operation: { actorId: user.id } } }),
    proofs: Number((await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM icc."TerraqoNativeWorklogAuthority" WHERE "actorId"=${user.id}`)[0].n),
    audits: await tx.activityLog.count({ where: { actorId: user.id } }),
    contributions: await tx.terraqoBuilderContribution.count({ where: { userId: user.id } }),
  });
  async function isolated(action: () => Promise<void>) {
    const before = await state();
    await tx.$executeRawUnsafe("SAVEPOINT own_creation_authority_case");
    try { await action(); } finally {
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_creation_authority_case");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_creation_authority_case");
    }
    assert.deepEqual(await state(), before);
  }
  const reject = (action: () => Promise<unknown>, status: number) => assert.rejects(action,
    (e: unknown) => e instanceof NativeWorklogOperationError && e.status === status);
  assert.deepEqual(await readNativeWorklogInTransaction(tx, token, initial.payload.operationKey, budget()), { receipt: null, current: null });
  await isolated(() => reject(() => createNativeWorklogInTransaction(tx, { ...token, iat: Number.NaN }, initial, budget()), 401));
  await isolated(() => reject(() => createNativeWorklogInTransaction(tx, { ...token, iat: token.exp+1 }, initial, budget()), 401));
  await isolated(async () => {
    const faulty = new Proxy(tx, { get(target, field) {
      if (field === "$executeRaw") return async (...args: unknown[]) => {
        const result = await Reflect.apply(target.$executeRaw, target, args);
        const statement = args[0];
        const sql = Array.isArray(statement) ? statement.join("?") : (statement as Prisma.Sql).sql;
        if (sql.includes('INSERT INTO icc."TerraqoNativeWorklogAuthority"')) {
          assert.equal((await state()).proofs, 1);
          throw new Error("CONTROLLED_AFTER_AUTHORITY_INSERT");
        }
        return result;
      };
      return Reflect.get(target, field);
    } });
    await assert.rejects(() => createNativeWorklogInTransaction(faulty, token, initial, budget()),
      (error: unknown) => error instanceof Error && error.message === "CONTROLLED_AFTER_AUTHORITY_INSERT");
  });
  assert.deepEqual(await state(), { entries: 0, receipts: 0, decisions: 0, pending: 0, proofs: 0, audits: 0, contributions: 0 });
  const created = await createNativeWorklogInTransaction(tx, token, initial, budget());
  assert.deepEqual(await state(), { entries: 1, receipts: 1, decisions: 1, pending: 1, proofs: 1, audits: 1, contributions: 1 });
  const receipt = await tx.terraqoNativeWorklogOperation.findFirstOrThrow({ where: { actorId: user.id } });
  const readProof = () => tx.$queryRaw<Record<string, unknown>[]>`SELECT * FROM icc."TerraqoNativeWorklogAuthority" WHERE "operationId"=${receipt.id}`;
  const saved = await readProof();
  assert.equal(saved[0].professionalProfileId, profile.id);
  assert.equal(saved[0].grantHash, hash(token.jti!));
  assert.equal((saved[0].tokenIssuedAt as Date).getTime(), token.iat*1000);
  assert.equal((saved[0].tokenExpiresAt as Date).getTime(), token.exp*1000);
  assert.equal((saved[0].grantExpiresAt as Date).getTime(), grantExpires.getTime());
  assert.equal((saved[0].createdAt as Date).getTime(), receipt.createdAt.getTime());
  assert.deepEqual(saved[0].modules, ["LIVE_CV", "PROFESSIONAL_NETWORK"]);
  assert.ok(!Object.hasOwn(saved[0], "jti") && !Object.hasOwn(saved[0], "token"));
  await isolated(async () => {
    await tx.$executeRaw`DELETE FROM icc."TerraqoNativeWorklogAuthority" WHERE "operationId"=${receipt.id}`;
    await reject(() => readNativeWorklogInTransaction(tx, token, initial.payload.operationKey, budget()), 503);
    await reject(() => createNativeWorklogInTransaction(tx, token, initial, budget()), 503);
    await reject(async () => createNativeWorklogInTransaction(tx, token, await parse("b".repeat(32)), budget()), 503);
  });
  await isolated(async () => {
    await tx.terraqoWorkspaceMember.update({ where: { id: member.id }, data: { role: "CLIENT" } });
    await reject(() => readNativeWorklogInTransaction(tx, token, initial.payload.operationKey, budget()), 403);
  });
  // Replace only this fixture's grant. History is neither refreshed nor tied to the new grant.
  await tx.verificationToken.delete({ where: { identifier_token: { identifier, token: hash(token.jti!) } } });
  await reject(() => readNativeWorklogInTransaction(tx, token, initial.payload.operationKey, budget()), 401);
  const fresh = { ...token, jti: randomUUID(), iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600 };
  await tx.verificationToken.create({ data: { identifier, token: hash(fresh.jti), expires: new Date(Date.now()+3600000) } });
  assert.deepEqual(await readNativeWorklogInTransaction(tx, fresh, initial.payload.operationKey, budget()), created);
  assert.deepEqual(await createNativeWorklogInTransaction(tx, fresh, initial, budget()), created);
  assert.deepEqual(await readProof(), saved);
  await isolated(async () => {
    const expiring = { ...fresh };
    const faulty = new Proxy(tx, { get(target, field) {
      if (field === "activityLog") return new Proxy(target.activityLog, { get(delegate, method) {
        if (method === "create") return async (args: Prisma.ActivityLogCreateArgs) => {
          const result = await delegate.create(args);
          assert.equal((await state()).proofs, 2);
          expiring.exp = 0;
          return result;
        };
        return Reflect.get(delegate, method);
      } });
      return Reflect.get(target, field);
    } });
    await reject(async () => createNativeWorklogInTransaction(faulty, expiring, await parse("b".repeat(32)), budget()), 401);
  });
  await tx.terraqoWorklogEntry.delete({ where: { id: receipt.targetWorklogId } });
  const historical = await readNativeWorklogInTransaction(tx, fresh, initial.payload.operationKey, budget());
  assert.equal(historical.current, null); assert.deepEqual(historical.receipt, created.receipt);
  assert.deepEqual(await createNativeWorklogInTransaction(tx, fresh, initial, budget()), historical);
  assert.deepEqual(await readProof(), saved);
  assert.equal(await tx.terraqoBuilderAccount.count({ where: { userId: user.id } }), 0);
  const first = await tx.terraqoBuilderContribution.findFirstOrThrow({ where: { userId: user.id } });
  assert.equal(first.approvedPoints, 0); assert.equal(first.requestedPoints, 25);
  assert.equal((await tx.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId: receipt.id } })).state, "PENDING");
  await tx.$executeRaw`DELETE FROM icc."TerraqoNativeWorklogAuthority" WHERE "actorId"=${user.id}`;
  await tx.terraqoNativeWorklogDecision.deleteMany({ where: { operation: { actorId: user.id } } });
  await tx.terraqoNativeWorklogAccounting.deleteMany({ where: { operation: { actorId: user.id } } });
  await tx.terraqoNativeWorklogOperation.deleteMany({ where: { actorId: user.id } });
  await tx.terraqoBuilderContribution.deleteMany({ where: { userId: user.id } });
  await tx.activityLog.deleteMany({ where: { actorId: user.id } });
  await tx.verificationToken.deleteMany({ where: { identifier } });
  await tx.user.delete({ where: { id: user.id } });
  assert.equal(await tx.user.count({ where: { id: user.id } }), 0);
  assert.equal(await tx.verificationToken.count({ where: { identifier } }), 0);
  assert.deepEqual(await state(), { entries: 0, receipts: 0, decisions: 0, pending: 0, proofs: 0, audits: 0, contributions: 0 });
}
