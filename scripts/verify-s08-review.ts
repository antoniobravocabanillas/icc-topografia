import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser } from "playwright";
import { seedSharing, type SharingFixture } from "./lib/s06-sharing-fixtures";
import { cleanEndorsements } from "./lib/s07-endorsement-scenario";
import { exerciseReview } from "./lib/s08-review-scenario";
import {
  assertWorkspaceAdministrationTestTarget,
  workspaceAdministrationStagingOrigin as staging,
  workspaceAdministrationStagingSite as siteId,
} from "./lib/workspace-administration-test-target";

export async function verifyS08Review(origin = staging) {
  const commit = process.env.S22_STAGING_CANDIDATE_SHA;
  const deployId = process.env.DEPLOY_ID;
  let phase = "target";
  let db: PrismaClient | undefined, browser: Browser | undefined, fixture: SharingFixture | undefined;
  async function checkCandidate() {
    assert.match(commit ?? "", /^[a-f0-9]{40}$/);
    assert.match(deployId ?? "", /^[a-f0-9]{24}$/);
    const response = await fetch(origin + "/__terraqo_s22_candidate.json?deploy=" + deployId, {
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { kind: "workspace-administration", siteId, commit, deployId });
  }
  try {
    assert.equal(assertWorkspaceAdministrationTestTarget(process.env, origin), "staging");
    assert.equal(process.env.TERRAQO_SCOPED_ENDORSEMENTS_V1, "true");
    phase = "candidate";
    await checkCandidate();
    db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    try {
      phase = "database-identity";
      const identity = await db.$queryRaw`SELECT current_user AS role, current_database() AS database`;
      assert.deepEqual(identity, [{ role: "terraqo_staging_runtime", database: "postgres" }]);
      phase = "fixtures";
      fixture = await seedSharing(db);
      phase = "browser";
      browser = await chromium.launch();
      await exerciseReview(db, browser, fixture, origin, name => { phase = name; });
    } finally {
      try {
        try { await browser?.close(); }
        finally {
          if (fixture) {
            try { await cleanEndorsements(db, fixture); }
            catch (error) { phase = "cleanup"; throw error; }
          }
        }
      } finally { await db.$disconnect(); }
    }
    phase = "final-candidate";
    await checkCandidate();
    const receipt = { gate: "s08", passed: true, run: fixture.run, commit, deployId, databaseCleanup: "verified",
      noticeOpened: true, multiAspectReview: true, commentsValidated: true, lostResponseReplayed: true,
      originalRevisionVerified: true, missingHistoricalContextBlocked: true, personalAuthority: true,
      organizationAuthority: true, revokedAuthorityDenied: true };
    console.log(JSON.stringify(receipt));
    return receipt;
  } catch (error) {
    // Playwright call logs and assertion diffs may contain private content or credentials.
    const location = error instanceof Error ? error.stack?.match(/(?:verify-s08-review|s0[678]-[a-z-]+|workspace-administration-test-target)\.ts:\d+:\d+/)?.[0] : undefined;
    console.error(JSON.stringify({ gate: "s08", phase, run: fixture?.run, location }));
    throw new Error("S08 failed during " + phase);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  verifyS08Review().catch(() => { process.exitCode = 1; });
}
