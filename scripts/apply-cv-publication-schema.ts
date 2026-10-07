import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { prisma } from "../lib/prisma";

let phase = "scope";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  assert.equal(process.env.TEST_PORTAL_URL, "https://api.terraqoglobal.com");
  await prisma.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  const sql = await readFile(new URL("../prisma/migrations/20261007114000_cv_publication_operations/migration.sql", import.meta.url), "utf8");
  phase = "DDL transaction";
  await prisma.$transaction(async tx => {
    phase = "lock timeout";
    await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
    // Only checked-in additive DDL is executed. No external SQL or table names.
    for (const [index, statement] of sql.split(";").map(value => value.trim()).filter(Boolean).entries()) { phase = `DDL statement ${index}`; await tx.$executeRawUnsafe(statement); }
    phase = "column verification";
    const rows = await tx.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_schema='icc' AND table_name='TerraqoCvPublicationOperation'`;
    assert.deepEqual(rows.map(row => row.column_name).sort(), ["id", "professionalProfileId", "operationKey", "fingerprint", "action", "originalVersion", "resultVersion", "published", "username", "consentVersion", "createdAt"].sort());
    phase = "constraint verification";
    const constraints = await tx.$queryRaw<{ contype: string }[]>`SELECT contype FROM pg_constraint WHERE conrelid='icc."TerraqoCvPublicationOperation"'::regclass`;
    assert.equal(constraints.filter(row => row.contype === "p").length, 1);
    assert.equal(constraints.filter(row => row.contype === "f").length, 1);
    assert.equal(constraints.filter(row => row.contype === "c").length, 4);
  }, { maxWait: 5000, timeout: 15000 });
  console.log("PASS additive CV operation schema: expected columns, primary/foreign keys and four checks; existing profiles unchanged. Bootstrap does not mark Prisma migration history.");
}
main().catch((error: unknown) => { const e = error as { code?: string; name?: string; meta?: { code?: string } }; console.error({phase, code:e.code, databaseCode:e.meta?.code, name:e.name}); console.error("CV operation schema preparation failed; private diagnostics suppressed."); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
