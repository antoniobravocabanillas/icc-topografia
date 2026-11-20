import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { sharingSession } from "./lib/s06-sharing-browser";
import { s24BlobRun } from "./lib/s24-blob-fixtures.mjs";
import { pilotWorkspace } from "./lib/s13-discovery-fixture";
import { cleanEvaluation, seedEvaluation, verifyEvaluationRemoved } from "./lib/s14-evaluation-fixture";
import { evaluationJourney } from "./lib/s14-evaluation-browser";
import { assertWorkspaceAdministrationTestTarget, workspaceAdministrationStagingOrigin as staging,
  workspaceAdministrationStagingSite as siteId } from "./lib/workspace-administration-test-target";

/** No dotenv, database fallback, provider mock, remote schema changes, or AI-success fixture. */
export function assertS14Prerequisites(origin: string, commit: string) {
  const target = assertWorkspaceAdministrationTestTarget(process.env, origin);
  assert.equal(new URL(origin).origin, origin, "An exact application origin is required");
  const workspace = pilotWorkspace(commit);
  assert.equal(process.env.S14_STAGING_EVALUATION_GATE, "evaluation");
  for (const key of ["TERRAQO_DISCOVERY_NEEDS_V1", "TERRAQO_SCOPED_SHARING_V1"])
    assert.equal(process.env[key], "true", key + " must be enabled");
  assert.ok(["true", "false"].includes(process.env.TERRAQO_EVIDENCE_ANALYSIS_V1 || ""), "Explicit analysis flag required");
  if (target === "staging") assert.equal(process.env.TERRAQO_EVIDENCE_ANALYSIS_V1, "false", "Preserve staging disabled analysis");
  assert.ok((process.env.TERRAQO_B5_PILOT_WORKSPACE_IDS || "").split(",").map(value => value.trim())
    .some(value => value === "*" || value === workspace), "S14 uses the existing S13 pilot workspace");
  assert.equal((process.env.TERRAQO_EVIDENCE_ANALYSIS_PROVIDER || "off").trim().toLowerCase(), "off",
    "This bounded journey requires provider=off in runner and application; external AI success is not tested");
  return { target, workspace, blobRun: s24BlobRun(process.env.PLATFORM_STAGING_S24_BLOB_RUN) };
}

async function exercise(origin: string, commit: string, phase: (value: string) => void) {
  const { target, workspace, blobRun } = assertS14Prerequisites(origin, commit);
  const options = { datasourceUrl: process.env.DATABASE_URL }, db = new PrismaClient(options);
  try {
    phase("database-identity");
    assert.deepEqual(await db.$queryRaw`SELECT current_user AS role, current_database() AS database`,
      [{ role: target === "local" ? "terraqo_s22_test" : "terraqo_staging_runtime", database: "postgres" }]);
    phase("seed");
    const f = await seedEvaluation(db, commit, blobRun), dossierIds: string[] = [];
    try {
      const browser = await chromium.launch();
      try {
        phase("authenticated-sessions");
        const company = await sharingSession(browser, origin, f.owner, f.password);
        const other = await sharingSession(browser, origin, f.otherOwner, f.password);
        const publisher = await sharingSession(browser, origin, f.publisher, f.password);
        const anonymous = await sharingSession(browser, origin);
        await evaluationJourney(company, other, publisher, anonymous, db, f, origin, dossierIds, phase);
      } finally { await browser.close(); }
    } finally {
      // Separate client and connection: cleanup success is never inferred from DELETE counts.
      phase("cleanup-" + f.run);
      await cleanEvaluation(db, f);
      const independent = new PrismaClient(options);
      try { await verifyEvaluationRemoved(independent, f, dossierIds); }
      finally { await independent.$disconnect(); }
      console.log("S14_CLEANUP_VERIFIED", f.run);
    }
    return { run: f.run, workspace, blobRun, databaseCleanup: "independent-readback",
      manualAssessmentNotesQuestions: true, sourceViewer: "exact-version-title-only", isolation: ["anonymous", "other-company", "publisher"],
      sourceRevocation: "derived-data-hidden", providerUnavailable: process.env.TERRAQO_EVIDENCE_ANALYSIS_V1 === "true"
        ? "local-real-503-PROVIDER_NOT_CONFIGURED" : "disabled-real-404-no-analysis-control",
      externalAiSuccess: "NOT_EXERCISED_PROVIDER_UNAVAILABLE", browserWidths: [1440, 375, 320] };
  } finally { await db.$disconnect(); }
}

export async function verifyS14Evaluation(origin = staging) {
  let phase = "target", journeyPhase: string | undefined;
  try {
    const commit = process.env.S22_STAGING_CANDIDATE_SHA, deployId = process.env.DEPLOY_ID;
    assert.ok(commit && /^[a-f0-9]{40}$/.test(commit));
    assert.ok(deployId && /^[a-f0-9]{24}$/.test(deployId));
    assert.equal(assertS14Prerequisites(origin, commit).target, "staging");
    async function candidate() {
      const marker = await fetch(origin + "/__terraqo_s22_candidate.json?deploy=" + deployId,
        { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000) });
      assert.equal(marker.status, 200);
      assert.deepEqual(await marker.json(), { kind: "workspace-administration", siteId, commit, deployId });
    }
    phase = "candidate";
    await candidate();
    const result = await exercise(origin, commit, step => {
      if (step.startsWith("cleanup-")) journeyPhase = phase;
      phase = step;
    });
    phase = "final-candidate";
    await candidate();
    const receipt = { gate: "s14", passed: true, commit, deployId, ...result };
    console.log(JSON.stringify(receipt));
    return receipt;
  } catch (error) {
    const location = error instanceof Error ? error.stack?.match(/(?:verify-s14-evaluation|s14-evaluation-[a-z]+)\.ts:\d+:\d+/)?.[0] : undefined;
    console.error(JSON.stringify({ gate: "s14", phase, journeyPhase, location }));
    throw new Error("S14 failed during " + (journeyPhase ?? phase));
  }
}

export async function rehearseS14Evaluation(origin: string, commit: string) {
  assert.equal(assertS14Prerequisites(origin, commit).target, "local");
  return exercise(origin, commit, phase => console.log("S14 local", phase));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  verifyS14Evaluation().catch(() => { process.exitCode = 1; });
