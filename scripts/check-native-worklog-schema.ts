import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient({ log: [] });
const tables = ["TerraqoNativeWorklogOperation", "TerraqoNativeWorklogAccounting"];
const rollback = new Error("NATIVE_WORKLOG_CHECK_ROLLBACK");
const EXPECTED_CATALOG = "d2e17d02f546dc4bf5e2540274633dd1b05a157edd7f02b8ed4a8f623278b3bd";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function catalog(tx: Prisma.TransactionClient, onlyNativeWorklog: boolean) {
  const columns = await tx.$queryRaw<Record<string, unknown>[]>`SELECT table_name,column_name,ordinal_position,data_type,
    udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='icc'
    AND (table_name IN (${Prisma.join(tables)}))=${onlyNativeWorklog} ORDER BY table_name,ordinal_position`;
  const constraints = await tx.$queryRaw<{ table_name: string; contype: string; definition: string }[]>`
    SELECT cl.relname AS table_name,c.contype,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
    WHERE n.nspname='icc' AND (cl.relname IN (${Prisma.join(tables)}))=${onlyNativeWorklog} ORDER BY cl.relname,c.conname`;
  const indexes = await tx.$queryRaw<{ tablename: string; indexname: string; indexdef: string }[]>`
    SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='icc'
    AND (tablename IN (${Prisma.join(tables)}))=${onlyNativeWorklog} ORDER BY tablename,indexname`;
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

async function fixtureConstraints(tx: Prisma.TransactionClient, workspaceId: string) {
  const marker=randomUUID(), id=createHash("sha256").update(marker).digest("hex"), stamp=new Date();
  const user=await tx.user.create({data:{name:`ICC native-worklog rollback ${marker}`,email:`native-worklog-${marker}@example.invalid`,role:"CUSTOMER"}});
  const profile=await tx.terraqoProfessionalProfile.create({data:{userId:user.id,visibility:"PRIVATE",liveCvEnabled:false}});
  const worklog=await tx.terraqoWorklogEntry.create({data:{authorId:user.id,professionalProfileId:profile.id,workspaceId,title:"ICC rollback propio",summary:"Entrada temporal propia para constraints.",visibility:"PRIVATE",updatedAt:stamp}});
  await tx.$executeRaw`INSERT INTO icc."TerraqoNativeWorklogOperation" (id,"actorId","workspaceId","professionalProfileId","operationKey",fingerprint,"targetWorklogId","worklogId","resultVersion","createdAt")
    VALUES (${id},${user.id},${workspaceId},${profile.id},${"a".repeat(32)},${"b".repeat(64)},${worklog.id},${worklog.id},${stamp},${stamp})`;
  await tx.$executeRaw`INSERT INTO icc."TerraqoNativeWorklogAccounting" ("operationId") VALUES (${id})`;
  async function rejected(statement: Prisma.Sql, code: string) {
    await tx.$executeRawUnsafe("SAVEPOINT native_worklog_constraint_test");
    let found=false;
    try { await tx.$executeRaw(statement); }
    catch (error) { found=error instanceof Prisma.PrismaClientKnownRequestError && String(error.meta?.code)===code; }
    finally { await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT native_worklog_constraint_test"); await tx.$executeRawUnsafe("RELEASE SAVEPOINT native_worklog_constraint_test"); }
    assert.ok(found,`Expected constraint SQLSTATE ${code}`);
  }
  await rejected(Prisma.sql`UPDATE icc."TerraqoNativeWorklogOperation" SET "operationKey"='invalid' WHERE id=${id}`,"23514");
  await rejected(Prisma.sql`UPDATE icc."TerraqoNativeWorklogOperation" SET "worklogId"=NULL,"targetWorklogId"='' WHERE id=${id}`,"23514");
  await rejected(Prisma.sql`UPDATE icc."TerraqoNativeWorklogOperation" SET "originalProjectId"=${"c"+"a".repeat(24)} WHERE id=${id}`,"23514");
  await rejected(Prisma.sql`UPDATE icc."TerraqoNativeWorklogOperation" SET "resultVersion"=${new Date(stamp.getTime()+1)} WHERE id=${id}`,"23514");
  await rejected(Prisma.sql`UPDATE icc."TerraqoNativeWorklogAccounting" SET state='APPLIED' WHERE "operationId"=${id}`,"23514");
  await rejected(Prisma.sql`UPDATE icc."TerraqoNativeWorklogAccounting" SET attempts=-1 WHERE "operationId"=${id}`,"23514");
  await rejected(Prisma.sql`UPDATE icc."TerraqoNativeWorklogAccounting" SET state='unknown' WHERE "operationId"=${id}`,"23514");
  await rejected(Prisma.sql`DELETE FROM icc."TerraqoNativeWorklogOperation" WHERE id=${id}`,"23503");
  await rejected(Prisma.sql`DELETE FROM icc."TerraqoProfessionalProfile" WHERE id=${profile.id}`,"23503");
  await rejected(Prisma.sql`DELETE FROM icc."User" WHERE id=${user.id}`,"23503");
  await rejected(Prisma.sql`INSERT INTO icc."TerraqoNativeWorklogAccounting" ("operationId") VALUES (${id})`,"23505");
  const second=await tx.terraqoWorklogEntry.create({data:{authorId:user.id,professionalProfileId:profile.id,workspaceId,title:"ICC segundo rollback",summary:"Segunda entrada temporal propia para unicidad.",visibility:"PRIVATE",updatedAt:stamp}});
  const otherId=createHash("sha256").update(marker+":second").digest("hex");
  await rejected(Prisma.sql`INSERT INTO icc."TerraqoNativeWorklogOperation" (id,"actorId","workspaceId","professionalProfileId","operationKey",fingerprint,"targetWorklogId","worklogId","resultVersion","createdAt")
    VALUES (${otherId},${user.id},${workspaceId},${profile.id},${"a".repeat(32)},${"b".repeat(64)},${second.id},${second.id},${stamp},${stamp})`,"23505");
  await rejected(Prisma.sql`INSERT INTO icc."TerraqoNativeWorklogOperation" (id,"actorId","workspaceId","professionalProfileId","operationKey",fingerprint,"targetWorklogId","resultVersion","createdAt")
    VALUES (${otherId},${user.id},${workspaceId},${profile.id},${"c".repeat(32)},${"b".repeat(64)},${worklog.id},${stamp},${stamp})`,"23505");
  await rejected(Prisma.sql`UPDATE icc."TerraqoNativeWorklogOperation" SET "actorId"='native-own-missing' WHERE id=${id}`,"23503");
  await tx.terraqoWorklogEntry.delete({where:{id:worklog.id}});
  const receipt=await tx.$queryRaw<{targetWorklogId:string;worklogId:string|null}[]>`SELECT "targetWorklogId","worklogId" FROM icc."TerraqoNativeWorklogOperation" WHERE id=${id}`;
  assert.equal(receipt[0].targetWorklogId,worklog.id);assert.equal(receipt[0].worklogId,null);
  assert.equal(await tx.terraqoBuilderAccount.count({where:{userId:user.id}}),0);
  assert.equal(await tx.terraqoBuilderContribution.count({where:{userId:user.id}}),0);
  assert.equal((await tx.terraqoProfessionalProfile.findUniqueOrThrow({where:{id:profile.id}})).liveCvEnabled,false);
  // Delete only the freshly created fixture, children before parents; outer rollback also removes DDL.
  await tx.$executeRaw`DELETE FROM icc."TerraqoNativeWorklogAccounting" WHERE "operationId"=${id}`;
  await tx.$executeRaw`DELETE FROM icc."TerraqoNativeWorklogOperation" WHERE id=${id}`;
  await tx.user.delete({where:{id:user.id}});
  assert.equal(await tx.user.count({where:{id:user.id}}),0);
}

async function main() {
  if (["--worker-eligibility", "--worker-phases", "--worker-preflight", "--worker-legacy-first", "--legacy-validation-5", "--legacy-validation-20", "--validation-preflight-5", "--validation-preflight-20", "--validation-phases-5", "--validation-phases-20"].includes(process.argv[2])) {
    assert.equal(process.argv.length, 3);
    assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
    assert.equal(process.env.TEST_PORTAL_URL, "https://api.terraqoglobal.com");
    const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true,
      companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
    const { readNativeWorklogCombinedCatalog } = await import("./native-worklog-combined-catalog");
    const { nativeWorkerEligibilityRollback } = await import("./test-native-worklog-worker-eligibility-rollback");
    const ledger = await ledgerFingerprint(prisma);
    let combined: unknown;
    try {
      await prisma.$transaction(async tx => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
        assert.deepEqual(await readNativeWorklogCombinedCatalog(tx), { state: "absent" });
        for (const name of ["20261008051000_native_worklog_operations", "20261008161000_native_worklog_decision",
          "20261008162500_native_worklog_content_key", "20261008232500_native_worklog_authority_snapshot"]) {
          const ddl = await readFile(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8");
          for (const statement of ddl.split(";").map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
        }
        combined = await readNativeWorklogCombinedCatalog(tx);
        assert.equal((combined as { state: string }).state, "exact");
        if (process.argv[2].startsWith("--validation-")) {
          const { nativeValidationInventoryRollback } = await import("./test-native-worklog-validation-inventory-rollback");
          await nativeValidationInventoryRollback(tx, workspace.id, process.argv[2].endsWith("-5") ? 5 : 20,
            process.argv[2].startsWith("--validation-phases-"));
        } else if (["--legacy-validation-5", "--legacy-validation-20"].includes(process.argv[2])) {
          const { nativeLegacyValidationRollback } = await import("./test-native-worklog-legacy-validation-rollback");
          await nativeLegacyValidationRollback(tx, workspace.id, process.argv[2] === "--legacy-validation-5" ? 5 : 20);
        } else if (["--worker-phases", "--worker-preflight", "--worker-legacy-first"].includes(process.argv[2])) {
          const { nativeAccountingPhasesRollback } = await import("./test-native-worklog-accounting-phases-rollback");
          await nativeAccountingPhasesRollback(tx, workspace.id, true, process.argv[2] === "--worker-preflight", process.argv[2] === "--worker-legacy-first");
        } else await nativeWorkerEligibilityRollback(tx, workspace.id);
        assert.deepEqual(await readNativeWorklogCombinedCatalog(tx), combined);
        throw rollback;
      }, { maxWait: 5000, timeout: 90000 });
    } catch (error) { if (error !== rollback) throw error; }
    assert.deepEqual(await readNativeWorklogCombinedCatalog(prisma), { state: "absent" });
    assert.equal(await ledgerFingerprint(prisma), ledger);
    console.log(JSON.stringify({ mode: process.argv[2].startsWith("--validation-") || ["--legacy-validation-5", "--legacy-validation-20"].includes(process.argv[2]) ? `${process.argv[2].slice(2)}-rollback` : process.argv[2] === "--worker-legacy-first" ? "worker-legacy-first-rollback" : process.argv[2] === "--worker-preflight" ? "worker-preflight-rollback" : process.argv[2] === "--worker-phases" ? "worker-phases-rollback" : "worker-eligibility-rollback", combined, ledgerFingerprint: ledger, applied: false }));
    return;
  }
  if (process.argv[2] === "--combined") {
    assert.equal(process.argv.length, 3);
    assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
    assert.equal(process.env.TEST_PORTAL_URL, "https://api.terraqoglobal.com");
    await prisma.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true,
      companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
    let combined: unknown;
    const ledger = await ledgerFingerprint(prisma);
    const { nativeCombinedCatalogRollback } = await import("./test-native-worklog-combined-catalog");
    try {
      await prisma.$transaction(async tx => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
        combined = await nativeCombinedCatalogRollback(tx);
        throw rollback;
      }, { maxWait: 5000, timeout: 60000 });
    } catch (error) { if (error !== rollback) throw error; }
    assert.equal(await ledgerFingerprint(prisma), ledger);
    console.log(JSON.stringify({ mode: "combined-rollback", combined, ledgerFingerprint: ledger, applied: false }));
    return;
  }
  const core = process.argv[2] === "--core";
  const release = process.argv[2] === "--release";
  const creationAuthority = process.argv[2] === "--creation-authority";
  const authoritySchemaOnly = process.argv[2] === "--authority-schema";
  const authority = process.argv[2] === "--accounting-authority";
  const retry = process.argv[2] === "--accounting-retry";
  const inventory = process.argv[2] === "--legacy-inventory";
  const phaseEdges = process.argv[2] === "--phase-edges";
  const phases = process.argv[2] === "--phases";
  const firstAccount = process.argv[2] === "--first-account";
  const edges = process.argv[2] === "--base-edges";
  const reconciliation = process.argv[2] === "--reconciliation";
  const ownerFence = process.argv[2] === "--owner-fence";
  const decision = process.argv[2] === "--decision";
  let decisionSchema: unknown;
  assert.ok(process.argv.length === 2 || ((core || release || edges || creationAuthority || authoritySchemaOnly || authority || retry || inventory || phaseEdges || phases || firstAccount || reconciliation || ownerFence || decision) && process.argv.length === 3));
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  assert.equal(process.env.TEST_PORTAL_URL, "https://api.terraqoglobal.com");
  const workspace=await prisma.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  const sql = await readFile(new URL("../prisma/migrations/20261008051000_native_worklog_operations/migration.sql", import.meta.url), "utf8");
  let fingerprint = "";
  let ledger = "";
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      const previous = hash(await catalog(tx, false));
      ledger = await ledgerFingerprint(tx);
      const initial = await catalog(tx, true);
      if (initial.columns.length) { assert.equal(hash(initial), EXPECTED_CATALOG, "Existing native worklog catalog differs"); }
      for (const statement of sql.split(";").map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      const { columns, constraints, indexes } = await catalog(tx, true);
      assert.deepEqual(columns.filter(row => row.table_name === tables[0]).map(row => row.column_name), ["id", "actorId", "workspaceId", "professionalProfileId", "operationKey", "fingerprint", "targetWorklogId", "worklogId", "originalProjectId", "originalProjectVersion", "resultVersion", "createdAt"]);
      assert.deepEqual(columns.filter(row => row.table_name === tables[1]).map(row => row.column_name), ["operationId", "state", "attempts", "nextAttemptAt", "completedAt", "createdAt"]);
      assert.equal(constraints.length, 14);
      assert.equal(constraints.filter(row => row.contype === "p").length, 2);
      assert.equal(constraints.filter(row => row.contype === "c").length, 7);
      const foreignKeys = constraints.filter(row => row.contype === "f");
      assert.equal(foreignKeys.length, 5);
      for (const parent of ["User", "TerraqoWorkspace", "TerraqoProfessionalProfile", "TerraqoNativeWorklogOperation"])
        assert.ok(foreignKeys.some(row => row.definition.includes(`"${parent}"`) && row.definition.includes("ON DELETE RESTRICT") && row.definition.includes("ON UPDATE CASCADE")));
      assert.ok(foreignKeys.some(row => row.definition.includes('"TerraqoWorklogEntry"') && row.definition.includes("ON DELETE SET NULL")));
      assert.equal(indexes.length, 8);
      const invalid = await tx.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='icc' AND c.relname IN (${Prisma.join(tables)}) AND (NOT i.indisvalid OR NOT i.indisready)`;
      assert.equal(Number(invalid[0].count), 0);
      fingerprint = createHash("sha256").update(JSON.stringify({ columns, constraints, indexes })).digest("hex");
      assert.equal(fingerprint, EXPECTED_CATALOG);
      if (core || release || edges || creationAuthority || authoritySchemaOnly || authority || retry || inventory || phaseEdges || phases || firstAccount) {
        const { nativeDecisionSchemaRollback } = await import("./test-native-worklog-decision-schema");
        decisionSchema = await nativeDecisionSchemaRollback(tx, workspace.id, true, release, edges, firstAccount, phases, phaseEdges, inventory, retry, authority, authoritySchemaOnly, creationAuthority);
      } else if (reconciliation) {
        const { nativeLegacyReleaseRollback } = await import("./test-native-worklog-legacy-release-rollback");
        await nativeLegacyReleaseRollback(tx, workspace.id);
      } else if (decision) {
        const { nativeDecisionSchemaRollback } = await import("./test-native-worklog-decision-schema");
        decisionSchema = await nativeDecisionSchemaRollback(tx, workspace.id);
      } else if (!ownerFence) await fixtureConstraints(tx,workspace.id);
      assert.equal(hash(await catalog(tx, false)), previous);
      assert.equal(await ledgerFingerprint(tx), ledger);
      throw rollback;
    }, { maxWait: 5000, timeout: (core || edges) ? 180000 : (release || reconciliation || firstAccount || phases || phaseEdges || inventory || retry || authority || authoritySchemaOnly || creationAuthority) ? 90000 : 30000 });
  } catch (error) { if (error !== rollback || !fingerprint) throw error; }
  if (ownerFence) {
    const { nativeOwnerFenceProof } = await import("./test-native-worklog-owner-fence");
    await nativeOwnerFenceProof(prisma, workspace.id);
    assert.equal(await ledgerFingerprint(prisma), ledger);
  }
  console.log(JSON.stringify({ mode: "checked-in-rollback", fingerprint, ledgerFingerprint: ledger, constraints: 14, indexes: 8,
    ownFixtureConstraints: !core && !release && !edges && !firstAccount && !phases && !phaseEdges && !inventory && !retry && !creationAuthority && !authoritySchemaOnly && !authority && !reconciliation && !ownerFence && !decision, ownCoreRollback: core, ownBaseReleaseRollback: release, ownBaseEdgesRollback: edges, ownFirstAccountRollback: firstAccount, ownAccountingPhasesRollback: phases, ownAccountingPhaseEdgesRollback: phaseEdges, ownLegacyInventoryRollback: inventory, ownAccountingRetryRollback: retry, ownAuthorizedAccountingRollback: authority, ownAuthoritySchemaRollback: authoritySchemaOnly, ownCreationAuthorityRollback: creationAuthority, ownLegacyReleaseRollback: reconciliation,
    ownOwnerFence: ownerFence, decisionSchema, applied: false }));
}
main().catch((error: unknown) => {
  // Only bounded categories and source line numbers; never error messages, SQL or connection data.
  const category = error instanceof assert.AssertionError ? "assertion" :
    error instanceof Prisma.PrismaClientKnownRequestError && /^[A-Z][0-9]{4}$/.test(error.code) ? error.code : "unknown";
  const location = error instanceof Error ? error.stack?.match(/(?:test-native-worklog-validation-inventory-rollback|test-native-worklog-legacy-validation-rollback|test-native-worklog-worker-eligibility-rollback|test-native-worklog-creation-authority-rollback|test-native-worklog-authority-schema|test-native-worklog-authorized-accounting-rollback|test-native-worklog-accounting-retry-rollback|test-native-worklog-combined-catalog|test-native-worklog-legacy-inventory-rollback|test-native-worklog-accounting-phase-edges-rollback|test-native-worklog-accounting-phases-rollback|test-native-worklog-first-account-rollback|test-native-worklog-base-edges-rollback|test-native-worklog-base-release-rollback|test-native-worklog-core-rollback|test-native-worklog-decision-schema|test-native-worklog-legacy-release-rollback|test-native-worklog-owner-fence|check-native-worklog-schema)\.ts:[0-9]+:[0-9]+/)?.[0] : undefined;
  const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta?.code : undefined;
  const sqlState = typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
  console.error(JSON.stringify({ outcome: "failed", category, location, sqlState })); process.exitCode = 1;
}).finally(() => prisma.$disconnect());
