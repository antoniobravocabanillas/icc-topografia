import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { applyNativeFirstWorklogInTransaction } from "../lib/server/native-worklog-first-award";

const op = "a".repeat(64);
function fixture() {
  const date = new Date("2026-09-01T12:00:00.000Z");
  const identity = { id: op, actorId: "own", professionalProfileId: "profile", createdAt: date };
  const account = { id: "account", userId: "own", pendingPoints: 2, availablePoints: 3,
    lifetimeEarned: 3, contributionScore: 3, trustScore: 4, rewardsFrozenUntil: null as Date | null };
  const contribution = { id: "first", userId: "own", type: "FIRST_WORKLOG", requestedPoints: 25,
    approvedPoints: 0, status: "IN_REVIEW", detail: `native-first-worklog-v1:${op}`,
    createdAt: date, releasedAt: null as Date | null, availableAt: null,
    ledgerEntries: [] as Array<Record<string, unknown>> };
  let locked = false;
  let writes = 0;
  let retained: Array<Record<string, unknown>> = [{ approvedPoints: 2, ledgerEntries: [] }];
  const tx = {
    $queryRaw: async (q: Prisma.Sql) => {
      const sql = q.strings.join("");
      if (sql.includes("TerraqoBuilderAccount")) locked = true;
      if (sql.includes("TerraqoProfessionalProfile")) return [{ id: "profile" }];
      if (sql.includes("TerraqoNativeWorklogAccounting")) return [{ state: "PENDING" }];
      return [];
    },
    terraqoNativeWorklogOperation: { findUnique: async () => identity },
    terraqoBuilderAccount: {
      findUnique: async () => ({ ...account }),
      findUniqueOrThrow: async () => { assert(locked); return { ...account }; },
      upsert: async () => ({ ...account }),
      update: async () => { assert(locked); writes++; account.availablePoints += 25;
        account.lifetimeEarned += 25; account.contributionScore += 25; return { ...account }; }
    },
    terraqoBuilderContribution: {
      findUnique: async (args: { include: { ledgerEntries: { take: number } } }) => {
        assert.equal(args.include.ledgerEntries.take, 2); return contribution;
      },
      findMany: async (args: { take: number; include: { ledgerEntries: { take: number } } }) => {
        assert(locked); assert.equal(args.take, 201); assert.equal(args.include.ledgerEntries.take, 201); return retained;
      },
      update: async () => { writes++; contribution.approvedPoints = 25; contribution.status = "VALIDATED";
        contribution.releasedAt = date; }
    },
    terraqoBuilderLedger: { create: async () => { writes++; contribution.ledgerEntries.push({
      accountId: account.id, redemptionId: null, type: "CREDIT", pointsDelta: 25, scoreDelta: 25 }); } }
  } as unknown as Prisma.TransactionClient;
  return { tx, account, contribution, writes: () => writes, setRetained: (rows: typeof retained) => { retained = rows; } };
}
const run = (f: ReturnType<typeof fixture>) => applyNativeFirstWorklogInTransaction(f.tx, op);
async function main() {
const f = fixture();
assert.equal(await run(f), "credited");
assert.equal(await run(f), "historical");
assert.deepEqual([f.account.pendingPoints, f.account.availablePoints, f.account.lifetimeEarned,
  f.account.contributionScore, f.account.trustScore, f.writes()], [2, 28, 28, 28, 4, 3]);
for (const field of ["availablePoints", "lifetimeEarned", "contributionScore"] as const) {
  const e = fixture(); e.account[field] = 2147483647;
  await assert.rejects(run(e), (error: unknown) => (error as { status: number }).status === 503);
  assert.equal(e.writes(), 0);
}
const frozen = fixture(); frozen.account.rewardsFrozenUntil = new Date("2099-01-01T00:00:00.000Z");
assert.equal(await run(frozen), "deferred"); assert.equal(frozen.writes(), 0);
const legacy = fixture(); legacy.contribution.detail = "Own unfinished legacy review";
legacy.contribution.status = "VALIDATED";
const legacyBefore = JSON.stringify({ account: legacy.account, contribution: legacy.contribution });
assert.equal(await run(legacy), "deferred"); assert.equal(legacy.writes(), 0);
assert.equal(JSON.stringify({ account: legacy.account, contribution: legacy.contribution }), legacyBefore);
const floor = fixture(); floor.account.pendingPoints = 1;
await assert.rejects(run(floor)); assert.equal(floor.writes(), 0);
for (const rows of [
  Array.from({ length: 201 }, () => ({ approvedPoints: 0, ledgerEntries: [] })),
  [{ approvedPoints: 201, ledgerEntries: Array.from({ length: 201 }, () => ({
    accountId: "account", redemptionId: null, type: "CREDIT", pointsDelta: 1, scoreDelta: 1 })) }],
  [{ approvedPoints: 2, ledgerEntries: [{ accountId: "foreign", redemptionId: null,
    type: "CREDIT", pointsDelta: 1, scoreDelta: 1 }] }]
]) {
  const e = fixture(); e.setRetained(rows); await assert.rejects(run(e)); assert.equal(e.writes(), 0);
}
const partial = fixture(); partial.contribution.approvedPoints = 25;
partial.contribution.ledgerEntries.push({ accountId: "account", redemptionId: null,
  type: "CREDIT", pointsDelta: 25, scoreDelta: 25 });
await assert.rejects(run(partial)); assert.equal(partial.writes(), 0);
console.log("PASS FIRST controlled account lock/floor/overflow/frozen/history; no SQL or concurrency claim.");

}
main().catch(() => { console.error("FIRST controlled account test failed"); process.exitCode = 1; });
