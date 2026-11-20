import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertWorkspaceAdministrationTestTarget, workspaceAdministrationStagingOrigin,
  workspaceAdministrationStagingSite } from "@/scripts/lib/workspace-administration-test-target";
import { pilotWorkspace } from "@/scripts/lib/s13-discovery-fixture";
import { s24BlobRun } from "@/scripts/lib/s24-blob-fixtures.mjs";

/** No effects on import. Running requires a separate, explicit operator opt-in. */
export async function verifyS16Collaboration() {
  assert.equal(process.env.S16_COLLABORATION_GATE, "synthetic-only");
  const origin = process.env.S16_ORIGIN;
  assert.ok(origin && new URL(origin).origin === origin, "Explicit canonical S16_ORIGIN required");
  const target = assertWorkspaceAdministrationTestTarget(process.env, origin);
  const commit = process.env.S22_STAGING_CANDIDATE_SHA;
  assert.ok(commit && /^[a-f0-9]{40}$/.test(commit));
  const workspace = pilotWorkspace(commit);
  assert.equal(process.env.S16_EXCLUSIVE_FIXTURE_WORKSPACE, workspace,
    "Operator must reserve this SHA-derived workspace; never overlap S13/S14/S15/S16 runs");
  for (const flag of ["TERRAQO_DISCOVERY_NEEDS_V1", "TERRAQO_SCOPED_SHARING_V1",
    "TERRAQO_CONTEXTUAL_MESSAGING_V1", "TERRAQO_COLLABORATION_V1", "TERRAQO_CLOSURE_V1"])
    assert.equal(process.env[flag], "true", flag);
  assert.ok((process.env.TERRAQO_B5_PILOT_WORKSPACE_IDS || "").split(",")
    .map(value => value.trim()).some(value => value === workspace || value === "*"));
  const blobRun = s24BlobRun(process.env.PLATFORM_STAGING_S24_BLOB_RUN);
  const deployId = process.env.DEPLOY_ID;
  if (target === "staging") assert.ok(deployId && /^[a-f0-9]{24}$/.test(deployId));
  async function candidate() {
    if (target !== "staging") return;
    assert.equal(origin, workspaceAdministrationStagingOrigin);
    const response = await fetch(origin + "/__terraqo_s22_candidate.json?deploy=" + deployId,
      { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { kind: "workspace-administration",
      siteId: workspaceAdministrationStagingSite, commit, deployId });
  }
  await candidate();
  const moduleUrl = new URL("./lib/s16-collaboration-browser.ts", import.meta.url);
  const { runS16Journey } = await import(moduleUrl.href);
  const result = await runS16Journey({ origin, target, commit, blobRun });
  await candidate();
  console.log(JSON.stringify({ gate: "s16-s17-controls-draft", controlsPassed: true, target, commit, deployId, ...result }));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  verifyS16Collaboration().catch(() => {
    // Never print connection strings, cookies, passwords or HTTP bodies.
    console.error("S16_FAILED: inspect the last phase; no PASS receipt issued");
    process.exitCode = 1;
  });
