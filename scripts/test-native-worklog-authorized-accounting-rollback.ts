import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";
import { NativeWorklogBudget } from "../lib/server/native-worklog-budget";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { parseNativeWorklogPayload } from "../lib/server/native-worklog-payload";
import { nativeWorklogContentKey } from "../lib/server/native-worklog-content-key";
import { decideNativeDeclaredWorklog } from "../lib/server/native-worklog-base-decision";
import { applyAuthorizedNativeAccountingInTransaction } from "../lib/server/native-worklog-authorized-accounting";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";

/** Only inside the pinned checker's outer DDL rollback, never standalone. */
export async function nativeAuthorizedAccountingRollback(tx: Prisma.TransactionClient, workspaceId: string) {
  for (const tq of [1]) {
    const marker = randomUUID(), id = createHash("sha256").update(marker).digest("hex");
    const user = await tx.user.create({ data: { name: `ICC authorized-accounting rollback ${marker}`,
      email: `native-authorized-accounting-${marker}@example.invalid`, role: "CUSTOMER" } });
    const profile = await tx.terraqoProfessionalProfile.create({ data: { userId: user.id, visibility: "PRIVATE", liveCvEnabled: false } });
    const parsed = await parseNativeWorklogPayload(new Request("https://example.invalid/own", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ operationKey: "a".repeat(32),
        title: "ICC own release", summary: "Own temporary SQL release evidence only.", outcome: "", type: "FIELD_UPDATE", projectId: "", projectVersion: "" }) }));
    const d = decideNativeDeclaredWorklog(parsed, "2026-09-01T12:00:00.000Z", {
      priorDuplicates: 0, rewardedInDay: tq ? 0 : 3, trustedInWindow: 0 });
    const stamp = new Date(d.createdAt), contentKey = nativeWorklogContentKey(parsed.payload);
    const entry = await tx.terraqoWorklogEntry.create({ data: { authorId: user.id, professionalProfileId: profile.id,
      workspaceId, title: parsed.payload.title, summary: parsed.payload.summary, visibility: "PRIVATE",
      contentFingerprint: contentKey, createdAt: stamp, updatedAt: stamp } });
    await tx.terraqoNativeWorklogOperation.create({ data: { id, actorId: user.id, workspaceId, professionalProfileId: profile.id,
      operationKey: parsed.payload.operationKey, fingerprint: d.fingerprint, targetWorklogId: entry.id,
      worklogId: entry.id, resultVersion: stamp, createdAt: stamp } });
    await tx.terraqoNativeWorklogAccounting.create({ data: { operationId: id } });
    await tx.terraqoNativeWorklogDecision.create({ data: { operationId: id, contentKey,
      policyVersion: d.policyVersion, fingerprint: d.fingerprint, priorDuplicates: d.priorDuplicates,
      rewardedInDay: d.rewardedInDay, trustedInWindow: d.trustedInWindow, tqPoints: d.tqPoints,
      trustScore: d.trustScore, qualityScore: d.qualityScore, moderationStatus: d.moderationStatus, riskScore: d.riskScore,
      createdAt: stamp, dayStart: new Date(d.dayStart), dayEndExclusive: new Date(d.dayEndExclusive),
      trustStartInclusive: new Date(d.trustStartInclusive), trustEndInclusive: new Date(d.trustEndInclusive), availableAt: new Date(d.availableAt) } });
    const snapshot = await tx.terraqoNativeWorklogDecision.findUniqueOrThrow({ where: { operationId: id } });
    const first = await tx.terraqoBuilderContribution.create({ data: { userId: user.id, type: "FIRST_WORKLOG",
      sourceKey: `first-worklog:${user.id}`, title: "Own manual FIRST reserve", detail: `native-first-worklog-v1:${id}`,
      requestedPoints: 25, approvedPoints: 0, status: "IN_REVIEW", createdAt: stamp } });
    const oldStamp = new Date("2026-08-01T12:00:00.000Z");
    const oldEntry = await tx.terraqoWorklogEntry.create({ data: { authorId: user.id, professionalProfileId: profile.id,
      workspaceId, title: "Own manual legacy earned", summary: "Own legacy accounting state only.",
      visibility: "PRIVATE", createdAt: oldStamp, tqPointsAwarded: 3 } });
    const old = await tx.terraqoBuilderContribution.create({ data: { userId: user.id, workspaceId, type: "BETA_PARTICIPATION",
      sourceKey: `worklog:${oldEntry.id}`, title: "Own manual legacy pending", detail: "Manual earned state",
      approvedPoints: 3, createdAt: oldStamp, availableAt: new Date("2026-08-08T12:00:00.000Z") } });
    await tx.terraqoBuilderContribution.create({ data: { userId: user.id, type: "BUG_REPORT", title: "Own future retained",
      detail: "Manual future retained", approvedPoints: 2, availableAt: new Date("2099-01-01T00:00:00.000Z") } });
    const account = await tx.terraqoBuilderAccount.create({ data: { userId: user.id, pendingPoints: 5 } });
    const member = await tx.terraqoWorkspaceMember.create({ data: { userId: user.id, workspaceId, role: "PROFESSIONAL", active: true } });
    const token: WorkspacePortalToken = { sub: user.id, workspaceId, workspaceSlug: "icc-topografia", role: "PROFESSIONAL",
      iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600, jti: randomUUID() };
    const identifier = `portal-session:${workspaceId}:${user.id}`, grantHash = createHash("sha256").update(token.jti!).digest("hex");
    await tx.verificationToken.create({ data: { identifier, token: grantHash, expires: new Date(Date.now()+3600000) } });
    const run = (t = token, db = tx, budget = new NativeWorklogBudget()) => applyAuthorizedNativeAccountingInTransaction(db, t, id, budget, [old.id]);
    async function isolated(action: () => Promise<void>) {
      await tx.$executeRawUnsafe("SAVEPOINT own_authorized_case");
      try { await action(); } finally {
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_authorized_case");
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_authorized_case");
      }
      assert.deepEqual(await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } }), account);
      assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 0);
      assert.equal(await tx.terraqoBuilderContribution.count({ where: { sourceKey: `worklog:${entry.id}` } }), 0);
      assert.equal((await tx.terraqoBuilderContribution.findUniqueOrThrow({ where: { id: first.id } })).approvedPoints, 0);
    }
    const rejects = (fn: () => Promise<unknown>, status: number) => assert.rejects(fn, e => e instanceof NativeWorklogOperationError && e.status === status);
    await isolated(async () => { await rejects(() => run({ ...token, exp: 0 }), 401); });
    await isolated(async () => { await rejects(() => run({ ...token, jti: undefined }), 401); });
    await isolated(async () => {
      await rejects(() => applyAuthorizedNativeAccountingInTransaction(tx, token, "0".repeat(64), new NativeWorklogBudget()), 404);
      let time = 0; const exhausted = new NativeWorklogBudget(() => time); time = 50000;
      await rejects(() => run(token, tx, exhausted), 503);
    });
    await isolated(async () => {
      await tx.terraqoWorkspaceMember.update({ where: { id: member.id }, data: { role: "CLIENT" } });
      await rejects(() => run(), 403);
    });
    await isolated(async () => {
      await tx.verificationToken.delete({ where: { identifier_token: { identifier, token: grantHash } } });
      await rejects(() => run(), 401);
    });
    await isolated(async () => {
      const result = await run(); assert.equal(result.outcome, "pending");
      const row = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } });
      assert.equal(row.availablePoints, 29); assert.equal(row.pendingPoints, 2); assert.equal(row.trustScore, 1);
      assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 3);
      assert.deepEqual(await run(), { outcome: "pending", base: "released-history", first: "historical", release: "historical", legacy: ["historical"] });
      assert.deepEqual(await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } }), row);
    });
    await isolated(async () => {
      const expiring = { ...token };
      const proxy = new Proxy(tx, { get(target, key) {
        if (key !== "terraqoBuilderLedger") return Reflect.get(target, key);
        return new Proxy(target.terraqoBuilderLedger, { get(model, method) {
          if (method !== "create") return Reflect.get(model, method);
          return async (args: Prisma.TerraqoBuilderLedgerCreateArgs) => {
            const result = await model.create(args);
            if (await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }) === 3) {
              assert.equal((await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } })).availablePoints, 29);
              expiring.exp = 0; // Controlled final expiry AFTER real SQL phases, never production token mutation.
            }
            return result;
          };
        } });
      } });
      await rejects(() => run(expiring, proxy), 401);
    });
    assert.deepEqual(await tx.terraqoNativeWorklogDecision.findUniqueOrThrow({ where: { operationId: id } }), snapshot);
    assert.equal((await tx.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId: id } })).state, "PENDING");
    await tx.verificationToken.delete({ where: { identifier_token: { identifier, token: grantHash } } });
    await tx.terraqoBuilderLedger.deleteMany({ where: { accountId: account.id } });
    await tx.terraqoBuilderContribution.deleteMany({ where: { userId: user.id } });
    await tx.terraqoBuilderAccount.delete({ where: { id: account.id } });
    await tx.terraqoNativeWorklogDecision.delete({ where: { operationId: id } });
    await tx.terraqoNativeWorklogAccounting.delete({ where: { operationId: id } });
    await tx.terraqoNativeWorklogOperation.delete({ where: { id } });
    await tx.user.delete({ where: { id: user.id } });
    assert.equal(await tx.user.count({ where: { id: user.id } }), 0);
    assert.equal(await tx.verificationToken.count({ where: { identifier } }), 0);
  }
}
