import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { archiveFixture, assertArchiveRemoved, cleanArchive, seedArchive } from "./lib/s10-archive-fixtures";
import { archiveJourney, archiveReads, archiveWidths } from "./lib/s10-archive-browser";
import { sharingSession } from "./lib/s06-sharing-browser";
import { anonymousSession } from "./lib/s09-visitor-reads";
import { assertWorkspaceAdministrationTestTarget, workspaceAdministrationStagingOrigin as staging,
  workspaceAdministrationStagingSite as siteId } from "./lib/workspace-administration-test-target";

async function exerciseArchive(origin: string, role: string, phase: (name: string) => void) {
  const fixture = archiveFixture();
  const options = { datasourceUrl: process.env.DATABASE_URL };
  const db = new PrismaClient(options);
  try {
    phase("database-identity");
    assert.deepEqual(await db.$queryRaw`SELECT current_user AS role, current_database() AS database`,
      [{ role, database: "postgres" }]);
    phase("seed");
    console.log("S10_FIXTURE_RUN", fixture.run);
    await seedArchive(db, fixture);
    try {
      phase("browser");
      const browser = await chromium.launch();
      try {
        const visitor = await sharingSession(browser, origin);
        await anonymousSession(visitor);
        phase("public-archive-reads");
        await archiveReads(visitor, fixture);
        for (const width of archiveWidths) {
          const device = await sharingSession(browser, origin);
          try {
            const page = await device.newPage();
            await archiveJourney(page, origin, fixture, width, phase);
            await anonymousSession(device);
          } finally { await device.close(); }
        }
        phase("anonymous-session");
        await anonymousSession(visitor);
      } finally { await browser.close(); }
    } finally {
      try {
        await cleanArchive(db, fixture);
        const readback = new PrismaClient(options);
        try { await assertArchiveRemoved(readback, fixture); }
        finally { await readback.$disconnect(); }
      } catch (error) {
        phase("cleanup-" + fixture.run);
        throw error;
      }
    }
    return { run: fixture.run, publicRecords: fixture.visible.length, excludedRecords: fixture.hidden.length,
      browserWidths: archiveWidths, publicVisitor: "anonymous", databaseCleanup: "independent-readback" };
  } finally { await db.$disconnect(); }
}

export async function verifyS10Archive(origin = staging) {
  let phase = "target";
  try {
    assert.equal(assertWorkspaceAdministrationTestTarget(process.env, origin), "staging");
    const commit = process.env.S22_STAGING_CANDIDATE_SHA, deployId = process.env.DEPLOY_ID;
    assert.match(commit ?? "", /^[0-9a-f]{40}$/);
    assert.match(deployId ?? "", /^[0-9a-f]{24}$/);
    async function confirmCandidate() {
      const marker = await fetch(origin + "/__terraqo_s22_candidate.json?deploy=" + deployId,
        { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000) });
      assert.equal(marker.status, 200);
      assert.deepEqual(await marker.json(), { kind: "workspace-administration", siteId, commit, deployId });
    }
    phase = "candidate";
    await confirmCandidate();
    const result = await exerciseArchive(origin, "terraqo_staging_runtime", name => { phase = name; });
    phase = "final-candidate";
    await confirmCandidate();
    const receipt = { gate: "s10", passed: true, commit, deployId, ...result };
    console.log(JSON.stringify(receipt));
    return receipt;
  } catch (error) {
    const location = error instanceof Error ? error.stack?.match(/(?:verify-s10-archive|s10-archive-[a-z-]+)\.ts:\d+:\d+/)?.[0] : undefined;
    console.error(JSON.stringify({ gate: "s10", phase, location }));
    throw new Error("S10 failed during " + phase);
  }
}

// Only the disposable PostgreSQL/Next.js rehearsal uses this entry point.
export async function rehearseS10Archive(origin: string) {
  assert.equal(assertWorkspaceAdministrationTestTarget(process.env, origin), "local");
  return exerciseArchive(origin, "terraqo_s22_test", phase => console.log("S10 local", phase));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  verifyS10Archive().catch(() => { process.exitCode = 1; });
}
