import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertStagingCandidate, cloudFailureDiagnostic, stagingCloudEnvironment, stagingCloudGateEnvironment, stagingCloudOrigin, stagingCloudSite } from "./lib/platform-staging-cloud";
import { stagingGateScript } from "./lib/platform-staging-runner";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
async function main() {
  const stage = process.argv[2];
  assert.ok(process.argv.length === 3 && ["prepare", "verify"].includes(stage));
  // Do not load or move a developer's dotenv files. Cloud checkout must be clean.
  for (const file of [".env", ".env.local", ".env.production", ".env.production.local", ".platform-staging-runner.lock.local"]) assert.ok(!existsSync(resolve(root, file)), "El checkout cloud contiene configuracion local.");
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
  const target = stagingCloudEnvironment(process.env, head);
  if (stage === "prepare") {
    // The public marker contains no credential and is only generated on staging.
    writeFileSync(resolve(root, "public/__terraqo_staging_candidate.json"), JSON.stringify({ siteId: stagingCloudSite, commit: head, deployId: target.deployId }));
    const install = spawnSync(process.execPath, [resolve(root, "node_modules/playwright/cli.js"), "install", "--with-deps", "chromium"], {
      cwd: root, env: target.environment, encoding: "utf8", timeout: 180_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true, shell: false,
    });
    assert.equal(install.status, 0, "No se pudo preparar Chromium para staging.");
    console.log(`Staging cloud prepare PASS: phase=${target.phase}; commit=${head}; deploy=${target.deployId}`);
    return;
  }
  async function verifyCandidate() {
    const response = await fetch(`${stagingCloudOrigin}/__terraqo_staging_candidate.json?deploy=${target.deployId}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    assert.equal(response.status, 200, "El candidato todavia no esta servido.");
    assertStagingCandidate(await response.json(), target);
  }
  for (const gate of target.gates) {
    await verifyCandidate();
    const started = Date.now();
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", resolve(root, "scripts", stagingGateScript(gate))], {
      cwd: root, env: stagingCloudGateEnvironment(target.environment, gate), encoding: "utf8", timeout: 480_000,
      maxBuffer: 2 * 1024 * 1024, windowsHide: true, shell: false,
    });
    console.log(JSON.stringify({ gate, passed: result.status === 0, exit: result.status, signal: result.signal, durationMs: Date.now() - started,
      ...(result.status === 0 ? {} : cloudFailureDiagnostic(`${result.stdout ?? ""}\n${result.stderr ?? ""}`)) }));
    // No retry: if interrupted, an independent readback must check fixture cleanup.
    assert.equal(result.status, 0, "Gate remoto fallido. Revisa el readback antes de reintentar.");
    await verifyCandidate();
  }
  console.log(`Staging cloud verified PASS: phase=${target.phase}; commit=${head}; deploy=${target.deployId}`);
}
void main().catch(() => { console.error("Staging cloud FAIL: configuracion, candidato o gate rechazado. Produccion sigue en HOLD."); process.exitCode = 1; });
