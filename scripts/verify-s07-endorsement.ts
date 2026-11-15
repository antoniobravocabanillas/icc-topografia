import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser } from "playwright";
import { assertWorkspaceAdministrationTestTarget, workspaceAdministrationStagingOrigin as staging,
  workspaceAdministrationStagingSite as siteId } from "./lib/workspace-administration-test-target";
import { seedSharing, type SharingFixture } from "./lib/s06-sharing-fixtures";
import { cleanEndorsements, exerciseEndorsement } from "./lib/s07-endorsement-scenario";

async function confirmCandidate(origin: string, commit: string | undefined, deployId: string | undefined) {
  assert.match(commit ?? "", /^[a-f0-9]{40}$/);
  assert.match(deployId ?? "", /^[a-f0-9]{24}$/);
  const res = await fetch(origin + "/__terraqo_s22_candidate.json?deploy=" + deployId,
    { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000) });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { kind: "workspace-administration", siteId, commit, deployId });
}

export async function verifyS07Endorsement(origin = staging) {
  const commit = process.env.S22_STAGING_CANDIDATE_SHA, deployId = process.env.DEPLOY_ID;
  let phase = "target";
  let db: PrismaClient | undefined, browser: Browser | undefined, fixture: SharingFixture | undefined;
  try {
    assert.equal(assertWorkspaceAdministrationTestTarget(process.env, origin), "staging");
    assert.equal(process.env.TERRAQO_SCOPED_ENDORSEMENTS_V1, "true");
    phase = "candidate";
    await confirmCandidate(origin, commit, deployId);
    db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    try {
      phase = "database-identity";
      const identity = await db.$queryRaw<{ role: string; database: string }[]>`SELECT current_user AS role, current_database() AS database`;
      assert.deepEqual(identity, [{ role: "terraqo_staging_runtime", database: "postgres" }]);
      phase = "fixtures";
      fixture = await seedSharing(db);
      phase = "browser";
      browser = await chromium.launch();
      await exerciseEndorsement(db, browser, fixture, origin, name => { phase = name; });
      phase = "final-candidate";
      await confirmCandidate(origin, commit, deployId);
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
  } catch (error) {
    // Assertion diffs and Playwright call logs may contain private payloads, cookies or connection URLs.
    const location = error instanceof Error ? error.stack?.match(/(?:verify-s07-endorsement|s0[67]-[a-z-]+|workspace-administration-test-target)\.ts:\d+:\d+/)?.[0] : undefined;
    console.error(JSON.stringify({ gate: "s07", phase, run: fixture?.run, location }));
    throw new Error("S07 failed during " + phase);
  }
  const receipt = { gate: "s07", passed: true, run: fixture.run, commit, deployId, databaseCleanup: "verified",
    recipientVerified: true, draftSent: true, scopedRead: true, creationReplay: true, resendCooldown: true,
    versionedNotice: true, expiredAndRevokedHidden: true, ownerDecisionTracePreserved: true, worklogEntryLink: true };
  console.log(JSON.stringify(receipt));
  return receipt;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  verifyS07Endorsement().catch(() => { process.exitCode = 1; });
}
