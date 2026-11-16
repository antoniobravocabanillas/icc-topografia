import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { sharingSession } from "./lib/s06-sharing-browser";
import { s24BlobRun } from "./lib/s24-blob-fixtures.mjs";
import { discoveryJourney } from "./lib/s13-discovery-browser";
import { cleanDiscovery, pilotWorkspace, seedDiscovery, verifyDiscoveryRemoved } from "./lib/s13-discovery-fixture";
import { assertWorkspaceAdministrationTestTarget, workspaceAdministrationStagingOrigin as staging,
  workspaceAdministrationStagingSite as siteId } from "./lib/workspace-administration-test-target";

async function exercise(origin: string, commit: string, role: string, phase: (value: string) => void) {
  phase("blob-manifest");
  const blobRun = s24BlobRun(process.env.PLATFORM_STAGING_S24_BLOB_RUN);
  const workspace = pilotWorkspace(commit);
  const pilot = process.env.TERRAQO_B5_PILOT_WORKSPACE_IDS?.split(",").map(value => value.trim());
  assert.ok(pilot?.includes(workspace) || pilot?.includes("*"), "S13 workspace must be in the employer pilot");
  assert.equal(process.env.TERRAQO_DISCOVERY_NEEDS_V1, "true");
  assert.equal(process.env.TERRAQO_SCOPED_SHARING_V1, "true");
  const options = { datasourceUrl: process.env.DATABASE_URL };
  const db = new PrismaClient(options);
  try {
    phase("database-identity");
    assert.deepEqual(await db.$queryRaw`SELECT current_user AS role, current_database() AS database`, [{ role, database: "postgres" }]);
    phase("seed");
    const f = await seedDiscovery(db, commit, blobRun);
    const revisions: string[] = [];
    try {
      phase("chromium");
      const browser = await chromium.launch();
      try {
        phase("authenticated-sessions");
        const company = await sharingSession(browser, origin, f.owner, f.password);
        const publisher = await sharingSession(browser, origin, f.publisher, f.password);
        const blocked: string[] = [];
        await company.route("**/api/**", route => {
          const req = route.request(), url = new URL(req.url());
          if (url.origin === origin && (["GET", "HEAD"].includes(req.method()) ||
              req.method() === "POST" && ["/api/v1/evaluation-dossiers", "/api/auth/presence"].includes(url.pathname))) return route.fallback();
          blocked.push(url.pathname);
          return route.abort();
        });
        const screen = await company.newPage();
        await discoveryJourney(screen, publisher, db, f, origin, revisions, phase);
        assert.deepEqual(blocked, []);
      } finally { await browser.close(); }
    } finally {
      try {
        await cleanDiscovery(db, f);
        const independent = new PrismaClient(options);
        try { await verifyDiscoveryRemoved(independent, f, revisions); }
        finally { await independent.$disconnect(); }
        console.log("S13_CLEANUP_VERIFIED", f.run);
      } catch (error) {
        phase("cleanup-" + f.run);
        throw error;
      }
    }
    return { run: f.run, workspace, blobRun, previewAndDownload: "s24-exact-bytes", browserWidths: [1440, 375, 320], databaseCleanup: "independent-readback",
      pinnedSource: "PUBLIC_SELECTION", derivedSummaryRevoked: true };
  } finally { await db.$disconnect(); }
}

export async function verifyS13Discovery(origin = staging) {
  let phase = "target";
  try {
    assert.equal(assertWorkspaceAdministrationTestTarget(process.env, origin), "staging");
    const commit = process.env.S22_STAGING_CANDIDATE_SHA, deployId = process.env.DEPLOY_ID;
    assert.ok(commit && /^[a-f0-9]{40}$/.test(commit));
    assert.ok(deployId && /^[a-f0-9]{24}$/.test(deployId));
    async function confirmCandidate() {
      const marker = await fetch(origin + "/__terraqo_s22_candidate.json?deploy=" + deployId,
        { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000) });
      assert.equal(marker.status, 200);
      assert.deepEqual(await marker.json(), { kind: "workspace-administration", siteId, commit, deployId });
    }
    phase = "candidate";
    await confirmCandidate();
    const result = await exercise(origin, commit, "terraqo_staging_runtime", step => { phase = step; });
    phase = "final-candidate";
    await confirmCandidate();
    const receipt = { gate: "s13", passed: true, commit, deployId, ...result };
    console.log(JSON.stringify(receipt));
    return receipt;
  } catch (error) {
    const location = error instanceof Error ? error.stack?.match(/(?:verify-s13-discovery|s13-discovery-[a-z]+)\.ts:\d+:\d+/)?.[0] : undefined;
    console.error(JSON.stringify({ gate: "s13", phase, location }));
    throw new Error("S13 failed during " + phase);
  }
}

export async function rehearseS13Discovery(origin: string, commit: string) {
  assert.equal(assertWorkspaceAdministrationTestTarget(process.env, origin), "local");
  return exercise(origin, commit, "terraqo_s22_test", step => console.log("S13 local", step));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  verifyS13Discovery().catch(() => { process.exitCode = 1; });
}
