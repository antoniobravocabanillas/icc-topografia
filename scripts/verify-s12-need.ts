import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { sharingSession } from "./lib/s06-sharing-browser";
import { needJourney } from "./lib/s12-need-browser";
import { assertNeedCompanyRemoved, cleanNeedCompany, needFixture, seedNeedCompany } from "./lib/s12-need-fixture";
import { assertWorkspaceAdministrationTestTarget, workspaceAdministrationStagingOrigin as staging,
  workspaceAdministrationStagingSite as siteId } from "./lib/workspace-administration-test-target";

async function exerciseNeed(origin: string, commit: string, role: string, phase: (step: string) => void) {
  const fixture = needFixture(commit);
  const { run, workspace } = fixture;
  const options = { datasourceUrl: process.env.DATABASE_URL };
  const db = new PrismaClient(options);
  const requirementIds: string[] = [];
  try {
    phase("database-identity");
    assert.deepEqual(await db.$queryRaw`SELECT current_user AS role, current_database() AS database`,
      [{ role, database: "postgres" }]);
    phase("seed-company");
    console.log("S12_FIXTURE_RUN", run, workspace);
    await seedNeedCompany(db, fixture);
    try {
      phase("chromium");
      const browser = await chromium.launch();
      try {
        phase("company-session");
        const context = await sharingSession(browser, origin, fixture.owner, fixture.password);
        const blockedWrites: string[] = [];
        await context.route("**/api/**", async route => {
          const request = route.request();
          const url = new URL(request.url());
          if (url.origin !== origin) return route.abort();
          if (["GET", "HEAD"].includes(request.method()) || url.pathname === "/api/auth/presence"
            || (request.method() === "POST" && /^\/api\/v1\/work-needs(?:\/suggestions|\/[a-z0-9]+\/revisions)?$/.test(url.pathname))) {
            return route.fallback();
          }
          blockedWrites.push(url.pathname);
          return route.abort();
        });
        await needJourney(await context.newPage(), db, fixture, origin, requirementIds, phase);
        assert.deepEqual(blockedWrites, []);
        await context.close();
      } finally { await browser.close(); }
    } finally {
      try {
        await cleanNeedCompany(db, fixture);
        const independent = new PrismaClient(options);
        try { await assertNeedCompanyRemoved(independent, fixture, requirementIds); }
        finally { await independent.$disconnect(); }
        console.log("S12_CLEANUP_VERIFIED", run);
      } catch (error) {
        phase("cleanup-" + run);
        throw error;
      }
    }
    return { run, workspace, browserWidths: [1440, 375, 320], suggestions: "local",
      priorRevisionAndDossierUnchanged: true, databaseCleanup: "independent-readback" };
  } finally { await db.$disconnect(); }
}

export async function verifyS12Need(origin = staging) {
  let phase = "target";
  try {
    assert.equal(assertWorkspaceAdministrationTestTarget(process.env, origin), "staging");
    assert.equal(process.env.TERRAQO_DISCOVERY_NEEDS_V1, "true");
    const commit = process.env.S22_STAGING_CANDIDATE_SHA, deployId = process.env.DEPLOY_ID;
    assert.ok(commit && /^[a-f0-9]{40}$/.test(commit));
    assert.ok(deployId && /^[a-f0-9]{24}$/.test(deployId));
    const pilot = process.env.TERRAQO_B5_PILOT_WORKSPACE_IDS?.split(",").map(id => id.trim());
    const workspace = "s12-need-" + commit.slice(0, 16);
    assert.equal(process.env.TERRAQO_NEED_SUGGESTIONS_LOCAL_WORKSPACE, workspace);
    assert.ok(pilot?.includes(workspace) || pilot?.includes("*"), "S12 company must have access to the existing pilot");
    async function confirmCandidate() {
      const marker = await fetch(origin + "/__terraqo_s22_candidate.json?deploy=" + deployId,
        { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000) });
      assert.equal(marker.status, 200);
      assert.deepEqual(await marker.json(), { kind: "workspace-administration", siteId, commit, deployId });
    }
    phase = "candidate";
    await confirmCandidate();
    const result = await exerciseNeed(origin, commit, "terraqo_staging_runtime", step => { phase = step; });
    phase = "final-candidate";
    await confirmCandidate();
    const receipt = { gate: "s12", passed: true, commit, deployId, ...result };
    console.log(JSON.stringify(receipt));
    return receipt;
  } catch (error) {
    const location = error instanceof Error ? error.stack?.match(/(?:verify-s12-need|s12-need-[a-z-]+)\.ts:\d+:\d+/)?.[0] : undefined;
    console.error(JSON.stringify({ gate: "s12", phase, location }));
    throw new Error("S12 failed during " + phase);
  }
}

export async function rehearseS12Need(origin: string, commit: string) {
  assert.equal(assertWorkspaceAdministrationTestTarget(process.env, origin), "local");
  return exerciseNeed(origin, commit, "terraqo_s22_test", phase => console.log("S12 local", phase));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  verifyS12Need().catch(() => { process.exitCode = 1; });
}
