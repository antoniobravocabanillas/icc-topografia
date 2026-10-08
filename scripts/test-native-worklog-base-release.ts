import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { releaseNativeWorklogBaseInTransaction } from "../lib/server/native-worklog-base-release";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";

// Controlled ports only. This is not SQL, a concurrent transaction or authorization proof.
function fixture(tq = 1) {
  const createdAt = new Date(Date.now() - 8 * 86400000), availableAt = new Date(createdAt.getTime() + 7 * 86400000);
  const id = "a".repeat(64), fingerprint = "b".repeat(64), contentKey = "c".repeat(64);
  const receipt = { id, actorId: "own", professionalProfileId: "profile", workspaceId: "workspace",
    worklogId: "entry" as string | null, targetWorklogId: "entry", fingerprint, createdAt };
  const d = { operationId: id, fingerprint, contentKey, createdAt, availableAt,
    policyVersion: "native-declared-lima-v1", tqPoints: tq, trustScore: 1, qualityScore: 40, moderationStatus: "DECLARED", riskScore: 0 };
  const entry = { id: "entry", authorId: "own", professionalProfileId: "profile", workspaceId: "workspace",
    contentFingerprint: contentKey, createdAt, deletedAt: null as Date | null,
    tqPointsAwarded: tq, trustScoreAwarded: 1, qualityScore: 40, moderationStatus: "DECLARED" };
  const c = { id: "contribution", userId: "own", workspaceId: "workspace", type: "BETA_PARTICIPATION",
    status: "IN_REVIEW", requestedPoints: tq, approvedPoints: tq, riskScore: 0, createdAt, availableAt, releasedAt: null as Date | null };
  const account = { id: "account", pendingPoints: tq + 2, availablePoints: 25, lifetimeEarned: 25,
    contributionScore: 25, trustScore: 4, rewardsFrozenUntil: null as Date | null };
  type Credit = { accountId: string; contributionId: string; redemptionId: null; type: string;
    pointsDelta: number; scoreDelta: number; balanceAfter: number; idempotencyKey: string };
  const credits: Credit[] = [];
  let writes = 0, ledgerFault = false, state = "PENDING", retainedOverflow = false;
  const port = {
    $queryRaw: async (sql: Prisma.Sql) => {
      const text = sql.strings.join("?");
      if (text.includes("TerraqoProfessionalProfile")) return [{ id: "profile" }];
      if (text.includes("TerraqoNativeWorklogAccounting")) return [{ state }];
      return [];
    },
    terraqoNativeWorklogOperation: { findUnique: async () => receipt },
    terraqoNativeWorklogDecision: { findUnique: async () => d, findUniqueOrThrow: async () => d },
    terraqoWorklogEntry: { findUnique: async () => entry },
    terraqoBuilderAccount: { findUnique: async () => account, update: async () => {
      writes++; account.pendingPoints -= tq; account.availablePoints += tq;
      account.lifetimeEarned += tq; account.contributionScore += tq; return account;
    } },
    terraqoBuilderContribution: { findUnique: async () => c, findMany: async (args: { take: number; include: { ledgerEntries: { take: number } } }) => {
      assert.equal(args.take, 201); assert.equal(args.include.ledgerEntries.take, 201);
      if (retainedOverflow) return Array.from({ length: 201 }, () => ({ ...c, ledgerEntries: [] }));
      return [{ ...c, ledgerEntries: credits }, { approvedPoints: 2, ledgerEntries: [] }];
    }, update: async () => { writes++; c.releasedAt = new Date(); return c; } },
    terraqoBuilderLedger: { findMany: async (args: { take: number }) => { assert.equal(args.take, 2); return credits; },
      create: async ({ data }: { data: Omit<Credit, "redemptionId"> }) => {
        assert.equal(account.pendingPoints, 2); assert.equal(account.availablePoints, 26);
        if (ledgerFault) throw new Error("CONTROLLED_LEDGER_FAULT");
        writes++; credits.push({ ...data, redemptionId: null });
      } },
  };
  const run = () => releaseNativeWorklogBaseInTransaction(port as unknown as Prisma.TransactionClient, id);
  return { run, receipt, d, entry, c, account, credits, writes: () => writes,
    fault: () => { ledgerFault = true; }, state: (s: string) => { state = s; }, overflow: () => { retainedOverflow = true; } };
}
const reject = (f: ReturnType<typeof fixture>) => assert.rejects(f.run,
  (e: unknown) => e instanceof NativeWorklogOperationError && e.status === 503);

async function main() {
  const f = fixture();
  assert.equal(await f.run(), "released"); assert.equal(await f.run(), "historical");
  assert.equal(f.credits.length, 1); assert.equal(f.account.pendingPoints, 2);
  assert.equal(f.account.availablePoints, 26); assert.equal(f.account.lifetimeEarned, 26);
  assert.equal(f.account.contributionScore, 26); assert.equal(f.account.trustScore, 4);
  assert.equal(f.writes(), 3); assert.equal(f.credits[0].idempotencyKey, `native-worklog-base:${"a".repeat(64)}:1`);
  const zero = fixture(0); assert.equal(await zero.run(), "released"); assert.equal(await zero.run(), "historical");
  assert.equal(zero.credits.length, 0); assert.equal(zero.writes(), 1); assert.equal(zero.account.pendingPoints, 2);
  for (const prepare of [
    (x: ReturnType<typeof fixture>) => { x.account.rewardsFrozenUntil = new Date(Date.now() + 86400000); },
    (x: ReturnType<typeof fixture>) => { x.receipt.worklogId = null; },
    (x: ReturnType<typeof fixture>) => { x.entry.deletedAt = new Date(); },
    (x: ReturnType<typeof fixture>) => { x.state("APPLIED"); },
    (x: ReturnType<typeof fixture>) => { x.d.availableAt = new Date(Date.now() + 86400000); x.d.createdAt = new Date(x.d.availableAt.getTime() - 7 * 86400000); x.receipt.createdAt = x.d.createdAt; x.entry.createdAt = x.d.createdAt; x.c.createdAt = x.d.createdAt; x.c.availableAt = x.d.availableAt; },
  ]) { const x = fixture(); prepare(x); assert.equal(await x.run(), "deferred"); assert.equal(x.writes(), 0); }
  for (const prepare of [
    (x: ReturnType<typeof fixture>) => { x.account.pendingPoints = 2; },
    (x: ReturnType<typeof fixture>) => { x.account.availablePoints = 2147483647; },
    (x: ReturnType<typeof fixture>) => { x.c.releasedAt = new Date(); },
    (x: ReturnType<typeof fixture>) => { x.entry.trustScoreAwarded = 0; },
    (x: ReturnType<typeof fixture>) => { x.c.workspaceId = "foreign"; },
    (x: ReturnType<typeof fixture>) => { x.overflow(); },
  ]) { const x = fixture(); prepare(x); await reject(x); assert.equal(x.writes(), 0); }
  // Caller transaction rollback remains REQUIRED: ports prove write ordering, not SQL rollback.
  const fault = fixture(); fault.fault(); await assert.rejects(fault.run);
  assert.equal(fault.account.availablePoints, 26); assert.equal(fault.c.releasedAt, null); assert.equal(fault.credits.length, 0);
  const ambiguous = fixture(); await ambiguous.run(); ambiguous.c.releasedAt = null;
  await reject(ambiguous); assert.equal(ambiguous.credits.length, 1); assert.equal(ambiguous.writes(), 3);
  console.log("PASS native base release controlled ports; no SQL/auth/concurrency claim.");
}
main().catch(() => { console.error("Native base release controlled test failed"); process.exitCode = 1; });
