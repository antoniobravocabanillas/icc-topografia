import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient({ log: [] });
const table = "TerraqoEducationEvidenceWithdrawal";
const rollback = new Error("WITHDRAWAL_CHECK_ROLLBACK");
const EXPECTED_CATALOG = "c8f79f50465110bdd886c23cbfbc51ee371876893eb93fa70eefbc8942e3c019";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function catalog(tx: Prisma.TransactionClient, onlyWithdrawal: boolean) {
  const columns = await tx.$queryRaw<Record<string, unknown>[]>`SELECT table_name,column_name,ordinal_position,data_type,
    udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='icc'
    AND (table_name=${table})=${onlyWithdrawal} ORDER BY table_name,ordinal_position`;
  const constraints = await tx.$queryRaw<{ table_name: string; contype: string; definition: string }[]>`
    SELECT cl.relname AS table_name,c.contype,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
    WHERE n.nspname='icc' AND (cl.relname=${table})=${onlyWithdrawal} ORDER BY cl.relname,c.conname`;
  const indexes = await tx.$queryRaw<{ tablename: string; indexname: string; indexdef: string }[]>`
    SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='icc'
    AND (tablename=${table})=${onlyWithdrawal} ORDER BY tablename,indexname`;
  return { columns, constraints, indexes };
}

async function ledgerFingerprint(tx: Prisma.TransactionClient) {
  const ledgers: unknown[] = [];
  for (const schema of ["icc", "public"]) {
    const name = `${schema}."_prisma_migrations"`;
    const [found] = await tx.$queryRaw<{ present: string | null }[]>`SELECT to_regclass(${name})::text AS present`;
    // Identifier comes exclusively from this fixed schema allowlist.
    const rows = found.present ? await tx.$queryRawUnsafe(`SELECT to_jsonb(m) AS row FROM ${name} m ORDER BY id`) : null;
    ledgers.push({ schema, rows });
  }
  return hash(ledgers);
}

async function main() {
  assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--apply"));
  const apply = process.argv[2] === "--apply";
  if (apply) assert.equal(process.env.EDUCATION_WITHDRAWAL_SCHEMA_EXPECTED, EXPECTED_CATALOG);
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  assert.equal(process.env.TEST_PORTAL_URL, "https://api.terraqoglobal.com");
  await prisma.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  const sql = await readFile(new URL("../prisma/migrations/20261008015500_education_evidence_withdrawal/migration.sql", import.meta.url), "utf8");
  let fingerprint = "";
  let ledger = "";
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      const previous = hash(await catalog(tx, false));
      ledger = await ledgerFingerprint(tx);
      const initial = await catalog(tx, true);
      if (initial.columns.length) assert.equal(hash(initial), EXPECTED_CATALOG, "Existing withdrawal catalog differs");
      for (const statement of sql.split(";").map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      const { columns, constraints, indexes } = await catalog(tx, true);
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
      assert.equal(hash(await catalog(tx, false)), previous);
      assert.equal(await ledgerFingerprint(tx), ledger);
      if (!apply) throw rollback;
    }, { maxWait: 5000, timeout: 30000 });
  } catch (error) { if (apply || error !== rollback || !fingerprint) throw error; }
  console.log(JSON.stringify({ mode: apply ? "applied" : "checked-in-rollback", fingerprint, ledgerFingerprint: ledger, constraints: 7, indexes: 5, applied: apply }));
}
main().catch(() => { console.error("Withdrawal schema check failed; private diagnostics suppressed."); process.exitCode = 1;
}).finally(() => prisma.$disconnect());
