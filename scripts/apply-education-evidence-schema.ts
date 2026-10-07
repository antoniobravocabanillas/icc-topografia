import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: [] });
const tables = ["TerraqoEducationEvidence", "TerraqoEducationEvidenceOperation", "TerraqoEducationEvidenceAttempt"];
const expected = [
  ["id", "educationId", "storageKey", "fileName", "contentType", "size", "uploadedById", "createdAt"],
  ["id", "educationId", "actorId", "operationKey", "fingerprint", "evidenceId", "fileName", "contentType", "size", "originalVersion", "resultVersion", "createdAt"],
  ["id", "educationId", "actorId", "operationKey", "fingerprint", "originalVersion", "storageKey", "size", "reservedUnits", "state", "attempts", "nextAttemptAt", "createdAt", "updatedAt"],
];
const rollback = new Error("CHECK_ONLY_ROLLBACK");
// Verified from checked-in DDL in rollback on the same direct/runtime source.
// A preexisting table with matching names/counts but different definitions is
// rejected. PostgreSQL catalog formatting changes require a fresh review.
const EXPECTED_CATALOG = "f9058b5c44baef015f2d5ec08c595f6790b3759110ccdd201b3ba1cf0cb9b664";
let phase = "scope";
async function main() {
  assert.ok(["--check", "--apply"].includes(process.argv[2]) && process.argv.length === 3);
  const apply = process.argv[2] === "--apply";
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  assert.equal(process.env.TEST_PORTAL_URL, "https://api.terraqoglobal.com");
  if (apply) assert.match(process.env.EDUCATION_SCHEMA_EXPECTED ?? "", /^[a-f0-9]{64}$/);
  await prisma.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  const sql = await readFile(new URL("../prisma/migrations/20261007195600_education_evidence_prerequisites/migration.sql", import.meta.url), "utf8");
  let fingerprint = "";
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      phase = "additive DDL";
      for (const statement of sql.split(";").map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      phase = "catalog verification";
      const columns = await tx.$queryRaw<Record<string, unknown>[]>`SELECT table_name,column_name,ordinal_position,data_type,
        udt_name,is_nullable,column_default FROM information_schema.columns
        WHERE table_schema='icc' AND table_name=ANY(${tables}) ORDER BY table_name,ordinal_position`;
      const constraints = await tx.$queryRaw<{ table_name: string; contype: string; definition: string }[]>`
        SELECT cl.relname AS table_name,c.contype,pg_get_constraintdef(c.oid) AS definition
        FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
        WHERE n.nspname='icc' AND cl.relname=ANY(${tables}) ORDER BY cl.relname,c.conname`;
      const indexes = await tx.$queryRaw<{ tablename: string; indexname: string; indexdef: string }[]>`
        SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='icc' AND tablename=ANY(${tables}) ORDER BY tablename,indexname`;
      for (const [i, table] of tables.entries()) {
        assert.deepEqual(columns.filter(row => row.table_name === table).map(row => row.column_name), expected[i]);
        const rows = constraints.filter(row => row.table_name === table);
        assert.equal(rows.filter(row => row.contype === "p").length, 1);
        assert.equal(rows.filter(row => row.contype === "f").length, i === 1 ? 2 : 1);
        assert.equal(rows.filter(row => row.contype === "c").length, [4, 5, 7][i]);
        assert.ok(rows.some(row => row.contype === "f" && row.definition.includes('"TerraqoProfessionalEducation"') &&
          row.definition.includes("ON DELETE RESTRICT") && row.definition.includes("ON UPDATE CASCADE")));
        assert.equal(indexes.filter(row => row.tablename === table).length, [4, 4, 4][i]);
      }
      assert.ok(constraints.some(row => row.table_name === tables[1] && row.contype === "f" && row.definition.includes("ON DELETE SET NULL")));
      const invalid = await tx.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='icc' AND c.relname=ANY(${tables}) AND (NOT i.indisvalid OR NOT i.indisready)`;
      assert.equal(Number(invalid[0].count), 0);
      fingerprint = createHash("sha256").update(JSON.stringify({ columns, constraints, indexes })).digest("hex");
      assert.equal(fingerprint, EXPECTED_CATALOG);
      if (apply) assert.equal(fingerprint, process.env.EDUCATION_SCHEMA_EXPECTED);
      if (!apply) throw rollback;
    }, { maxWait: 5000, timeout: 30000 });
  } catch (error) { if (error !== rollback || !fingerprint || apply) throw error; }
  console.log(JSON.stringify({ mode: apply ? "applied" : "checked-in-rollback", fingerprint, tables: 3, ledgerChanged: false }));
}
main().catch((error: unknown) => { const value = error as { code?: string; name?: string };
  console.error(JSON.stringify({ phase, code: value.code, name: value.name }));
  console.error("Education additive schema check failed; private diagnostics suppressed."); process.exitCode = 1;
}).finally(() => prisma.$disconnect());
