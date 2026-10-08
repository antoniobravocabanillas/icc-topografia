import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { assertLegacyWorklogs, NativeWorklogLegacyGuardError } from "../lib/server/native-worklog-legacy-guard";
import { syncWorklogReputation, moderateWorklogReputation, consumeBuilderValidationCredit,
  awardAutomatedBuilderContribution, reviewBuilderContribution, releasePendingBuilderPoints } from "../lib/terraqo/builders";
import { requestWorklogValidation } from "../lib/terraqo/field-verification";
import { setWorklogContinuity } from "../lib/terraqo/worklog";
import { uploadWorklogEvidence } from "../lib/server/worklog-evidence";

type Database = Pick<Prisma.TransactionClient, "$queryRaw">;
const nativeId = "cnative0000000000000000000";
function port(mode: "absent" | "partial" | "native" | "legacy" | "mixed" | "fault"): Database {
  return { $queryRaw: (async (query: Prisma.Sql) => {
    if (mode === "fault") throw new Error("CONTROLLED_DATABASE_FAULT");
    if (query.sql.includes("to_regclass")) return [{ receipt: mode === "absent" ? null : "receipt",
      accounting: ["absent", "partial"].includes(mode) ? null : "accounting" }];
    if (query.sql.includes('"TerraqoProfessionalProfile"')) return [{ id: "ownprofile" }];
    if (query.sql.includes('"TerraqoWorklogValidation"')) return [{ worklogId: nativeId }];
    return (mode === "native" || (mode === "mixed" && query.sql.includes('"actorId"'))) ? [{ id: "ownreceipt" }] : [];
  }) as Database["$queryRaw"] };
}
const blocked = (run: () => Promise<unknown>, status = 409) => assert.rejects(run,
  (error: unknown) => error instanceof NativeWorklogLegacyGuardError && error.status === status);

async function main() {
  await assertLegacyWorklogs(port("absent"), [nativeId]);
  await assertLegacyWorklogs(port("legacy"), [nativeId]);
  await blocked(() => assertLegacyWorklogs(port("partial"), [nativeId]), 503);
  await blocked(() => assertLegacyWorklogs(port("native"), [nativeId]));
  await assert.rejects(() => assertLegacyWorklogs(port("fault"), [nativeId]), /CONTROLLED_DATABASE_FAULT/);
  const originalRaw = prisma.$queryRaw, originalTx = prisma.$transaction;
  const originalFind = prisma.terraqoBuilderContribution.findUnique, originalMany = prisma.terraqoBuilderContribution.findMany;
  const restored: (() => void)[] = [];
  let forbiddenOrm = 0;
  let bodyReads = 0;
  try {
    // Fail closed if a guard regresses: no real ORM read/write may reach a database.
    for (const delegate of [prisma.terraqoWorklogEntry, prisma.terraqoWorklogValidation, prisma.terraqoWorklogMedia,
      prisma.terraqoBuilderAccount, prisma.terraqoBuilderContribution, prisma.terraqoBuilderLedger,
      prisma.terraqoWorkspaceMember, prisma.terraqoWebAuthnChallenge]) {
      const methods = delegate as unknown as Record<string, unknown>;
      for (const name of ["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count",
        "create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]) {
        const original = methods[name];
        methods[name] = () => { forbiddenOrm++; throw new Error("ORM_MUST_NOT_RUN_IN_GUARD_TEST"); };
        restored.push(() => { methods[name] = original; });
      }
    }
    prisma.$queryRaw = port("native").$queryRaw;
    prisma.$transaction = (async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => callback(prisma)) as typeof prisma.$transaction;
    await blocked(() => syncWorklogReputation(nativeId));
    for (const status of ["DECLARED", "OBSERVED", "REJECTED"] as const)
      await blocked(() => moderateWorklogReputation({ worklogId: nativeId, status }));
    await blocked(() => requestWorklogValidation({ userId: "ownactor", workspaceId: "ownworkspace", worklogId: nativeId, validatorUserId: "ownvalidator" }));
    await blocked(() => setWorklogContinuity({ userId: "ownactor", worklogId: nativeId, previousWorklogId: null }));
    await blocked(() => setWorklogContinuity({ userId: "ownactor", worklogId: nativeId, previousWorklogId: "clegacy0000000000000000000" }));
    await blocked(() => consumeBuilderValidationCredit("ownactor", "ownvalidation"));
    const request = new Request("https://example.invalid/own-test", { method: "POST" });
    request.formData = async () => { bodyReads++; throw new Error("BODY_MUST_NOT_BE_READ"); };
    const denied = await uploadWorklogEvidence(request, "ownactor", nativeId);
    assert.equal(denied.status, 409); assert.equal(bodyReads, 0);
    for (const source of [
      { type: "FIRST_WORKLOG" as const, sourceKey: "first-worklog:ownactor" },
      { type: "EXPERIENCE_VALIDATION" as const, sourceKey: "worklog-validation:ownvalidation" },
      { type: "BETA_PARTICIPATION" as const, sourceKey: `worklog:${nativeId}` },
    ]) {
      await blocked(() => awardAutomatedBuilderContribution({ ...source, userId: "ownactor", title: "Own", detail: "Own" }));
      prisma.terraqoBuilderContribution.findUnique = (async () => ({ id: "owncontribution", userId: "ownactor", ...source })) as unknown as typeof originalFind;
      await blocked(() => reviewBuilderContribution({ contributionId: "owncontribution", reviewerId: "system", status: "VALIDATED", points: 25 }));
      prisma.terraqoBuilderContribution.findMany = (async () => [{ id: "owncontribution", userId: "ownactor", ...source,
        approvedPoints: 25, title: "Own", ledgerEntries: [] }]) as unknown as typeof originalMany;
      await releasePendingBuilderPoints("ownactor");
    }
    // A legacy target remains unbound, but its owner has durable native history.
    prisma.$queryRaw = port("mixed").$queryRaw;
    const identity = (async (args: { select?: { authorId?: boolean } }) => {
      assert.equal(args.select?.authorId, true);
      return { authorId: "ownactor" };
    });
    prisma.terraqoWorklogEntry.findUnique = identity as unknown as typeof prisma.terraqoWorklogEntry.findUnique;
    prisma.terraqoWorklogEntry.findUniqueOrThrow = identity as unknown as typeof prisma.terraqoWorklogEntry.findUniqueOrThrow;
    await blocked(() => syncWorklogReputation("clegacy0000000000000000000"));
    for (const status of ["DECLARED", "OBSERVED", "REJECTED"] as const)
      await blocked(() => moderateWorklogReputation({ worklogId: "clegacy0000000000000000000", status }));
    const pending = { id: "ownpending", userId: "ownactor", type: "BETA_PARTICIPATION", sourceKey: "worklog:clegacy0000000000000000000",
      approvedPoints: 1, title: "Own", ledgerEntries: [] };
    prisma.terraqoBuilderContribution.findMany = (async () => [pending]) as unknown as typeof originalMany;
    await releasePendingBuilderPoints("ownactor");
    prisma.$queryRaw = port("partial").$queryRaw;
    await blocked(() => releasePendingBuilderPoints("ownactor"), 503);
    prisma.$queryRaw = port("fault").$queryRaw;
    await assert.rejects(() => releasePendingBuilderPoints("ownactor"), /CONTROLLED_DATABASE_FAULT/);
    prisma.$queryRaw = port("mixed").$queryRaw;
    let unrelatedClaimed = 0;
    prisma.terraqoBuilderContribution.findMany = (async () => [pending, { ...pending, id: "ownbug", type: "BUG_REPORT", sourceKey: "own-bug" }]) as unknown as typeof originalMany;
    prisma.terraqoBuilderContribution.updateMany = (async (args: { where: { id: string } }) => {
      assert.equal(args.where.id, "ownbug"); unrelatedClaimed++; return { count: 0 };
    }) as unknown as typeof prisma.terraqoBuilderContribution.updateMany;
    await releasePendingBuilderPoints("ownactor");
    assert.equal(unrelatedClaimed, 1);
    // Context/count/delta regression: production sync must read only inside the owner-locked transaction.
    let inTransaction = false, ownerLocked = false, awarded = 0, pendingDelta = 0, contextReads = 0;
    const legacyRaw = port("legacy").$queryRaw;
    prisma.$queryRaw = (async (query: Prisma.Sql) => {
      if (query.sql.includes('"TerraqoProfessionalProfile"')) {
        assert.equal(inTransaction, true); ownerLocked = true;
      }
      return legacyRaw(query);
    }) as typeof prisma.$queryRaw;
    prisma.$transaction = (async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      inTransaction = true; ownerLocked = false;
      try { return await callback(prisma); } finally { inTransaction = false; }
    }) as typeof prisma.$transaction;
    prisma.terraqoWorklogEntry.findUnique = (async (args: { select?: { authorId?: boolean } }) => {
      assert.equal(inTransaction, true);
      if (args.select?.authorId) return { authorId: "ownactor" };
      assert.equal(ownerLocked, true); contextReads++;
      return { id: nativeId, authorId: "ownactor", workspaceId: "ownworkspace", deletedAt: null,
        media: [], evidenceUrls: [], validations: [], evidenceStatus: "PENDING", projectId: null,
        outcome: "", summary: "Own controlled summary", title: "Own title", createdAt: new Date("2026-10-08T05:00:00.000Z"),
        contentFingerprint: "own-fingerprint", visibility: "PRIVATE", tqPointsAwarded: awarded, trustScoreAwarded: awarded };
    }) as unknown as typeof prisma.terraqoWorklogEntry.findUnique;
    prisma.terraqoWorklogEntry.count = (async () => {
      assert.equal(inTransaction && ownerLocked, true); return 0;
    }) as typeof prisma.terraqoWorklogEntry.count;
    prisma.terraqoBuilderAccount.upsert = (async (args: { update: { pendingPoints?: { increment: number } }; create: { pendingPoints: number } }) => {
      assert.equal(inTransaction && ownerLocked, true);
      pendingDelta += args.update.pendingPoints?.increment ?? 0; return { id: "ownaccount" };
    }) as unknown as typeof prisma.terraqoBuilderAccount.upsert;
    prisma.terraqoBuilderContribution.upsert = (async () => {
      assert.equal(inTransaction && ownerLocked, true); return { id: "owncontribution" };
    }) as unknown as typeof prisma.terraqoBuilderContribution.upsert;
    prisma.terraqoWorklogEntry.update = (async (args: { data: { tqPointsAwarded: number } }) => {
      assert.equal(inTransaction && ownerLocked, true); awarded = args.data.tqPointsAwarded; return {};
    }) as unknown as typeof prisma.terraqoWorklogEntry.update;
    await syncWorklogReputation(nativeId); await syncWorklogReputation(nativeId);
    assert.equal(contextReads, 2); assert.equal(pendingDelta, 1);
    assert.equal(forbiddenOrm, 0);
  } finally {
    prisma.$queryRaw = originalRaw; prisma.$transaction = originalTx;
    prisma.terraqoBuilderContribution.findUnique = originalFind; prisma.terraqoBuilderContribution.findMany = originalMany;
    restored.forEach(restore => restore());
    await prisma.$disconnect();
  }
  console.log("PASS native legacy guards: absent/partial/fault catalog, reputation/moderation/validation/credit/continuity/source review/release, evidence before body; controlled ports only, no SQL/points.");
}
main().catch(() => { console.error("Native legacy guard test failed; private diagnostics suppressed."); process.exitCode = 1; });
