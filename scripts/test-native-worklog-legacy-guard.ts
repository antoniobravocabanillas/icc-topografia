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
function port(mode: "absent" | "partial" | "native" | "legacy" | "fault"): Database {
  return { $queryRaw: (async (query: Prisma.Sql) => {
    if (mode === "fault") throw new Error("CONTROLLED_DATABASE_FAULT");
    if (query.sql.includes("to_regclass")) return [{ receipt: mode === "absent" ? null : "receipt",
      accounting: ["absent", "partial"].includes(mode) ? null : "accounting" }];
    if (query.sql.includes('"TerraqoProfessionalProfile"')) return [{ id: "ownprofile" }];
    if (query.sql.includes('"TerraqoWorklogValidation"')) return [{ worklogId: nativeId }];
    return mode === "native" ? [{ id: "ownreceipt" }] : [];
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
      await blocked(() => releasePendingBuilderPoints("ownactor"));
    }
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
