import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import path from "node:path";

const source = readFileSync("plugins/terraqo-staging-gate/index.cjs", "utf8");
function invoke(site: string, phase: string, status = 0) {
  const calls: string[][] = [], failures: string[] = [];
  const pluginModule = { exports: {} as { onPreBuild: (context: unknown) => void; onSuccess: (context: unknown) => void } };
  runInNewContext(source, { module: pluginModule, console: { log() {} }, process: { execPath: "node", cwd: () => process.cwd(), env: { SITE_ID: site, PLATFORM_STAGING_CLOUD_PHASE: phase } }, require: (name: string) => {
    if (name === "node:path") return path;
    if (name === "./production-environment.cjs") return { assertProductionEnvironment() {} };
    if (name === "node:child_process") return { spawnSync: (_exe: string, args: string[]) => { calls.push(args); return { status, stdout: "", stderr: "" }; } };
    throw new Error("Unexpected dependency");
  } });
  const context = { utils: { build: { failBuild: (s: string) => failures.push(s), failPlugin: (s: string) => failures.push(s) } } };
  pluginModule.exports.onPreBuild(context); pluginModule.exports.onSuccess(context);
  return { calls, failures };
}
const site = "6b8c43fb-6083-450a-9b85-46a820fb6358";
for (const [phase, runner] of [["workspace-administration", "run-workspace-administration-staging.ts"], ["customer-attention", "run-customer-attention-staging.ts"], ["s24", "run-platform-staging-cloud.ts"]]) {
  const result = invoke(site, phase);
  assert.equal(result.calls.length, 2);
  assert.ok(result.calls.every(args => path.basename(args[2]) === runner));
  assert.deepEqual(result.calls.map(args => args[3]), ["prepare", "verify"]);
  assert.equal(result.failures.length, 0);
}
assert.equal(invoke("production-site", "workspace-administration").calls.length, 0);
assert.equal(invoke(site, "workspace-administration", 1).failures.length, 2);
console.log("PASS staging dispatch: S22 prepare/verify, attention/platform preservation, foreign site excluded, failures surfaced. No processes spawned.");
