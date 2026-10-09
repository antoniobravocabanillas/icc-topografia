import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { inspectNativeLegacyWorklogInventoryInTransaction } from "../lib/server/native-worklog-legacy-inventory";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";

// Controlled read ports, no SQL/authorization/concurrency claim. Every write port throws.
function fixture() {
  const stamp = new Date("2026-08-01T00:00:00.000Z"), nativeStamp = new Date("2026-09-01T00:00:00.000Z");
  const entryId = "a".repeat(25), contributionId = "b".repeat(25), operationId = "c".repeat(64);
  const receipt = { actorId: "own", professionalProfileId: "profile", id: operationId };
  const c = { id: contributionId, sourceKey: `worklog:${entryId}`, type: "BETA_PARTICIPATION", status: "IN_REVIEW",
    createdAt: stamp, availableAt: stamp as Date | null, releasedAt: null as Date | null, approvedPoints: 3,
    requestedPoints: 3, detail: "Own ordinary legacy", userId: "own", reviewedAt: null as Date | null };
  const e = { id: entryId, createdAt: stamp, tqPointsAwarded: 3 };
  const account = { id: "account", rewardsFrozenUntil: null as Date | null };
  type Row = { contributionId: string; accountId: string; redemptionId: string | null; type: string; pointsDelta: number; scoreDelta: number;
    idempotencyKey?: string; createdAt?: Date };
  const ledger: Row[] = [];
  let entryMissing = false, overflow = "", owner = true, nativeTarget = false;
  let locks = 0;
  const port = {
    $queryRaw: async (sql: Prisma.Sql) => {
      const text = sql.strings.join("?"); locks++;
      if (text.includes("TerraqoProfessionalProfile")) return owner ? [{ id: "profile" }] : [];
      if (text.includes("TerraqoNativeWorklogAccounting")) return [{ state: "PENDING" }];
      return [];
    },
    terraqoNativeWorklogOperation: { findUnique: async () => receipt, findUniqueOrThrow: async () => receipt,
      findMany: async (args: { take: number }) => {
        assert.equal(args.take, 201);
        return Array.from({ length: overflow === "native" ? 201 : 1 }, () => ({ id: operationId, targetWorklogId: nativeTarget ? entryId : "native", createdAt: nativeStamp }));
      } },
    terraqoBuilderContribution: { findMany: async (args: { take: number; where: { userId: string } }) => {
      assert.equal(args.take, 201); assert.equal(args.where.userId, "own");
      return Array.from({ length: overflow === "contributions" ? 201 : 1 }, () => c);
    } },
    terraqoWorklogEntry: { findMany: async () => entryMissing ? [] : [e] },
    terraqoBuilderAccount: { findUnique: async () => account },
    terraqoBuilderLedger: { findMany: async (args: { take: number }) => {
      assert.equal(args.take, 201); return overflow === "ledger" ? Array.from({ length: 201 }, () => ledger[0]) : ledger;
    } },
  };
  // No write methods exist on the controlled ORM: any accidental mutation fails this test.
  const run = () => inspectNativeLegacyWorklogInventoryInTransaction(port as unknown as Prisma.TransactionClient, operationId);
  return { run, c, e, account, ledger, locks: () => locks, missing: () => { entryMissing = true; },
    overflow: (kind: string) => { overflow = kind; }, ownerMissing: () => { owner = false; }, native: () => { nativeTarget = true; }, contributionId, operationId, nativeStamp };
}
async function main() {
  const base = fixture(), initial = JSON.stringify(base.c);
  const report = await base.run(); assert.equal(report.due, 1); assert.equal(report.completionAuthorized, false);
  assert.ok(Object.isFrozen(report)); assert.ok(base.locks() >= 5); assert.equal(JSON.stringify(base.c), initial);
  assert.ok(!JSON.stringify(report).includes(base.contributionId));
  for (const [field, prepare] of [
    ["future", (f: ReturnType<typeof fixture>) => { f.c.availableAt = new Date("2099-01-01T00:00:00.000Z"); }],
    ["frozen", (f: ReturnType<typeof fixture>) => { f.account.rewardsFrozenUntil = new Date("2099-01-01T00:00:00.000Z"); }],
    ["missingReference", (f: ReturnType<typeof fixture>) => { f.missing(); }],
    ["unsupported", (f: ReturnType<typeof fixture>) => { f.c.sourceKey = "worklog-validation:own"; }],
    ["native", (f: ReturnType<typeof fixture>) => { f.native(); }],
    ["rejected", (f: ReturnType<typeof fixture>) => { f.c.status = "REJECTED"; }],
    ["unfunded", (f: ReturnType<typeof fixture>) => { f.c.availableAt = null; }],
    ["ambiguous", (f: ReturnType<typeof fixture>) => { f.e.tqPointsAwarded = 2; }],
  ] as const) {
    const f = fixture(); prepare(f); const r = await f.run(); assert.equal(r[field], 1); assert.equal(r.due, 0); assert.equal(r.completionAuthorized, false);
  }
  const credit = fixture(); credit.ledger.push({ contributionId: credit.contributionId, accountId: "account", redemptionId: null,
    type: "CREDIT", pointsDelta: 3, scoreDelta: 3 }); credit.c.releasedAt = new Date();
  assert.equal((await credit.run()).historical, 1);
  credit.ledger[0].type = "REVERSAL"; assert.equal((await credit.run()).ambiguous, 1);
  const first = fixture(); first.c.type = "FIRST_WORKLOG"; first.c.sourceKey = "first-worklog:own";
  first.c.createdAt = first.nativeStamp; first.c.requestedPoints = 25; first.c.approvedPoints = 0;
  first.c.detail = `native-first-worklog-v1:${first.operationId}`;
  const firstReport = await first.run(); assert.equal(firstReport.nativeFirst, 1); assert.equal(firstReport.unsupported, 0);
  assert.ok(!JSON.stringify(firstReport).includes(first.operationId));
  first.c.detail = "native-first-worklog-v1:malformed"; assert.equal((await first.run()).unsupported, 1);
  first.c.detail = `native-first-worklog-v1:${first.operationId}`; first.c.createdAt = new Date("2026-08-01T00:00:00.000Z");
  assert.equal((await first.run()).unsupported, 1);
  const oldFirst = fixture(); oldFirst.c.type = "FIRST_WORKLOG"; oldFirst.c.sourceKey = "first-worklog:own";
  oldFirst.c.requestedPoints = 25; oldFirst.c.approvedPoints = 25; oldFirst.c.status = "VALIDATED";
  oldFirst.c.availableAt = null; oldFirst.c.reviewedAt = new Date("2026-08-01T00:00:01.000Z");
  oldFirst.ledger.push({ contributionId: oldFirst.contributionId, accountId: "account", redemptionId: null,
    type: "CREDIT", pointsDelta: 25, scoreDelta: 25, idempotencyKey: `contribution:${oldFirst.contributionId}:25`,
    createdAt: new Date("2026-08-01T00:00:00.999Z") });
  const oldBefore = JSON.stringify({ c: oldFirst.c, ledger: oldFirst.ledger });
  const oldReport = await oldFirst.run(); assert.equal(oldReport.historical, 1); assert.equal(oldReport.unsupported, 0);
  assert.equal(oldReport.completionAuthorized, false); assert.equal(oldReport.nativeFirst, 0);
  assert.equal(JSON.stringify({ c: oldFirst.c, ledger: oldFirst.ledger }), oldBefore);
  oldFirst.ledger[0].type = "REVERSAL"; assert.equal((await oldFirst.run()).unsupported, 1);
  for (const kind of ["native", "contributions", "ledger"]) {
    const f = fixture(); f.overflow(kind);
    await assert.rejects(f.run, (e: unknown) => e instanceof NativeWorklogOperationError && e.status === 503);
  }
  const missing = fixture(); missing.ownerMissing(); await assert.rejects(missing.run);
  console.log("PASS legacy inventory controlled reads/caps/classification; no SQL/auth/completion claim.");
}
main().catch(() => { console.error("Legacy inventory controlled test failed"); process.exitCode = 1; });
