import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { chooseNativeFirstWorklogInTransaction, saveNativeFirstWorklogDecision,
  requireNativeFirstWorklogDecision } from "../lib/server/native-worklog-first-decision";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";

/** Only the checker's temporary DDL/outer rollback; no persistent native fixtures. */
export async function nativeFirstDecisionRollback(tx: Prisma.TransactionClient, workspaceId: string) {
  for (const disposition of ["RESERVED", "EXISTING", "INELIGIBLE"] as const) {
    const marker = randomUUID(), id = createHash("sha256").update(marker).digest("hex"), stamp = new Date();
    const user = await tx.user.create({ data: { name: `ICC FIRST decision own ${marker}`,
      email: `first-decision-${marker}@example.invalid`, role: "CUSTOMER" } });
    const profile = await tx.terraqoProfessionalProfile.create({ data: { userId: user.id, visibility: "PRIVATE", liveCvEnabled: false } });
    if (disposition === "EXISTING") await tx.terraqoBuilderContribution.create({ data: {
      userId: user.id, sourceKey: `first-worklog:${user.id}`, type: "FIRST_WORKLOG", title: "Own existing unfinished FIRST",
      detail: "Own legacy allocation preserved", status: "IN_REVIEW", requestedPoints: 25, approvedPoints: 0 } });
    let priorEntryId: string | null = null;
    if (disposition === "INELIGIBLE") priorEntryId = (await tx.terraqoWorklogEntry.create({ data: {
      authorId: user.id, professionalProfileId: profile.id, workspaceId, title: "Own earlier entry",
      summary: "Own previous entry proving absence decision.", visibility: "PRIVATE" } })).id;
    const choice = await chooseNativeFirstWorklogInTransaction(tx, user.id, id, stamp);
    assert.equal(choice.disposition, disposition); assert.equal(Object.isFrozen(choice), true);
    const entry = await tx.terraqoWorklogEntry.create({ data: { authorId: user.id, professionalProfileId: profile.id,
      workspaceId, title: "Own new FIRST decision entry", summary: "Own temporary FIRST decision fixture.", visibility: "PRIVATE" } });
    await tx.terraqoNativeWorklogOperation.create({ data: { id, actorId: user.id, workspaceId,
      professionalProfileId: profile.id, operationKey: "a".repeat(32), fingerprint: "b".repeat(64),
      targetWorklogId: entry.id, worklogId: entry.id, resultVersion: stamp, createdAt: stamp } });
    const reject = (e: unknown) => e instanceof NativeWorklogOperationError && e.status === 503;
    await assert.rejects(() => saveNativeFirstWorklogDecision(tx, id, Object.freeze({ ...choice })), reject);
    await saveNativeFirstWorklogDecision(tx, id, choice);
    const state = async () => (await tx.$queryRaw<Array<{ snapshot: unknown }>>(Prisma.sql`SELECT jsonb_build_object(
      'choice',(SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogFirstDecision" r WHERE r."operationId"=${id}),
      'receipt',(SELECT to_jsonb(r) FROM icc."TerraqoNativeWorklogOperation" r WHERE r.id=${id}),
      'contributions',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM icc."TerraqoBuilderContribution" r WHERE r."userId"=${user.id})) AS snapshot`))[0].snapshot;
    const before = await state();
    assert.deepEqual(await requireNativeFirstWorklogDecision(tx, id), { disposition, creditAuthorized: false });
    assert.deepEqual(await requireNativeFirstWorklogDecision(tx, id), { disposition, creditAuthorized: false });
    assert.deepEqual(await state(), before);
    async function constraint(statement: Prisma.Sql, sqlState: string) {
      await tx.$executeRawUnsafe("SAVEPOINT own_first_constraint");
      try {
        await assert.rejects(() => tx.$executeRaw(statement), (e: unknown) =>
          e instanceof Prisma.PrismaClientKnownRequestError && e.meta?.code === sqlState);
      } finally {
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT own_first_constraint");
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT own_first_constraint");
      }
    }
    await constraint(Prisma.sql`UPDATE icc."TerraqoNativeWorklogFirstDecision" SET "priorEntries"=-1 WHERE "operationId"=${id}`, "23514");
    await constraint(Prisma.sql`UPDATE icc."TerraqoNativeWorklogFirstDecision" SET fingerprint=${"c".repeat(64)} WHERE "operationId"=${id}`, "23503");
    await constraint(Prisma.sql`DELETE FROM icc."TerraqoNativeWorklogOperation" WHERE id=${id}`, "23503");
    await constraint(Prisma.sql`INSERT INTO icc."TerraqoNativeWorklogFirstDecision" SELECT * FROM icc."TerraqoNativeWorklogFirstDecision" WHERE "operationId"=${id}`, "23505");
    if (choice.contributionId) await constraint(Prisma.sql`DELETE FROM icc."TerraqoBuilderContribution" WHERE id=${choice.contributionId}`, "23503");
    if (disposition === "RESERVED") {
      await constraint(Prisma.sql`UPDATE icc."TerraqoNativeWorklogFirstDecision" SET "priorEntries"=1 WHERE "operationId"=${id}`, "23514");
      const other = await tx.user.create({ data: { name: `ICC FIRST foreign binding own ${marker}`,
        email: `first-foreign-${marker}@example.invalid`, role: "CUSTOMER" } });
      const foreign = await tx.terraqoBuilderContribution.create({ data: { userId: other.id,
        type: "FIRST_WORKLOG", title: "Own other actor allocation", detail: "Own foreign binding constraint fixture",
        requestedPoints: 25, approvedPoints: 0 } });
      await constraint(Prisma.sql`UPDATE icc."TerraqoNativeWorklogFirstDecision" SET "contributionId"=${foreign.id} WHERE "operationId"=${id}`, "23503");
      await tx.terraqoBuilderContribution.delete({ where: { id: foreign.id } });
      await tx.user.delete({ where: { id: other.id } });
      assert.equal(await tx.user.count({ where: { id: other.id } }), 0);
    }
    if (priorEntryId) {
      await tx.terraqoWorklogEntry.delete({ where: { id: priorEntryId } });
      assert.deepEqual(await requireNativeFirstWorklogDecision(tx, id), { disposition: "INELIGIBLE", creditAuthorized: false });
    }
    await tx.terraqoWorklogEntry.delete({ where: { id: entry.id } });
    assert.deepEqual(await requireNativeFirstWorklogDecision(tx, id), { disposition, creditAuthorized: false });
    assert.equal(await tx.terraqoBuilderAccount.count({ where: { userId: user.id } }), 0);
    assert.equal(await tx.terraqoBuilderLedger.count({ where: { contribution: { userId: user.id } } }), 0);
    await tx.$executeRaw(Prisma.sql`DELETE FROM icc."TerraqoNativeWorklogFirstDecision" WHERE "operationId"=${id}`);
    await tx.terraqoNativeWorklogOperation.delete({ where: { id } });
    await tx.terraqoBuilderContribution.deleteMany({ where: { userId: user.id } });
    await tx.user.delete({ where: { id: user.id } });
    assert.equal(await tx.user.count({ where: { id: user.id } }), 0);
    assert.equal(await tx.terraqoBuilderContribution.count({ where: { userId: user.id } }), 0);
    assert.equal(await tx.terraqoProfessionalProfile.count({ where: { id: profile.id } }), 0);
  }
}
