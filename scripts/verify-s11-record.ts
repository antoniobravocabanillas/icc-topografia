import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { sharingSession } from "./lib/s06-sharing-browser";
import { anonymousSession } from "./lib/s09-visitor-reads";
import { recordJourney, recordWidths } from "./lib/s11-record-browser";
import { assertRecordRemoved, cleanRecord, recordFixture, seedRecord } from "./lib/s11-record-fixture";
import { publicRecordReads, withdrawnReads } from "./lib/s11-record-reads";
import { s24BlobRun } from "./lib/s24-blob-fixtures.mjs";
import { assertWorkspaceAdministrationTestTarget, workspaceAdministrationStagingOrigin as staging,
  workspaceAdministrationStagingSite as siteId } from "./lib/workspace-administration-test-target";

async function exerciseRecord(origin: string, role: string, phase: (s: string) => void) {
  phase("blob-manifest");
  const blobRun = s24BlobRun(process.env.PLATFORM_STAGING_S24_BLOB_RUN);
  const f = recordFixture(blobRun);
  const options = { datasourceUrl: process.env.DATABASE_URL };
  const db = new PrismaClient(options);
  try {
    phase("database-identity");
    assert.deepEqual(await db.$queryRaw`SELECT current_user AS role, current_database() AS database`,
      [{ role, database: "postgres" }]);
    await assertRecordRemoved(db, f);
    console.log("S11_FIXTURE_RUN", f.run);
    try {
      phase("seed");
      await seedRecord(db, f);
      phase("chromium");
      const browser = await chromium.launch();
      try {
        const visitor = await sharingSession(browser, origin);
        await anonymousSession(visitor);
        await publicRecordReads(visitor, f, phase);
        for (const width of recordWidths) {
          const device = await sharingSession(browser, origin);
          try {
            await device.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
            await anonymousSession(device);
            await recordJourney(await device.newPage(), origin, f, width, phase);
            await anonymousSession(device);
          } finally { await device.close(); }
        }
        phase("withdraw-record");
        const hidden = await db.terraqoWorklogEntry.updateMany({ where: {
          id: f.record, professionalProfileId: f.profile, authorId: f.owner, visibility: "PUBLIC", lifecycle: "PUBLISHED",
        }, data: { visibility: "PRIVATE" } });
        assert.equal(hidden.count, 1);
        phase("withdrawn-readback");
        await withdrawnReads(visitor, f);
        await anonymousSession(visitor);
      } finally { await browser.close(); }
    } finally {
      try {
        await cleanRecord(db, f);
        const independent = new PrismaClient(options);
        try { await assertRecordRemoved(independent, f); }
        finally { await independent.$disconnect(); }
        console.log("S11_CLEANUP_VERIFIED", f.run);
      } catch (error) {
        phase("cleanup-" + f.run);
        throw error;
      }
    }
    return { run: f.run, blobRun, blobs: "borrowed-s24", normalizedPlans: 2, browserWidths: recordWidths,
      publicVisitor: "anonymous", legacyTrace: true, canonicalShare: true, historicalLink: true,
      withdrawnMetadataAndFiles: true, databaseCleanup: "independent-readback" };
  } finally { await db.$disconnect(); }
}

export async function verifyS11Record(origin = staging) {
  let phase = "target";
  try {
    assert.equal(assertWorkspaceAdministrationTestTarget(process.env, origin), "staging");
    const commit = process.env.S22_STAGING_CANDIDATE_SHA, deployId = process.env.DEPLOY_ID;
    assert.match(commit ?? "", /^[0-9a-f]{40}$/);
    assert.match(deployId ?? "", /^[0-9a-f]{24}$/);
    async function confirmCandidate() {
      const response = await fetch(origin + "/__terraqo_s22_candidate.json?deploy=" + deployId,
        { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000) });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { kind: "workspace-administration", siteId, commit, deployId });
    }
    phase = "candidate";
    await confirmCandidate();
    const result = await exerciseRecord(origin, "terraqo_staging_runtime", name => { phase = name; });
    phase = "final-candidate";
    await confirmCandidate();
    const receipt = { gate: "s11", passed: true, commit, deployId, ...result };
    console.log(JSON.stringify(receipt));
    return receipt;
  } catch (error) {
    const location = error instanceof Error ? error.stack?.match(/(?:verify-s11-record|s11-[a-z-]+)\.ts:\d+:\d+/)?.[0] : undefined;
    console.error(JSON.stringify({ gate: "s11", phase, location }));
    throw new Error("S11 failed during " + phase);
  }
}

export async function rehearseS11Record(origin: string) {
  assert.equal(assertWorkspaceAdministrationTestTarget(process.env, origin), "local");
  return exerciseRecord(origin, "terraqo_s22_test", phase => console.log("S11 local", phase));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  verifyS11Record().catch(() => { process.exitCode = 1; });
}
