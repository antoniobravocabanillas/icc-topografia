/* eslint-disable @typescript-eslint/no-require-imports -- Netlify loads this local plugin through its CommonJS entrypoint. */
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const { assertProductionEnvironment } = require("./production-environment.cjs");
const stagingSite = "6b8c43fb-6083-450a-9b85-46a820fb6358";

function run(stage, { utils }) {
  if (stage === "prepare") {
    try { assertProductionEnvironment(process.env); }
    catch (error) { utils.build.failBuild(error.message); return; }
  }
  if (process.env.SITE_ID !== stagingSite) {
    if (process.env.PLATFORM_STAGING_CLOUD_CONFIRM) utils.build.failBuild("Staging gate configured on a different site.");
    return;
  }
  const result = spawnSync(process.execPath, ["--import", "tsx", resolve("scripts/run-platform-staging-cloud.ts"), stage], {
    cwd: process.cwd(), env: process.env, encoding: "utf8", timeout: 1_100_000, shell: false,
  });
  // The runner emits structural diagnostics only; retain them in the plugin
  // summary as well because hosted build logs may end before onSuccess.
  if (result.stdout) console.log(result.stdout);
  const diagnostics = `${result.stdout || ""}\n${result.stderr || ""}`;
  const locations = [...new Set(diagnostics.match(/(?:test-platform-staging-[a-z0-9-]+|run-platform-staging-cloud|platform-staging-cloud)\.ts:\d+:\d+/g) || [])].slice(0, 6);
  const codes = [...new Set(diagnostics.match(/\b(?:ERR_ASSERTION|TimeoutError|P\d{4}|SOURCE_REVOKED|PROVIDER_UNAVAILABLE)\b/g) || [])].slice(0, 6);
  if (result.status !== 0) {
    const fail = stage === "verify" ? utils.build.failPlugin : utils.build.failBuild;
    fail(`Staging ${stage} failed; production release remains blocked. ${JSON.stringify({ locations, codes })}`);
  } else if (stage === "verify" && utils.status?.show) {
    utils.status.show({ title: "Staging gate verified", summary: `PASS ${process.env.PLATFORM_STAGING_CLOUD_PHASE}; commit=${process.env.COMMIT_REF}; deploy=${process.env.DEPLOY_ID}` });
  }
}

module.exports = {
  onPreBuild: (context) => run("prepare", context),
  // Post-deploy verification of the isolated site. This does not approve or
  // prevent a production deploy; the separate release gate consumes its result.
  onSuccess: (context) => run("verify", context),
};
