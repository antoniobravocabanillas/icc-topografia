import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";

const EXPECTED = "4f5a48e679e61fecac2d81855240cbc2895567e64571a91099a6566c89efe503";
export async function nativeAuthoritySchemaRollback(tx: Prisma.TransactionClient, workspaceId: string, afterSchema?: () => Promise<void>) {
  const [present] = await tx.$queryRaw<{ table: string | null; index: string | null }[]>`SELECT
    to_regclass('icc."TerraqoNativeWorklogAuthority"')::text AS table,
    to_regclass('icc."NativeWorklogOperation_authority_binding_key"')::text AS index`;
  // No repair or bootstrap: even a previously installed snapshot requires another workflow.
  assert.ok(!present.table && !present.index);
  await tx.$executeRawUnsafe("SAVEPOINT native_authority_schema");
  try {
    const sql = await readFile(new URL("../prisma/migrations/20261008232500_native_worklog_authority_snapshot/migration.sql", import.meta.url), "utf8");
    for (const statement of sql.split(";").map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
    const columns = await tx.$queryRaw<Record<string, unknown>[]>`SELECT table_name,column_name,ordinal_position,data_type,
      udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='icc'
      AND table_name='TerraqoNativeWorklogAuthority' ORDER BY table_name,ordinal_position`;
    const constraints = await tx.$queryRaw<Record<string, unknown>[]>`SELECT cl.relname AS table_name,c.contype,pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
      WHERE n.nspname='icc' AND cl.relname='TerraqoNativeWorklogAuthority' ORDER BY cl.relname,c.conname`;
    const indexes = await tx.$queryRaw<Record<string, unknown>[]>`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='icc'
      AND (tablename='TerraqoNativeWorklogAuthority' OR indexname='NativeWorklogOperation_authority_binding_key') ORDER BY tablename,indexname`;
    assert.equal(constraints.length, 7); assert.equal(indexes.length, 2);
    const [invalid] = await tx.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='icc'
      AND c.relname IN ('TerraqoNativeWorklogAuthority_pkey','NativeWorklogOperation_authority_binding_key') AND (NOT i.indisvalid OR NOT i.indisready)`;
    assert.equal(Number(invalid.count), 0);
    const fingerprint = createHash("sha256").update(JSON.stringify({ columns, constraints, indexes })).digest("hex");
    assert.equal(fingerprint, EXPECTED);
    if (afterSchema) {
      await afterSchema();
      return { fingerprint, constraints: 7, indexes: 2, applied: false };
    }
    await assert.rejects(() => nativeAuthoritySchemaRollback(tx, workspaceId), assert.AssertionError);
    const marker = randomUUID(), operationId = createHash("sha256").update(marker).digest("hex");
    const stamp = new Date("2026-10-08T23:00:00.000Z");
    const user = await tx.user.create({ data: { name: `ICC authority schema own ${marker}`, email: `native-authority-schema-${marker}@example.invalid`, role: "CUSTOMER" } });
    const profile = await tx.terraqoProfessionalProfile.create({ data: { userId: user.id, visibility: "PRIVATE", liveCvEnabled: false } });
    const entry = await tx.terraqoWorklogEntry.create({ data: { authorId: user.id, professionalProfileId: profile.id, workspaceId,
      title: "ICC autoridad temporal propia", summary: "Fixture propio exclusivamente para esquema en rollback.", visibility: "PRIVATE", createdAt: stamp, updatedAt: stamp } });
    await tx.$executeRaw`INSERT INTO icc."TerraqoNativeWorklogOperation"
      (id,"actorId","workspaceId","professionalProfileId","operationKey",fingerprint,"targetWorklogId","worklogId","resultVersion","createdAt")
      VALUES (${operationId},${user.id},${workspaceId},${profile.id},${"a".repeat(32)},${"b".repeat(64)},${entry.id},${entry.id},${stamp},${stamp})`;
    // Synthetic metadata, not a token or a live grant. Schema cannot attest authorization provenance.
    await tx.$executeRaw`INSERT INTO icc."TerraqoNativeWorklogAuthority" VALUES
      (${operationId},${user.id},${workspaceId},${profile.id},${stamp},${"b".repeat(64)},'native-creation-authority-v1',${"c".repeat(64)},
       ${new Date(stamp.getTime()-1000)},${new Date(stamp.getTime()+60000)},${new Date(stamp.getTime()+60000)},NULL,'PROFESSIONAL',ARRAY['LIVE_CV','PROFESSIONAL_NETWORK'])`;
    async function reject(statement: Prisma.Sql, code: string) {
      await tx.$executeRawUnsafe("SAVEPOINT native_authority_rejected");
      let matched = false;
      try { await tx.$executeRaw(statement); }
      catch (error) { matched = error instanceof Prisma.PrismaClientKnownRequestError && String(error.meta?.code) === code; }
      finally { await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT native_authority_rejected"); await tx.$executeRawUnsafe("RELEASE SAVEPOINT native_authority_rejected"); }
      assert.ok(matched, `Expected SQLSTATE ${code}`);
    }
    for (const statement of [
      Prisma.sql`UPDATE icc."TerraqoNativeWorklogAuthority" SET "policyVersion"='unknown' WHERE "operationId"=${operationId}`,
      Prisma.sql`UPDATE icc."TerraqoNativeWorklogAuthority" SET role='CLIENT' WHERE "operationId"=${operationId}`,
      Prisma.sql`UPDATE icc."TerraqoNativeWorklogAuthority" SET modules=ARRAY['LIVE_CV',NULL] WHERE "operationId"=${operationId}`,
      Prisma.sql`UPDATE icc."TerraqoNativeWorklogAuthority" SET modules=ARRAY['PROFESSIONAL_NETWORK','LIVE_CV'] WHERE "operationId"=${operationId}`,
      Prisma.sql`UPDATE icc."TerraqoNativeWorklogAuthority" SET "grantHash"='raw-invalid' WHERE "operationId"=${operationId}`,
      Prisma.sql`UPDATE icc."TerraqoNativeWorklogAuthority" SET "tokenIssuedAt"="createdAt"+interval '1 millisecond' WHERE "operationId"=${operationId}`,
      Prisma.sql`UPDATE icc."TerraqoNativeWorklogAuthority" SET "tokenExpiresAt"="createdAt" WHERE "operationId"=${operationId}`,
      Prisma.sql`UPDATE icc."TerraqoNativeWorklogAuthority" SET "grantExpiresAt"="createdAt" WHERE "operationId"=${operationId}`,
      Prisma.sql`UPDATE icc."TerraqoNativeWorklogAuthority" SET "paidThrough"="createdAt" WHERE "operationId"=${operationId}`,
      Prisma.sql`UPDATE icc."TerraqoNativeWorklogAuthority" SET "tokenExpiresAt"='infinity' WHERE "operationId"=${operationId}`,
    ]) await reject(statement, "23514");
    for (const statement of [
      Prisma.sql`UPDATE icc."TerraqoNativeWorklogAuthority" SET "actorId"='own-missing' WHERE "operationId"=${operationId}`,
      Prisma.sql`UPDATE icc."TerraqoNativeWorklogAuthority" SET "workspaceId"='own-missing' WHERE "operationId"=${operationId}`,
      Prisma.sql`UPDATE icc."TerraqoNativeWorklogAuthority" SET "professionalProfileId"='own-missing' WHERE "operationId"=${operationId}`,
      Prisma.sql`UPDATE icc."TerraqoNativeWorklogAuthority" SET fingerprint=${"d".repeat(64)} WHERE "operationId"=${operationId}`,
      Prisma.sql`UPDATE icc."TerraqoNativeWorklogAuthority" SET "createdAt"="createdAt"+interval '1 millisecond' WHERE "operationId"=${operationId}`,
      Prisma.sql`DELETE FROM icc."TerraqoNativeWorklogOperation" WHERE id=${operationId}`,
    ]) await reject(statement, "23503");
    await reject(Prisma.sql`INSERT INTO icc."TerraqoNativeWorklogAuthority" SELECT * FROM icc."TerraqoNativeWorklogAuthority" WHERE "operationId"=${operationId}`, "23505");
    await tx.terraqoWorklogEntry.delete({ where: { id: entry.id } });
    const [receipt] = await tx.$queryRaw<{ worklogId: string | null }[]>`SELECT "worklogId" FROM icc."TerraqoNativeWorklogOperation" WHERE id=${operationId}`;
    assert.equal(receipt.worklogId, null);
    const [saved] = await tx.$queryRaw<{ createdAt: Date; grantHash: string }[]>`SELECT "createdAt","grantHash" FROM icc."TerraqoNativeWorklogAuthority" WHERE "operationId"=${operationId}`;
    assert.equal(saved.createdAt.toISOString(), stamp.toISOString()); assert.equal(saved.grantHash, "c".repeat(64));
    assert.equal(await tx.terraqoBuilderAccount.count({ where: { userId: user.id } }), 0);
    assert.equal(await tx.terraqoBuilderContribution.count({ where: { userId: user.id } }), 0);
    await tx.$executeRaw`DELETE FROM icc."TerraqoNativeWorklogAuthority" WHERE "operationId"=${operationId}`;
    await tx.$executeRaw`DELETE FROM icc."TerraqoNativeWorklogOperation" WHERE id=${operationId}`;
    await tx.user.delete({ where: { id: user.id } });
    assert.equal(await tx.user.count({ where: { id: user.id } }), 0);
    return { fingerprint, constraints: 7, indexes: 2, applied: false };
  } finally {
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT native_authority_schema");
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT native_authority_schema");
  }
}
