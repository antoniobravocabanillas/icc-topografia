import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { platformFlags } from "./lib/platform-staging-environment";
import { assertStagingCandidate, cloudFailureDiagnostic, stagingCloudBranch, stagingCloudEnvironment, stagingCloudGateEnvironment, stagingCloudOrigin, stagingCloudSite } from "./lib/platform-staging-cloud";

const head = "a".repeat(40);
const deployId = "b".repeat(24);
const env: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  NETLIFY: "true", SITE_ID: stagingCloudSite, CONTEXT: "production", BRANCH: stagingCloudBranch,
  COMMIT_REF: head, DEPLOY_ID: deployId, PLATFORM_STAGING_CANDIDATE_SHA: head,
  PLATFORM_STAGING_CLOUD_PHASE: "b1-b3", PLATFORM_STAGING_CLOUD_CONFIRM: "mghdpciewbsowjrjwmwk:b1-b3:synthetic-only",
  PLATFORM_STAGING_CONFIRM: "staging", PLATFORM_STAGING_ALLOW_REMOTE: "true",
  PLATFORM_STAGING_DATABASE_PROVIDER: "supabase", PLATFORM_STAGING_RESOURCE_NAME: "Terraqo Platform Staging",
  PLATFORM_STAGING_SUPABASE_PROJECT_REF: "mghdpciewbsowjrjwmwk", PLATFORM_STAGING_DATABASE_ROLE: "terraqo_staging_runtime",
  B5_GATE_DATABASE_URL: "postgresql://terraqo_staging_runtime.mghdpciewbsowjrjwmwk:literal$VALUE%24%7BVALUE%7D@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?schema=icc",
  B5_GATE_EXPECTED_DATABASE: "postgres", TERRAQO_EVIDENCE_ANALYSIS_PROVIDER: "off",
  TERRAQO_OAUTH_ENABLED: "false", TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "false",
  AUTH_SECRET: "synthetic-auth-only-00000000000000000001",
  EVIDENCE_ANALYSIS_DISPATCH_SECRET: "synthetic-dispatch-only-0000000000000001",
  TERRAQO_STAGING_DOCUMENT_CLEANUP_SECRET: "synthetic-document-only-0000000000000001",
  TERRAQO_STAGING_BILLING_RECONCILE_SECRET: "synthetic-billing-only-00000000000000001",
  PLATFORM_STAGING_ENABLED_FLAGS: platformFlags.slice(0, 4).join(","), PLATFORM_STAGING_ACTIVATION_CONFIRM: "cohort",
  NETLIFY_AUTH_TOKEN: "not-for-fixtures", DATABASE_URL: "not-the-authorized-database", CULQI_SECRET_KEY: "never-pass",
  NODE_OPTIONS: "--require unwanted", HTTPS_PROXY: "unwanted", PATH: "safe-path",
};
for (const [index, flag] of platformFlags.entries()) env[flag] = index < 4 ? "true" : "false";
for (const key of ["AUTH_URL", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_PORTAL_URL", "NEXT_PUBLIC_ADMIN_URL", "NEXT_PUBLIC_API_URL"]) env[key] = stagingCloudOrigin;
env.DATABASE_URL = env.B5_GATE_DATABASE_URL;
const target = stagingCloudEnvironment(env, head);
assert.deepEqual(target.gates, ["b1-b2", "b3"]);
assert.equal(target.environment.DATABASE_URL, env.B5_GATE_DATABASE_URL);
assert.equal(target.environment.AUTH_SECRET, env.AUTH_SECRET);
assert.equal(target.environment.PATH, "safe-path");
for (const key of ["NETLIFY_AUTH_TOKEN", "CULQI_SECRET_KEY", "NODE_OPTIONS", "HTTPS_PROXY", "COMMIT_REF"]) assert.equal(target.environment[key], undefined);

const rejected: Record<string, string>[] = [
  { SITE_ID: "2d38524a-44f9-4473-8a1f-9270e03bc2bf" }, { BRANCH: "codex/icc-production-preview" },
  { CONTEXT: "deploy-preview" }, { NETLIFY: "false" }, { COMMIT_REF: "c".repeat(40) },
  { PLATFORM_STAGING_CANDIDATE_SHA: "c".repeat(40) }, { DEPLOY_ID: "" },
  { PLATFORM_STAGING_CLOUD_PHASE: "constructor" }, { PLATFORM_STAGING_CLOUD_CONFIRM: "" },
  { DATABASE_URL: "different-runtime-database" }, { DIRECT_URL: "different-direct-database" },
  { AUTH_URL: "https://admin.terraqoglobal.com" }, { PLATFORM_STAGING_DATABASE_ROLE: "postgres" },
  { B5_GATE_DATABASE_URL: env.B5_GATE_DATABASE_URL!.replace("mghdpciewbsowjrjwmwk", "aaaaaaaaaaaaaaaaaaaa") },
  { TERRAQO_OAUTH_ENABLED: "true" }, { TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "true" },
  { TERRAQO_EVIDENCE_ANALYSIS_PROVIDER: "groq" }, { TERRAQO_B5_PILOT_WORKSPACE_IDS: "cm00000000000000000000001" },
];
for (const change of rejected) assert.throws(() => stagingCloudEnvironment({ ...env, ...change }, head));
assert.throws(() => stagingCloudEnvironment(env, "short"));
for (const gate of target.gates) {
  const child = stagingCloudGateEnvironment(target.environment, gate);
  assert.equal(child.TERRAQO_STAGING_MUTATING_TESTS, `mghdpciewbsowjrjwmwk:${gate === "b3" ? "b3" : "b1-b2"}-http-fixtures`);
  assert.equal(child.TERRAQO_STAGING_B5_PROVIDER_TESTS, "");
}
assert.throws(() => stagingCloudGateEnvironment(target.environment, "constructor"));
const b4: NodeJS.ProcessEnv = { ...env, PLATFORM_STAGING_CLOUD_PHASE: "b4", PLATFORM_STAGING_CLOUD_CONFIRM: "mghdpciewbsowjrjwmwk:b4:synthetic-only",
  PLATFORM_STAGING_ENABLED_FLAGS: platformFlags.slice(0, 8).join(","),
  TERRAQO_B5_PILOT_WORKSPACE_IDS: "cm00000000000000000000001", PLATFORM_STAGING_PILOT_WORKSPACE_IDS: "cm00000000000000000000001" };
for (const [index, flag] of platformFlags.entries()) b4[flag] = index < 8 ? "true" : "false";
assert.deepEqual(stagingCloudEnvironment(b4, head).gates, ["b4", "b5-readiness"]);

const marker = { siteId: stagingCloudSite, commit: head, deployId };
assertStagingCandidate(marker, { commit: head, deployId });
for (const wrong of [{ ...marker, commit: "c".repeat(40) }, { ...marker, deployId: "d".repeat(24) }, { ...marker, siteId: "other" }, { ...marker, extra: true }]) assert.throws(() => assertStagingCandidate(wrong, { commit: head, deployId }));
const diagnostic = cloudFailureDiagnostic(`secret ${env.B5_GATE_DATABASE_URL} password session=private\nTimeoutError ERR_ASSERTION\nat test-platform-staging-b3-http.ts:220:5`);
assert.deepEqual(diagnostic, { locations: ["test-platform-staging-b3-http.ts:220:5"], codes: ["TimeoutError", "ERR_ASSERTION"] });
assert.equal(JSON.stringify(diagnostic).includes("private"), false);

let spawns = 0;
let failures = 0;
const pluginProcess = { env: { SITE_ID: "production", PLATFORM_STAGING_CLOUD_CONFIRM: "" }, execPath: "node", cwd: () => "/repo" };
const pluginModule = { exports: {} as { onPreBuild: (context: unknown) => void; onSuccess: (context: unknown) => void } };
runInNewContext(readFileSync("plugins/terraqo-staging-gate/index.cjs", "utf8"), {
  module: pluginModule, process: pluginProcess,
  require: (name: string) => name === "node:child_process" ? { spawnSync: () => { spawns++; return { status: 0 }; } } : { resolve: (value: string) => value },
});
const context = { utils: { build: { failBuild: () => { failures++; } } } };
pluginModule.exports.onPreBuild(context); pluginModule.exports.onSuccess(context);
assert.equal(spawns, 0);
pluginProcess.env.PLATFORM_STAGING_CLOUD_CONFIRM = "misconfigured";
pluginModule.exports.onPreBuild(context);
assert.equal(failures, 1); assert.equal(spawns, 0);
pluginProcess.env.SITE_ID = stagingCloudSite;
pluginModule.exports.onPreBuild(context); pluginModule.exports.onSuccess(context);
assert.equal(spawns, 2);
console.log("Staging cloud contract PASS: exact site/branch/commit/deploy, per-phase consent, isolated credentials, candidate readback and production no-op.");
