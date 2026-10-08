import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { parseNativeWorklogPayload } from "../lib/server/native-worklog-payload";
import { decideNativeDeclaredWorklog } from "../lib/server/native-worklog-base-decision";

export const NATIVE_DECISION_CATALOG = "85af9336c4049dc61070ab63ed1a731e35dc4f61daf723c581cdfd8dc6c22499";
export async function nativeDecisionSchemaRollback(tx: Prisma.TransactionClient, workspaceId: string, core = false, release = false) {
  const [present] = await tx.$queryRaw<{ table: string | null; index: string | null }[]>`SELECT
    to_regclass('icc."TerraqoNativeWorklogDecision"')::text AS table,
    to_regclass('icc."NativeWorklogOperation_decision_binding_key"')::text AS index`;
  // This checker supports the pre-bootstrap catalog only; no repair of existing/partial DDL.
  assert.ok(!present.table && !present.index);
  await tx.$executeRawUnsafe("SAVEPOINT native_decision_schema");
  try {
    const sql = await readFile(new URL("../prisma/migrations/20261008161000_native_worklog_decision/migration.sql", import.meta.url), "utf8");
    for (const statement of sql.split(";").map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
    const tables = ["TerraqoNativeWorklogOperation", "TerraqoNativeWorklogAccounting", "TerraqoNativeWorklogDecision"];
    const columns = await tx.$queryRaw<Record<string, unknown>[]>`SELECT table_name,column_name,ordinal_position,data_type,
      udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='icc'
      AND table_name IN (${Prisma.join(tables)}) ORDER BY table_name,ordinal_position`;
    const constraints = await tx.$queryRaw<{ table_name: string; contype: string; definition: string }[]>`SELECT cl.relname AS table_name,
      c.contype,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='icc' AND cl.relname IN (${Prisma.join(tables)}) ORDER BY cl.relname,c.conname`;
    const indexes = await tx.$queryRaw<{ tablename: string; indexname: string; indexdef: string }[]>`SELECT tablename,indexname,indexdef FROM pg_indexes
      WHERE schemaname='icc' AND tablename IN (${Prisma.join(tables)}) ORDER BY tablename,indexname`;
    assert.equal(constraints.length, 22); assert.equal(indexes.length, 11);
    const invalid = await tx.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='icc' AND c.relname IN (${Prisma.join(tables)})
      AND (NOT i.indisvalid OR NOT i.indisready)`;
    assert.equal(Number(invalid[0].count), 0);
    const fingerprint = createHash("sha256").update(JSON.stringify({ columns, constraints, indexes })).digest("hex");
    assert.equal(fingerprint, NATIVE_DECISION_CATALOG);
    const marker = randomUUID(), operationId = createHash("sha256").update(marker).digest("hex");
    const user = await tx.user.create({ data: { name: `ICC native decision own ${marker}`, email: `native-decision-${marker}@example.invalid`, role: "CUSTOMER" } });
    const profile = await tx.terraqoProfessionalProfile.create({ data: { userId: user.id, visibility: "PRIVATE", liveCvEnabled: false } });
    const parsed = await parseNativeWorklogPayload(new Request("https://example.invalid/own", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ operationKey: "a".repeat(32),
        title: "ICC own decision", summary: "Own temporary text for durable decision checks.", outcome: "",
        type: "FIELD_UPDATE", projectId: "", projectVersion: "" }) }));
    const d = decideNativeDeclaredWorklog(parsed, "2026-10-08T04:59:59.999Z", { priorDuplicates: 0, rewardedInDay: 2, trustedInWindow: 9 });
    const stamp = new Date(d.createdAt);
    const entry = await tx.terraqoWorklogEntry.create({ data: { authorId: user.id, professionalProfileId: profile.id,
      workspaceId, title: parsed.payload.title, summary: parsed.payload.summary, visibility: "PRIVATE", createdAt: stamp, updatedAt: stamp } });
    await tx.$executeRaw`INSERT INTO icc."TerraqoNativeWorklogOperation"
      (id,"actorId","workspaceId","professionalProfileId","operationKey",fingerprint,"targetWorklogId","worklogId","resultVersion","createdAt")
      VALUES (${operationId},${user.id},${workspaceId},${profile.id},${parsed.payload.operationKey},${d.fingerprint},${entry.id},${entry.id},${stamp},${stamp})`;
    await tx.$executeRaw`INSERT INTO icc."TerraqoNativeWorklogAccounting" ("operationId") VALUES (${operationId})`;
    await tx.$executeRaw`INSERT INTO icc."TerraqoNativeWorklogDecision" VALUES (
      ${operationId},${d.policyVersion},${d.fingerprint},${stamp},${new Date(d.dayStart)},${new Date(d.dayEndExclusive)},
      ${new Date(d.trustStartInclusive)},${new Date(d.trustEndInclusive)},${new Date(d.availableAt)},
      ${d.priorDuplicates},${d.rewardedInDay},${d.trustedInWindow},${d.tqPoints},${d.trustScore},
      ${d.qualityScore},${d.moderationStatus},${d.riskScore})`;
    async function reject(statement: Prisma.Sql, code: string) {
      await tx.$executeRawUnsafe("SAVEPOINT native_decision_rejected");
      let matched = false;
      try { await tx.$executeRaw(statement); }
      catch (error) { matched = error instanceof Prisma.PrismaClientKnownRequestError && String(error.meta?.code) === code; }
      finally { await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT native_decision_rejected"); await tx.$executeRawUnsafe("RELEASE SAVEPOINT native_decision_rejected"); }
      assert.ok(matched);
    }
    await reject(Prisma.sql`UPDATE icc."TerraqoNativeWorklogDecision" SET "policyVersion"='unknown' WHERE "operationId"=${operationId}`, "23514");
    await reject(Prisma.sql`UPDATE icc."TerraqoNativeWorklogDecision" SET "priorDuplicates"=-1 WHERE "operationId"=${operationId}`, "23514");
    await reject(Prisma.sql`UPDATE icc."TerraqoNativeWorklogDecision" SET "tqPoints"=25 WHERE "operationId"=${operationId}`, "23514");
    await reject(Prisma.sql`UPDATE icc."TerraqoNativeWorklogDecision" SET "trustedInWindow"=10 WHERE "operationId"=${operationId}`, "23514");
    await reject(Prisma.sql`UPDATE icc."TerraqoNativeWorklogDecision" SET "dayStart"="dayStart"+interval '1 millisecond' WHERE "operationId"=${operationId}`, "23514");
    await reject(Prisma.sql`UPDATE icc."TerraqoNativeWorklogDecision" SET "availableAt"="availableAt"+interval '1 day' WHERE "operationId"=${operationId}`, "23514");
    await reject(Prisma.sql`UPDATE icc."TerraqoNativeWorklogDecision" SET "moderationStatus"='STRONG_VERIFIED' WHERE "operationId"=${operationId}`, "23514");
    await reject(Prisma.sql`UPDATE icc."TerraqoNativeWorklogDecision" SET "qualityScore"=100 WHERE "operationId"=${operationId}`, "23514");
    await reject(Prisma.sql`UPDATE icc."TerraqoNativeWorklogDecision" SET fingerprint=${"b".repeat(64)} WHERE "operationId"=${operationId}`, "23503");
    await reject(Prisma.sql`UPDATE icc."TerraqoNativeWorklogOperation" SET fingerprint=${"b".repeat(64)} WHERE id=${operationId}`, "23503");
    await reject(Prisma.sql`INSERT INTO icc."TerraqoNativeWorklogDecision" SELECT * FROM icc."TerraqoNativeWorklogDecision" WHERE "operationId"=${operationId}`, "23505");
    await tx.$executeRawUnsafe("SAVEPOINT native_decision_valid_limits");
    await tx.$executeRaw`UPDATE icc."TerraqoNativeWorklogDecision" SET "rewardedInDay"=3,"tqPoints"=0,"riskScore"=20 WHERE "operationId"=${operationId}`;
    await tx.$executeRaw`UPDATE icc."TerraqoNativeWorklogDecision" SET "trustedInWindow"=10,"trustScore"=0 WHERE "operationId"=${operationId}`;
    await tx.$executeRaw`UPDATE icc."TerraqoNativeWorklogDecision" SET "priorDuplicates"=1,"moderationStatus"='DUPLICATE',"riskScore"=90 WHERE "operationId"=${operationId}`;
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT native_decision_valid_limits");
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT native_decision_valid_limits");
    // Isolate the decision's RESTRICT from the outbox FK, which also retains receipts.
    await tx.$executeRaw`DELETE FROM icc."TerraqoNativeWorklogAccounting" WHERE "operationId"=${operationId}`;
    await reject(Prisma.sql`DELETE FROM icc."TerraqoNativeWorklogOperation" WHERE id=${operationId}`, "23503");
    await tx.terraqoWorklogEntry.delete({ where: { id: entry.id } });
    const [receipt] = await tx.$queryRaw<{ worklogId: string | null }[]>`SELECT "worklogId" FROM icc."TerraqoNativeWorklogOperation" WHERE id=${operationId}`;
    assert.equal(receipt.worklogId, null);
    const [snapshot] = await tx.$queryRaw<{ tqPoints: number; trustScore: number; createdAt: Date }[]>`SELECT "tqPoints","trustScore","createdAt"
      FROM icc."TerraqoNativeWorklogDecision" WHERE "operationId"=${operationId}`;
    assert.equal(snapshot.tqPoints, 1); assert.equal(snapshot.trustScore, 1); assert.equal(snapshot.createdAt.toISOString(), d.createdAt);
    assert.equal(await tx.terraqoBuilderAccount.count({ where: { userId: user.id } }), 0);
    assert.equal(await tx.terraqoBuilderContribution.count({ where: { userId: user.id } }), 0);
    await tx.$executeRaw`DELETE FROM icc."TerraqoNativeWorklogDecision" WHERE "operationId"=${operationId}`;
    await tx.$executeRaw`DELETE FROM icc."TerraqoNativeWorklogAccounting" WHERE "operationId"=${operationId}`;
    await tx.$executeRaw`DELETE FROM icc."TerraqoNativeWorklogOperation" WHERE id=${operationId}`;
    await tx.user.delete({ where: { id: user.id } });
    assert.equal(await tx.user.count({ where: { id: user.id } }), 0);
    let coreSchema: { fingerprint: string; constraints: number; indexes: number } | undefined;
    if (core) {
      const extra = await readFile(new URL("../prisma/migrations/20261008162500_native_worklog_content_key/migration.sql", import.meta.url), "utf8");
      for (const statement of extra.split(";").map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      const columns = await tx.$queryRaw<Record<string, unknown>[]>`SELECT table_name,column_name,ordinal_position,data_type,
        udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='icc'
        AND table_name IN (${Prisma.join(tables)}) ORDER BY table_name,ordinal_position`;
      const constraints = await tx.$queryRaw<Record<string, unknown>[]>`SELECT cl.relname AS table_name,c.contype,pg_get_constraintdef(c.oid) AS definition
        FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
        WHERE n.nspname='icc' AND cl.relname IN (${Prisma.join(tables)}) ORDER BY cl.relname,c.conname`;
      const indexes = await tx.$queryRaw<Record<string, unknown>[]>`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='icc'
        AND tablename IN (${Prisma.join(tables)}) ORDER BY tablename,indexname`;
      assert.equal(constraints.length, 23); assert.equal(indexes.length, 12);
      coreSchema = { fingerprint: createHash("sha256").update(JSON.stringify({ columns, constraints, indexes })).digest("hex"), constraints: 23, indexes: 12 };
      assert.equal(coreSchema.fingerprint, "74bf7259e20f0f84330a03567b1fd181d8c645203f71f8606ffb3b2436a624ad");
      const { nativeWorklogCoreRollback } = await import("./test-native-worklog-core-rollback");
      if (release) {
        const { nativeBaseReleaseRollback } = await import("./test-native-worklog-base-release-rollback");
        await nativeBaseReleaseRollback(tx, workspaceId);
      } else await nativeWorklogCoreRollback(tx, workspaceId);
    }
    return { fingerprint, constraints: constraints.length, indexes: indexes.length, applied: false, ...(coreSchema ? { coreSchema } : {}) };
  } catch (error: unknown) {
    const category = error instanceof assert.AssertionError ? "assertion" :
      error instanceof Prisma.PrismaClientKnownRequestError && /^[A-Z][0-9]{4}$/.test(error.code) ? error.code : "unknown";
    const location = error instanceof Error ? error.stack?.match(/(?:test-native-worklog-core-rollback|test-native-worklog-decision-schema)\.ts:[0-9]+:[0-9]+/)?.[0] : undefined;
    console.error(JSON.stringify({ outcome: "failed", category, location }));
    throw error;
  } finally {
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT native_decision_schema");
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT native_decision_schema");
  }
}
