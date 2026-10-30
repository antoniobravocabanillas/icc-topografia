import assert from "node:assert/strict";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";

const contractScripts = [
  "check:release-candidate",
  "check:b5-rollout",
  "test:platform-staging-readiness",
  "test:workforce-analytics",
  "test:worklog-journey-linking",
  "test:attendance-policy",
  "test:attendance-bootstrap",
  "test:auth-secure-proxy",
  "test:auth-security-controls",
  "test:experience-evidence-chunk-upload",
  "test:oauth-provider-policy",
  "test:image-origin-policy",
  "test:portal-home-scope",
  "test:request-origin",
  "test:scheduled-job-isolation",
  "test:portal-journeys",
  "test:field-verification-recovery",
  "test:attendance-location-queue",
  "test:attendance-tracker-lease",
  "test:attendance-location-ownership",
  "test:public-cv-permalink",
  "test:worklog-archive",
  "test:evidence-policy",
  "test:worklog-media-security",
  "test:worklog-revision",
  "test:worklog-create-operation",
  "test:scoped-sharing-contract",
  "test:discovery-needs-contract",
  "test:contextual-messaging-contract",
  "test:collaboration-contract",
  "test:closure-contract",
  "test:evidence-analysis-contract",
  "test:recovery-observability-contract",
  "test:product-entitlements-contract",
  "test:public-checkout-pricing",
  "test:ci-quality-gate",
  "test:local-disposable-database-guard",
  "test:isolation-script-safety",
] as const;

const npmCli = process.env.npm_execpath;
assert.ok(npmCli, "Run this gate through npm so the pinned npm CLI is available.");

for (const script of contractScripts) {
  process.stdout.write(`\n=== ${script} ===\n`);
  const result: SpawnSyncReturns<Buffer> = spawnSync(process.execPath, [npmCli, "run", script], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  assert.equal(result.signal, null, `${script} ended by signal ${result.signal ?? "unknown"}.`);
  assert.equal(result.status, 0, `${script} failed with exit code ${result.status ?? "unknown"}.`);
}

console.log(`\nTerraqo local contract gate: OK (${contractScripts.length} non-mutating checks).`);
