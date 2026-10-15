import "server-only";
import assert from "node:assert/strict";
import { prisma as db } from "../lib/prisma";
import { bootstrapNativeWorklogInTransaction, nativeBootstrapBaseline } from "./native-worklog-bootstrap";
import { readNativeWorklogCompleteCatalog, NATIVE_WORKLOG_COMPLETE_PIN } from "../lib/server/native-worklog-complete-catalog";

// Use the application's exact transport, as the existing inventory does. The
// Python caller captures all child output and forwards only allowlisted codes.
const rollback = new Error("NATIVE_BOOTSTRAP_CHECK_ROLLBACK");
const options = { maxWait: 1000, timeout: 30000 };
let phase = "startup";
async function snapshot() {
  return db.$transaction(async tx => {
    phase = "snapshot-read-only";
    await tx.$executeRaw`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`;
    await tx.$executeRaw`SET LOCAL statement_timeout='10s'`;
    // pg_get_constraintdef depends on search_path. Match the inventory's canonical
    // schema on both transports so qualified names cannot create false drift.
    await tx.$executeRaw`SET LOCAL search_path=icc,pg_catalog`;
    phase = "workspace-identity";
    // Tenant identity and catalog belong to the same read-only snapshot.
    const [workspace] = await tx.$queryRaw<{ present: boolean }[]>`SELECT EXISTS (
      SELECT 1 FROM icc."TerraqoWorkspace" w JOIN icc."Company" c ON c."terraqoWorkspaceId"=w.id
      WHERE w.slug=${"icc-topografia"} AND w.active=true
        AND c.document=${"20616116313"} AND c."deletedAt" IS NULL
    ) AS present`;
    assert.equal(workspace?.present, true);
    phase = "snapshot-baseline";
    let components: Readonly<Record<string, string>> = {};
    const baseline = await nativeBootstrapBaseline(tx, hashes => { components = hashes; });
    phase = "snapshot-catalog";
    return { baseline, catalog: await readNativeWorklogCompleteCatalog(tx), components };
  }, { maxWait: 1000, timeout: 15000 });
}
async function main() {
  assert.ok(process.argv.length === 3 && ["--snapshot", "--check"].includes(process.argv[2]));
  if (process.argv[2] === "--check") {
    assert.ok(/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL ?? ""));
  }
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  const before = await snapshot();
  if (process.argv[2] === "--snapshot") { console.log(JSON.stringify(before)); return; }
  assert.equal(process.env.TERRAQO_NATIVE_BOOTSTRAP_BASELINE, before.baseline);
  let checked = false;
  phase = "rollback-rehearsal";
  try {
    await db.$transaction(async tx => {
      // Reject drift before issuing DDL; the helper repeats its catalog checks under locks.
      assert.equal(await nativeBootstrapBaseline(tx), before.baseline);
      const result = await bootstrapNativeWorklogInTransaction(tx);
      assert.equal(result.baseline, before.baseline);
      assert.equal(result.fingerprint, NATIVE_WORKLOG_COMPLETE_PIN);
      checked = true;
      // Check mode ALWAYS rolls back, including an already exact catalog.
      throw rollback;
    }, options);
  } catch (error) { if (error !== rollback || !checked) throw error; }
  assert.deepEqual(await snapshot(), before);
  console.log(JSON.stringify({ mode: "checked-in-rollback", fingerprint: NATIVE_WORKLOG_COMPLETE_PIN,
    baseline: before.baseline, initialState: before.catalog.state, constraints: 36, indexes: 16, applied: false }));
}
main().catch((error: unknown) => {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  console.error(JSON.stringify({ outcome: "failed", phase,
    category: /^(?:P[0-9]{4}|ERR_ASSERTION)$/.test(code) ? code : "unknown" }));
  process.exitCode = 1;
}).finally(() => db.$disconnect());
