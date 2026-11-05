import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const siteId = "6b8c43fb-6083-450a-9b85-46a820fb6358";
const origin = "https://terraqo-platform-staging.netlify.app";
const branch = "codex/s22-evaluator-local";
async function main() {
  const requested = process.argv[2];
  const probe = ["probe-configure", "probe-trigger"].includes(requested);
  const mode = probe ? requested.slice(6) : requested;
  assert.ok(["inspect", "configure", "trigger", "status"].includes(mode));
  const require = createRequire(new URL("../node_modules/netlify-cli/package.json", import.meta.url));
  const { getAPIToken } = await import(pathToFileURL(require.resolve("@netlify/dev-utils")).href);
  const { NetlifyAPI } = await import(pathToFileURL(require.resolve("@netlify/api")).href);
  const api = new NetlifyAPI(await getAPIToken());
  const site = await api.getSite({ site_id: siteId });
  assert.equal(site.id, siteId); assert.equal(site.name, "terraqo-platform-staging"); assert.equal(site.ssl_url, origin);
  if (mode === "status") {
    const deployId = process.argv[3]; assert.match(deployId || "", /^[a-f0-9]{24}$/);
    const deploy = await api.getSiteDeploy({ site_id: siteId, deploy_id: deployId });
    assert.equal(deploy.site_id, siteId);
    console.log(JSON.stringify({ id: deploy.id, state: deploy.state, commit: deploy.commit_ref, branch: deploy.branch, buildId: deploy.build_id, published: deploy.published_at, error: deploy.error_message, summary: deploy.summary }, null, 2));
    return;
  }
  const envArgs = { accountId: site.account_slug, siteId };
  let entries = await api.getEnvVars(envArgs);
  const values = () => Object.fromEntries(entries.map(e => [e.key, e.values?.find(v => v.context === "production")?.value ?? e.values?.find(v => v.context === "all")?.value]));
  if (mode === "inspect") {
    const env = values();
    const keys = ["PLATFORM_STAGING_CLOUD_PHASE", "PLATFORM_STAGING_SUPABASE_PROJECT_REF", "PLATFORM_STAGING_DATABASE_ROLE", "PLATFORM_STAGING_ALLOW_REMOTE", "TERRAQO_WORKSPACE_INVITATIONS_V1", "TERRAQO_TRANSACTIONAL_EMAIL_ENABLED", "AUTH_URL", "NEXT_PUBLIC_SITE_URL"];
    console.log(JSON.stringify({ siteId, branch: site.build_settings?.repo_branch, repo: site.build_settings?.repo_path, publishedDeploy: site.published_deploy?.id, settings: Object.fromEntries(keys.map(k => [k, env[k] ?? null])), credentialsPresent: Object.fromEntries(["DATABASE_URL", "B5_GATE_DATABASE_URL", "AUTH_SECRET"].map(k => [k, Boolean(env[k])])) }, null, 2));
    return;
  }
  const candidate = process.argv[3]; assert.match(candidate || "", /^[a-f0-9]{40}$/);
  assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(), candidate);
  assert.equal(execFileSync("git", ["branch", "--show-current"], { encoding: "utf8", windowsHide: true }).trim(), branch);
  assert.equal(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8", windowsHide: true }).trim(), "");
  const assets = JSON.parse(await readFile("output/s24-staging-blobs/active.json", "utf8"));
  assert.equal(assets.state, "prepared");
  assert.equal(assets.siteId, siteId);
  assert.equal(assets.candidate, candidate);
  assert.match(assets.runId, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
  const mailKey = entries.find(entry => entry.key === "RESEND_API_KEY");
  const probeReady = mailKey?.is_secret === true && mailKey.scopes?.length === 1 &&
    mailKey.scopes[0] === "functions" && Boolean(values().RESEND_API_KEY) &&
    values().TERRAQO_EMAIL_FROM === "Terraqo <noreply@terraqoglobal.com>";
  let probeTarget = "off";
  if (probe) {
    const live = site.published_deploy;
    assert.match(live?.commit_ref ?? "", /^[0-9a-f]{40}$/);
    assert.match(live.id, /^[0-9a-f]{24}$/);
    const marker = await fetch(origin + "/__terraqo_s22_candidate.json", { cache: "no-store", redirect: "error" });
    assert.equal(marker.status, 200);
    assert.deepEqual(await marker.json(), { kind: "workspace-administration", siteId, commit: live.commit_ref, deployId: live.id });
    // Only diagnostic, documentation and staging plugin changes may be tested against an older live build.
    const changed = execFileSync("git", ["diff", "--name-only", live.commit_ref, candidate], { encoding: "utf8" }).trim();
    assert.ok(!changed || changed.split(/\r?\n/).every(file => /^(scripts\/|docs\/|plugins\/terraqo-staging-gate\/)/.test(file)));
    probeTarget = live.commit_ref + "/" + live.id;
  }
  const recover = process.argv[4] ?? "off";
  if (recover !== "off") { assert.ok(probe); assert.match(recover, /^[a-f0-9-]{36}\/[a-f0-9]{12}$/); }
  const expected = {
    S24_STAGING_RECOVER_INTERRUPTED: recover,
    S24_STAGING_DIAGNOSTIC_TARGET: probeTarget,
    S24_STAGING_VERIFICATION: "independent",
    S22_STAGING_CANDIDATE_SHA: candidate,
    PLATFORM_STAGING_CLOUD_PHASE: "workspace-administration",
    TERRAQO_S22_STAGING_CONFIRM: "mghdpciewbsowjrjwmwk:s22-fixtures",
    TERRAQO_WORKSPACE_INVITATIONS_V1: "true",
    TERRAQO_WORKSPACE_EVALUATORS_V1: "true",
    TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "false",
    TERRAQO_STAGING_INVITATION_PROBE: probeReady ? "true" : "false",
    PLATFORM_STAGING_S24_CONFIRM: "mghdpciewbsowjrjwmwk:s24-http-fixtures",
    PLATFORM_STAGING_S24_BLOB_RUN: assets.runId,
    TERRAQO_WORKSPACE_PUBLICATION_V1: "true",
  };
  // Netlify deliberately masks secrets returned by its management API. This
  // preflight authorizes only nonsecret configuration; the hosted prebuild
  // gate validates the actual database URLs and role before any fixture write.
  const env = values();
  assert.equal(env.PLATFORM_STAGING_SUPABASE_PROJECT_REF, "mghdpciewbsowjrjwmwk");
  assert.equal(env.PLATFORM_STAGING_DATABASE_ROLE, "terraqo_staging_runtime");
  assert.equal(env.PLATFORM_STAGING_ALLOW_REMOTE, "true");
  for (const key of ["AUTH_URL", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_PORTAL_URL", "NEXT_PUBLIC_ADMIN_URL", "NEXT_PUBLIC_API_URL"]) assert.equal(env[key], origin);
  for (const key of ["DATABASE_URL", "B5_GATE_DATABASE_URL", "AUTH_SECRET"]) {
    const entry = entries.find(item => item.key === key);
    assert.ok(env[key], `Missing ${key}`);
    assert.ok(entry.scopes.includes("builds") && entry.scopes.includes("functions"), `Missing scopes for ${key}`);
  }
  assert.equal(site.build_settings?.repo_path, "antoniobravocabanillas/icc-topografia");
  if (mode === "configure") {
    await mkdir("output/s22", { recursive: true });
    await writeFile("output/s22/netlify-before.json", JSON.stringify({ siteId, previousBranch: site.build_settings?.repo_branch, previousDeploy: site.published_deploy?.id, values: Object.fromEntries(Object.keys(expected).map(key => [key, values()[key] ?? null])) }, null, 2), { flag: "wx" }).catch(error => { if (error.code !== "EEXIST") throw error; });
    for (const [key, value] of Object.entries(expected)) {
      if (entries.some(e => e.key === key)) await api.setEnvVarValue({ ...envArgs, key, body: { context: "production", value } });
      else await api.createEnvVars({ ...envArgs, body: [{ key, scopes: ["builds", "functions", "post_processing", "runtime"], values: [{ context: "production", value }] }] });
    }
    const repo = Object.fromEntries(["provider", "repo_path", "repo_url", "installation_id"].map(key => [key, site.build_settings[key]]));
    await api.updateSite({ site_id: siteId, body: { repo: { ...repo, repo_branch: branch } } });
    entries = await api.getEnvVars(envArgs);
  }
  for (const [key, value] of Object.entries(expected)) assert.equal(values()[key], value, `Unexpected ${key}`);
  assert.equal((await api.getSite({ site_id: siteId })).build_settings.repo_branch, branch);
  if (mode === "trigger") {
    const remote = execFileSync("git", ["ls-remote", "origin", `refs/heads/${branch}`], { encoding: "utf8", windowsHide: true }).trim().split(/\s+/)[0];
    assert.equal(remote, candidate);
    const build = await api.createSiteBuild({ site_id: siteId, body: { clear_cache: true } });
    await writeFile("output/s22/netlify-build.json", JSON.stringify({ siteId, candidate, buildId: build.id, deployId: build.deploy_id }, null, 2));
    console.log(JSON.stringify({ triggered: true, siteId, candidate, buildId: build.id, deployId: build.deploy_id }));
  } else console.log(JSON.stringify({ configured: true, siteId, candidate, branch, productionTouched: false }));
}
main().catch(error => { console.error(JSON.stringify({ failed: true, type: error?.name, status: error?.status, code: typeof error?.code === "string" ? error.code : undefined })); process.exitCode = 1; });
