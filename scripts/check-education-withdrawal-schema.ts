import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: [] });
const table = "TerraqoEducationEvidenceWithdrawal";
const rollback = new Error("WITHDRAWAL_CHECK_ROLLBACK");
const EXPECTED_CATALOG = "c8f79f50465110bdd886c23cbfbc51ee371876893eb93fa70eefbc8942e3c019";

async function main() {
  assert.equal(process.argv.length, 2); // Check-only: this script cannot commit DDL.
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  assert.equal(process.env.TEST_PORTAL_URL, "https://api.terraqoglobal.com");
  await prisma.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  const sql = await readFile(new URL("../prisma/migrations/20261008015500_education_evidence_withdrawal/migration.sql", import.meta.url), "utf8");
  let fingerprint = "";
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      for (const statement of sql.split(";").map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      const columns = await tx.$queryRaw<Record<string, unknown>[]>`SELECT table_name,column_name,ordinal_position,data_type,
        udt_name,is_nullable,column_default FROM information_schema.columns
        WHERE table_schema='icc' AND table_name=${table} ORDER BY table_name,ordinal_position`;
      const constraints = await tx.$queryRaw<{ table_name: string; contype: string; definition: string }[]>`
        SELECT cl.relname AS table_name,c.contype,pg_get_constraintdef(c.oid) AS definition
        FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
        WHERE n.nspname='icc' AND cl.relname=${table} ORDER BY cl.relname,c.conname`;
      const indexes = await tx.$queryRaw<{ tablename: string; indexname: string; indexdef: string }[]>`
        SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='icc' AND tablename=${table} ORDER BY tablename,indexname`;
      assert.deepEqual(columns.map(row => row.column_name), ["id", "educationId", "actorId", "operationKey", "fingerprint",
        "targetEvidenceId", "uploadOperationId", "attemptId", "originalVersion", "resultVersion", "createdAt"]);
      assert.equal(constraints.length, 7);
      assert.equal(constraints.filter(row => row.contype === "p").length, 1);
      assert.equal(constraints.filter(row => row.contype === "c").length, 3);
      const foreignKeys = constraints.filter(row => row.contype === "f");
      assert.equal(foreignKeys.length, 3);
      for (const parent of ["TerraqoProfessionalEducation", "TerraqoEducationEvidenceOperation", "TerraqoEducationEvidenceAttempt"])
        assert.ok(foreignKeys.some(row => row.definition.includes(`"${parent}"`) && row.definition.includes("ON DELETE RESTRICT") && row.definition.includes("ON UPDATE CASCADE")));
      assert.equal(indexes.length, 5);
      const invalid = await tx.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='icc' AND c.relname=${table} AND (NOT i.indisvalid OR NOT i.indisready)`;
      assert.equal(Number(invalid[0].count), 0);
      fingerprint = createHash("sha256").update(JSON.stringify({ columns, constraints, indexes })).digest("hex");
      assert.equal(fingerprint, EXPECTED_CATALOG);
      throw rollback;
    }, { maxWait: 5000, timeout: 30000 });
  } catch (error) { if (error !== rollback || !fingerprint) throw error; }
  console.log(JSON.stringify({ mode: "checked-in-rollback", fingerprint, constraints: 7, indexes: 5, applied: false }));
}
main().catch(() => { console.error("Withdrawal schema check failed; private diagnostics suppressed."); process.exitCode = 1;
}).finally(() => prisma.$disconnect());
