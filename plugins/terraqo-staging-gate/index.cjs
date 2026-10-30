/* eslint-disable @typescript-eslint/no-require-imports -- Netlify loads this local plugin through its CommonJS entrypoint. */
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const stagingSite = "6b8c43fb-6083-450a-9b85-46a820fb6358";

function run(stage, { utils }) {
  if (process.env.SITE_ID !== stagingSite) {
    if (process.env.PLATFORM_STAGING_CLOUD_CONFIRM) utils.build.failBuild("Staging gate configured on a different site.");
    return;
  }
  const result = spawnSync(process.execPath, ["--import", "tsx", resolve("scripts/run-platform-staging-cloud.ts"), stage], {
    cwd: process.cwd(), env: process.env, stdio: "inherit", timeout: 1_100_000, shell: false,
  });
  if (result.status !== 0) utils.build.failBuild(`Staging ${stage} failed; production release remains blocked.`);
}

module.exports = {
  onPreBuild: (context) => run("prepare", context),
  // Post-deploy verification of the isolated site. This does not approve or
  // prevent a production deploy; the separate release gate consumes its result.
  onSuccess: (context) => run("verify", context),
};
