import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { blockedNativePair } from "./native-worklog-local-barrier";
import { inspectNativeLegacyWorklogInventoryInTransaction } from "../lib/server/native-worklog-legacy-inventory";

/** Called only after the local schema runner's empty-database/ownership guard.
 * Synthetic saved validation reward. No WebAuthn, productive mutation or worker proof.
 */
export async function testNativeValidationLocks(a: PrismaClient, b: PrismaClient, validatorId: string,
  workspaceId: string, operationId: string,
  state: (db: Pick<Prisma.TransactionClient, "$queryRaw">) => Promise<unknown>) {
  let authorId: string | undefined, contributionId: string | undefined, validationId: string | undefined;
  try {
    const author = await a.user.create({ data: { role: "CUSTOMER", name: "ICC own LOCAL validation author",
      email: `local-validation-${randomUUID()}@example.invalid` } });
    authorId = author.id;
    const profile = await a.terraqoProfessionalProfile.create({ data: { userId: author.id, visibility: "PRIVATE", liveCvEnabled: false } });
    const entry = await a.terraqoWorklogEntry.create({ data: { authorId: author.id, professionalProfileId: profile.id,
      workspaceId, title: "ICC own other author target", summary: "Synthetic saved validation history only.",
      visibility: "PRIVATE", createdAt: new Date("2026-07-30T00:00:00.000Z") } });
    const validation = await a.terraqoWorklogValidation.create({ data: { workspaceId, worklogId: entry.id,
      requestedByUserId: author.id, validatorUserId: validatorId, status: "APPROVED", credentialId: "own-synthetic-local",
      requestedAt: new Date("2026-07-31T00:00:00.000Z"), createdAt: new Date("2026-07-31T00:00:00.001Z"),
      resolvedAt: new Date("2026-08-01T00:00:00.000Z") } });
    validationId = validation.id;
    const contribution = await a.terraqoBuilderContribution.create({ data: { userId: validatorId,
      type: "EXPERIENCE_VALIDATION", sourceKey: `worklog-validation:${validation.id}`, status: "VALIDATED",
      title: "ICC own already earned five", detail: "Synthetic saved five, no pair counter recalculation.",
      requestedPoints: 5, approvedPoints: 5, createdAt: new Date("2026-08-01T00:00:01.000Z"),
      reviewedAt: new Date("2026-08-01T00:00:02.000Z") } });
    contributionId = contribution.id;
    const account = await a.terraqoBuilderAccount.update({ where: { userId: validatorId }, data: {
      availablePoints: { increment: 5 }, lifetimeEarned: { increment: 5 }, contributionScore: { increment: 5 } } });
    await a.terraqoBuilderLedger.create({ data: { accountId: account.id, contributionId: contribution.id,
      type: "CREDIT", pointsDelta: 5, scoreDelta: 5, balanceAfter: account.availablePoints,
      description: "ICC own synthetic saved credit", idempotencyKey: `contribution:${contribution.id}:5`,
      createdAt: new Date("2026-08-01T00:00:01.999Z") } });
    const before = await state(b);
    const authorBefore = await b.user.findUniqueOrThrow({ where: { id: author.id } });
    const profileBefore = await b.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: profile.id } });
    const entryBefore = await b.terraqoWorklogEntry.findUniqueOrThrow({ where: { id: entry.id } });
    const validationBefore = await b.terraqoWorklogValidation.findUniqueOrThrow({ where: { id: validation.id } });
    // Reader holds the real validation SHARE lock. Writer must wait for its commit.
    const readFirst = await blockedNativePair(a, b, (db, index) => db.$transaction(async tx => {
      if (index === 0) {
        const inventory = await inspectNativeLegacyWorklogInventoryInTransaction(tx, operationId);
        assert.equal(inventory.unsupported, 0); assert.equal(inventory.historical, 1);
        return "read-valid";
      }
      assert.equal(await tx.$executeRaw`UPDATE icc."TerraqoWorklogValidation" SET status='REQUESTED'
        WHERE id=${validation.id} AND "validatorUserId"=${validatorId}`, 1);
      return "write-status";
    }, { maxWait: 1000, timeout: 7000 }));
    assert.deepEqual(readFirst, ["read-valid", "write-status"]);
    assert.equal((await a.$transaction(tx => inspectNativeLegacyWorklogInventoryInTransaction(tx, operationId),
      { maxWait: 1000, timeout: 7000 })).unsupported, 1);
    assert.deepEqual(await state(b), before);
    assert.deepEqual(await b.terraqoWorklogValidation.findUniqueOrThrow({ where: { id: validation.id } }),
      { ...validationBefore, status: "REQUESTED" });
    await a.$executeRaw`UPDATE icc."TerraqoWorklogValidation" SET status='APPROVED' WHERE id=${validation.id}`;
    // Writer holds the other author's target UPDATE lock first. Reader must wait,
    // then re-read the committed deletion flag and reject the saved history.
    const deletedAt = new Date("2026-10-09T00:00:00.000Z");
    const writeFirst = await blockedNativePair(a, b, (db, index) => db.$transaction(async tx => {
      if (index === 0) {
        assert.equal(await tx.$executeRaw`UPDATE icc."TerraqoWorklogEntry" SET "deletedAt"=${deletedAt}
          WHERE id=${entry.id} AND "authorId"=${author.id}`, 1);
        return "write-target";
      }
      const inventory = await inspectNativeLegacyWorklogInventoryInTransaction(tx, operationId);
      assert.equal(inventory.unsupported, 1); assert.equal(inventory.historical, 0);
      return "read-invalid";
    }, { maxWait: 1000, timeout: 7000 }));
    assert.deepEqual(writeFirst, ["write-target", "read-invalid"]);
    assert.deepEqual(await state(b), before);
    assert.deepEqual(await b.terraqoWorklogEntry.findUniqueOrThrow({ where: { id: entry.id } }), { ...entryBefore, deletedAt });
    assert.deepEqual(await b.terraqoWorklogValidation.findUniqueOrThrow({ where: { id: validation.id } }), validationBefore);
    assert.deepEqual(await b.user.findUniqueOrThrow({ where: { id: author.id } }), authorBefore);
    assert.deepEqual(await b.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: profile.id } }), profileBefore);
    console.log(JSON.stringify({ outcome: "passed", environment: "LOCAL_PG18_ONLY", blocked_pairs: 2,
      validation_cross_owner_proved: true, accounting_credits: 0, network_cut_proved: false }));
  } finally {
    if (contributionId) {
      await a.terraqoBuilderLedger.deleteMany({ where: { contributionId } });
      await a.terraqoBuilderContribution.deleteMany({ where: { id: contributionId, userId: validatorId } });
    }
    if (validationId) await a.terraqoWorklogValidation.deleteMany({ where: { id: validationId, validatorUserId: validatorId } });
    if (authorId) {
      await a.user.delete({ where: { id: authorId } });
      assert.equal(await a.user.count({ where: { id: authorId } }), 0);
      assert.equal(await a.terraqoProfessionalProfile.count({ where: { userId: authorId } }), 0);
      assert.equal(await a.terraqoWorklogEntry.count({ where: { authorId } }), 0);
    }
  }
}
