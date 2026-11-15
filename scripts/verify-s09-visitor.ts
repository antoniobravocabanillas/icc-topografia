import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { s24BlobRun } from "./lib/s24-blob-fixtures.mjs";
import { exerciseVisitor } from "./lib/s09-visitor-scenario";
import { assertWorkspaceAdministrationTestTarget, workspaceAdministrationStagingOrigin as staging,
  workspaceAdministrationStagingSite as siteId } from "./lib/workspace-administration-test-target";

export async function verifyS09Visitor(origin = staging) {
  let phase = "target";
  const commit = process.env.S22_STAGING_CANDIDATE_SHA, deployId = process.env.DEPLOY_ID;
  async function confirmCandidate() {
    assert.match(commit ?? "", /^[0-9a-f]{40}$/);
    assert.match(deployId ?? "", /^[0-9a-f]{24}$/);
    const marker = await fetch(origin + "/__terraqo_s22_candidate.json?deploy=" + deployId, {
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000),
    });
    assert.equal(marker.status, 200);
    assert.deepEqual(await marker.json(), { kind: "workspace-administration", siteId, commit, deployId });
  }
  try {
    assert.equal(assertWorkspaceAdministrationTestTarget(process.env, origin), "staging");
    for (const key of ["TERRAQO_WORK_CASES_V1", "TERRAQO_WORKSPACE_PUBLICATION_V1", "TERRAQO_SCOPED_SHARING_V1"])
      assert.equal(process.env[key], "true");
    const blobRun = s24BlobRun(process.env.PLATFORM_STAGING_S24_BLOB_RUN);
    phase = "candidate";
    await confirmCandidate();
    phase = "database-identity";
    const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    let run: string;
    try {
      assert.deepEqual(await db.$queryRaw`SELECT current_user AS role, current_database() AS database`,
        [{ role: "terraqo_staging_runtime", database: "postgres" }]);
      run = await exerciseVisitor(db, origin, name => { phase = name; });
    } finally { await db.$disconnect(); }
    phase = "final-candidate";
    await confirmCandidate();
    const receipt = { gate: "s09", passed: true, commit, deployId, run, blobRun, blobs: "borrowed-s24",
      databaseCleanup: "verified", browserWidths: [1440, 375, 320], publicVisitor: "anonymous",
      pdfDownloaded: true, contactContinuation: true, scopedCaseRevoked: true, limitedGrantRevoked: true };
    console.log(JSON.stringify(receipt));
    return receipt;
  } catch (error) {
    // Never emit raw browser logs, HTTP bodies, database URLs, passwords, or cookies.
    const location = error instanceof Error ? error.stack?.match(/(?:verify-s09-visitor|s09-[a-z-]+|s06-[a-z-]+)\.ts:\d+:\d+/)?.[0] : undefined;
    console.error(JSON.stringify({ gate: "s09", phase, location }));
    throw new Error("S09 failed during " + phase);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  verifyS09Visitor().catch(() => { process.exitCode = 1; });
}
