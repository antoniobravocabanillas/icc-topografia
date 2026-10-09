import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { inspectLegacyWorklogValidationHistory } from "../lib/server/native-worklog-legacy-validation-policy";

/** Only the pinned checker's outer rollback; no standalone or existing-user mode. */
export async function nativeLegacyValidationRollback(tx: Prisma.TransactionClient, workspaceId: string, reward: 5 | 20) {
  for (const points of [reward]) {
    const marker = randomUUID();
    const validator = await tx.user.create({ data: { role: "CUSTOMER", name: `ICC validation rollback ${marker}`,
      email: `validation-${marker}@example.invalid` } });
    const author = await tx.user.create({ data: { role: "CUSTOMER", name: `ICC author rollback ${marker}`,
      email: `author-${marker}@example.invalid` } });
    const profiles = await Promise.all([validator, author].map(user => tx.terraqoProfessionalProfile.create({
      data: { userId: user.id, visibility: "PRIVATE", liveCvEnabled: false } })));
    const entry = await tx.terraqoWorklogEntry.create({ data: { authorId: author.id, professionalProfileId: profiles[1].id,
      workspaceId, title: "ICC own validation history", summary: "Manual private history for rollback proof only.",
      visibility: "PRIVATE", createdAt: new Date("2026-07-30T00:00:00.000Z") } });
    const validation = await tx.terraqoWorklogValidation.create({ data: { workspaceId, worklogId: entry.id,
      requestedByUserId: author.id, validatorUserId: validator.id, status: "APPROVED", credentialId: `own-${marker}`,
      requestedAt: new Date("2026-07-31T00:00:00.000Z"), createdAt: new Date("2026-07-31T00:00:00.001Z"),
      resolvedAt: new Date("2026-08-01T00:00:00.000Z") } });
    const contribution = await tx.terraqoBuilderContribution.create({ data: { userId: validator.id,
      type: "EXPERIENCE_VALIDATION", sourceKey: `worklog-validation:${validation.id}`,
      title: "ICC own earned validation", detail: "Manual saved reward, never current pair counters.",
      status: "VALIDATED", requestedPoints: points, approvedPoints: points,
      createdAt: new Date("2026-08-01T00:00:01.000Z"), reviewedAt: new Date("2026-08-01T00:00:02.000Z") } });
    const account = await tx.terraqoBuilderAccount.create({ data: { userId: validator.id,
      pendingPoints: 2, availablePoints: points, lifetimeEarned: points, contributionScore: points, trustScore: 4 } });
    const credit = await tx.terraqoBuilderLedger.create({ data: { accountId: account.id, contributionId: contribution.id,
      type: "CREDIT", pointsDelta: points, scoreDelta: points, balanceAfter: points,
      description: "ICC own manual legacy credit", idempotencyKey: `contribution:${contribution.id}:${points}`,
      createdAt: new Date("2026-08-01T00:00:01.999Z") } });
    const own = [validator.id, author.id];
    async function state() {
      const [snapshot] = await tx.$queryRaw<unknown[]>(Prisma.sql`SELECT jsonb_build_object(
        'users', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."User" r WHERE r.id IN (${Prisma.join(own)})),
        'profiles', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoProfessionalProfile" r WHERE r."userId" IN (${Prisma.join(own)})),
        'entries', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoWorklogEntry" r WHERE r."authorId" IN (${Prisma.join(own)})),
        'validations', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoWorklogValidation" r WHERE r.id=${validation.id}),
        'contributions', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderContribution" r WHERE r."userId" IN (${Prisma.join(own)})),
        'accounts', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderAccount" r WHERE r."userId" IN (${Prisma.join(own)})),
        'ledger', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderLedger" r WHERE r."accountId"=${account.id})
      ) AS snapshot`);
      return snapshot;
    }
    async function inspect(expected: "CREDIT_HISTORY_OBSERVED" | "REVIEW_REQUIRED") {
      const before = await state();
      await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile"
        WHERE id=${profiles[0].id} AND "userId"=${validator.id} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoBuilderContribution" WHERE id=${contribution.id} FOR SHARE`);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoWorklogValidation" WHERE id=${validation.id} FOR SHARE`);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoWorklogEntry" WHERE id=${entry.id} FOR SHARE`);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoBuilderAccount" WHERE id=${account.id} FOR SHARE`);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoBuilderLedger" WHERE "contributionId"=${contribution.id} FOR SHARE`);
      const lockedAccount = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } });
      assert.equal(lockedAccount.userId, validator.id);
      const c = await tx.terraqoBuilderContribution.findUniqueOrThrow({ where: { id: contribution.id } });
      const v = await tx.terraqoWorklogValidation.findUnique({ where: { id: validation.id } });
      const w = await tx.terraqoWorklogEntry.findUnique({ where: { id: entry.id } });
      const rows = await tx.terraqoBuilderLedger.findMany({ where: { contributionId: c.id }, take: 2 });
      const nativeTarget = !!await tx.terraqoNativeWorklogOperation.findFirst({ where: { targetWorklogId: entry.id }, select: { id: true } });
      const result = inspectLegacyWorklogValidationHistory({ actorId: validator.id, accountId: lockedAccount.id,
        firstNativeCreatedAt: "2026-09-01T00:00:00.000Z", observedAt: new Date().toISOString(),
        contribution: { ...c, createdAt: c.createdAt.toISOString(), reviewedAt: c.reviewedAt?.toISOString() ?? null,
          availableAt: c.availableAt?.toISOString() ?? null, releasedAt: c.releasedAt?.toISOString() ?? null },
        validation: v && { ...v, createdAt: v.createdAt.toISOString(), requestedAt: v.requestedAt.toISOString(),
          resolvedAt: v.resolvedAt?.toISOString() ?? null },
        worklog: w && { ...w, workspaceId: w.workspaceId ?? "", createdAt: w.createdAt.toISOString(), deletedAt: w.deletedAt?.toISOString() ?? null, nativeTarget },
        ledger: rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })) });
      assert.deepEqual(result, { disposition: expected, creditAuthorized: false, completionAuthorized: false });
      assert.ok(Object.isFrozen(result));
      assert.deepEqual(await state(), before);
    }
    await inspect("CREDIT_HISTORY_OBSERVED"); await inspect("CREDIT_HISTORY_OBSERVED");
    const baseline = await state();
    async function isolated(change: () => Promise<unknown>, expected: "CREDIT_HISTORY_OBSERVED" | "REVIEW_REQUIRED" = "REVIEW_REQUIRED") {
      await tx.$executeRawUnsafe("SAVEPOINT own_validation_case");
      try { await change(); await inspect(expected); } finally {
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_validation_case");
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_validation_case");
      }
      assert.deepEqual(await state(), baseline);
    }
    await isolated(() => tx.terraqoBuilderContribution.update({ where: { id: contribution.id }, data: { status: "IMPLEMENTED" } }), "CREDIT_HISTORY_OBSERVED");
    await isolated(() => tx.terraqoBuilderLedger.delete({ where: { id: credit.id } }));
    await isolated(() => tx.terraqoBuilderLedger.update({ where: { id: credit.id }, data: { type: "REVERSAL", pointsDelta: -points, scoreDelta: -points } }));
    await isolated(() => tx.terraqoBuilderLedger.update({ where: { id: credit.id }, data: { pointsDelta: points - 1 } }));
    await isolated(() => tx.terraqoWorklogValidation.delete({ where: { id: validation.id } }));
    await isolated(() => tx.terraqoWorklogEntry.delete({ where: { id: entry.id } }));
    await isolated(() => tx.terraqoWorklogValidation.update({ where: { id: validation.id }, data: { status: "REQUESTED" } }));
    await isolated(() => tx.terraqoWorklogValidation.update({ where: { id: validation.id }, data: { validatorUserId: author.id } }));
    await isolated(() => tx.terraqoWorklogValidation.update({ where: { id: validation.id }, data: { requestedByUserId: validator.id } }));
    await isolated(() => tx.terraqoWorklogValidation.update({ where: { id: validation.id }, data: { credentialId: null } }));
    await tx.terraqoBuilderLedger.deleteMany({ where: { accountId: account.id } });
    await tx.terraqoBuilderContribution.delete({ where: { id: contribution.id } });
    await tx.terraqoBuilderAccount.delete({ where: { id: account.id } });
    await tx.terraqoWorklogValidation.delete({ where: { id: validation.id } });
    await tx.user.delete({ where: { id: validator.id } }); await tx.user.delete({ where: { id: author.id } });
    assert.equal(await tx.user.count({ where: { id: { in: own } } }), 0);
    assert.equal(await tx.terraqoProfessionalProfile.count({ where: { userId: { in: own } } }), 0);
    assert.equal(await tx.terraqoWorklogEntry.count({ where: { authorId: { in: own } } }), 0);
    assert.equal(await tx.terraqoWorklogValidation.count({ where: { id: validation.id } }), 0);
    assert.equal(await tx.terraqoBuilderAccount.count({ where: { userId: { in: own } } }), 0);
    assert.equal(await tx.terraqoBuilderContribution.count({ where: { userId: { in: own } } }), 0);
    assert.equal(await tx.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 0);
  }
}
