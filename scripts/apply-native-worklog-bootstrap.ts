import "server-only";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { bootstrapNativeWorklogInTransaction, nativeBootstrapBaseline } from "./native-worklog-bootstrap";
import { NATIVE_WORKLOG_COMPLETE_PIN } from "../lib/server/native-worklog-complete-catalog";

const db = new PrismaClient({ log: [] });
async function main() {
  assert.deepEqual(process.argv.slice(2), ["--apply"]);
  assert.ok(/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL ?? ""));
  assert.equal(process.env.TERRAQO_NATIVE_BOOTSTRAP_MAINTENANCE, "native-worklog:maintenance");
  const expected = process.env.TERRAQO_NATIVE_BOOTSTRAP_BASELINE;
  assert.match(expected ?? "", /^[a-f0-9]{64}$/);
  const result = await db.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL search_path=icc,pg_catalog`;
    await tx.$executeRaw`SET LOCAL statement_timeout='10s'`;
    assert.equal(await nativeBootstrapBaseline(tx), expected);
    const [workspace] = await tx.$queryRaw<{ present: boolean }[]>`SELECT EXISTS (
      SELECT 1 FROM icc."TerraqoWorkspace" w JOIN icc."Company" c ON c."terraqoWorkspaceId"=w.id
      WHERE w.slug=${"icc-topografia"} AND w.active=true AND w."deletedAt" IS NULL
        AND c.document=${"20616116313"} AND c."deletedAt" IS NULL
    ) AS present`;
    assert.equal(workspace?.present, true);
    const outcome = await bootstrapNativeWorklogInTransaction(tx);
    // The helper re-reads after taking its advisory/parent locks. Any drift before
    // or during lock admission aborts the complete DDL transaction.
    assert.equal(outcome.baseline, expected);
    assert.equal(outcome.fingerprint, NATIVE_WORKLOG_COMPLETE_PIN);
    return outcome;
  }, { maxWait: 1000, timeout: 30000 });
  // Caller must verify both connections after this awaited commit. A lost child
  // response is uncertainty; this script never automatically repeats the write.
  console.log(JSON.stringify(result));
}
main().catch(() => {
  console.error(JSON.stringify({ outcome: "uncertain", automatic_retry: false }));
  process.exitCode = 1;
}).finally(() => db.$disconnect());
