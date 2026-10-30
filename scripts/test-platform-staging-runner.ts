import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { platformFlags } from "./lib/platform-staging-environment";
import { stagingGateScript, stagingRunnerEnvironment } from "./lib/platform-staging-runner";
import { isolateStagingDotenv } from "./lib/staging-dotenv-isolation";

const values: Record<string, string> = {
  PLATFORM_STAGING_CONFIRM: "staging", PLATFORM_STAGING_ALLOW_REMOTE: "true",
  PLATFORM_STAGING_DATABASE_PROVIDER: "supabase", PLATFORM_STAGING_RESOURCE_NAME: "Terraqo Platform Staging",
  PLATFORM_STAGING_SUPABASE_PROJECT_REF: "mghdpciewbsowjrjwmwk", PLATFORM_STAGING_DATABASE_ROLE: "terraqo_staging_runtime",
  B5_GATE_DATABASE_URL: "postgresql://terraqo_staging_runtime.mghdpciewbsowjrjwmwk:literal$VALUE%24%7BVALUE%7D@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?schema=icc",
  B5_GATE_EXPECTED_DATABASE: "postgres", TERRAQO_EVIDENCE_ANALYSIS_PROVIDER: "off",
  TERRAQO_OAUTH_ENABLED: "false", TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "false",
  AUTH_SECRET: "synthetic-auth-only-00000000000000000001",
  EVIDENCE_ANALYSIS_DISPATCH_SECRET: "synthetic-dispatch-only-0000000000000001",
  TERRAQO_STAGING_DOCUMENT_CLEANUP_SECRET: "synthetic-document-only-0000000000000001",
  TERRAQO_STAGING_BILLING_RECONCILE_SECRET: "synthetic-billing-only-00000000000000001",
};
for (const flag of platformFlags) values[flag] = "false";
for (const key of ["AUTH_URL", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_PORTAL_URL", "NEXT_PUBLIC_ADMIN_URL", "NEXT_PUBLIC_API_URL"]) values[key] = "https://terraqo-platform-staging.netlify.app";
const serialize = (change: Record<string, string> = {}) => Object.entries({ ...values, ...change }).map(([key, value]) => `${key}='${value}'`).join("\n");
const inherited = { Path: "safe-os-path", SYSTEMROOT: "C:\\Windows", DATABASE_URL: "production", NETLIFY_AUTH_TOKEN: "deployment-secret", GROQ_API_KEY: "inherited-key", NODE_OPTIONS: "--require unwanted", HTTP_PROXY: "unwanted", VALUE: "EXPANDED" };
const result = stagingRunnerEnvironment(serialize(), inherited);
assert.equal(result.DATABASE_URL, values.B5_GATE_DATABASE_URL);
assert.equal(result.DIRECT_URL, values.B5_GATE_DATABASE_URL);
assert.equal(result.Path, inherited.Path);
for (const key of ["NETLIFY_AUTH_TOKEN", "GROQ_API_KEY", "NODE_OPTIONS", "HTTP_PROXY", "VALUE"]) assert.equal((result as NodeJS.ProcessEnv)[key], undefined);
assert.equal(stagingRunnerEnvironment(serialize({ AUTH_SECRET: "literal$VALUE${VALUE}$(never-run)`never-run`-000000" }), inherited).AUTH_SECRET, "literal$VALUE${VALUE}$(never-run)`never-run`-000000");
const rejectedChanges: Record<string, string>[] = [
  { NEXT_PUBLIC_SITE_URL: "https://portal.terraqoglobal.com" },
  { AUTH_URL: "https://terraqo-platform-staging.netlify.app/other" },
  { PLATFORM_STAGING_DATABASE_ROLE: "postgres" },
  { B5_GATE_DATABASE_URL: values.B5_GATE_DATABASE_URL.replace("mghdpciewbsowjrjwmwk", "aaaaaaaaaaaaaaaaaaaa") },
  { NODE_OPTIONS: "--require unwanted" }, { NETLIFY_AUTH_TOKEN: "not-for-this-process" },
  { AUTH_SECRET: "" }, { TERRAQO_EVIDENCE_ANALYSIS_PROVIDER: "groq" },
];
for (const change of rejectedChanges) assert.throws(() => stagingRunnerEnvironment(serialize(change), inherited));
assert.throws(() => stagingRunnerEnvironment("#".repeat(65537), inherited));
for (const name of ["../../deploy", "constructor", "toString", "__proto__", "deploy", "schema"]) assert.throws(() => stagingGateScript(name));
assert.equal(stagingGateScript("b5-dispatch"), "test-platform-staging-b5-dispatch.ts");
const preflight = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/check-platform-staging-readiness.ts"], {
  cwd: process.cwd(), env: result, shell: false, windowsHide: true, encoding: "utf8", timeout: 15_000,
});
assert.equal(preflight.status, 0);
assert.match(preflight.stdout, /Platform staging preflight: OK/);
assert.equal(preflight.stdout.includes(values.B5_GATE_DATABASE_URL), false);
const unconfirmed = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/test-platform-staging-b5-dispatch.ts"], {
  cwd: process.cwd(), env: result, shell: false, windowsHide: true, encoding: "utf8", timeout: 15_000,
});
assert.equal(unconfirmed.status, 1);
assert.match(unconfirmed.stderr, /consentimiento exacto/);
async function verifyPrismaBoundary() {
  const directory = mkdtempSync(join(tmpdir(), "terraqo-staging-env-test-"));
  const fixtureEnv = join(directory, ".env");
  const require = createRequire(import.meta.url);
  const generated = require.resolve(".prisma/client/index.js");
  const source = readFileSync(generated, "utf8");
  // Prisma records null in a clean CI checkout and a relative path locally.
  // Both builds must exercise the same synthetic dotenv positive control.
  const schemaEnvPath = /"schemaEnvPath"\s*:\s*(?:"(?:[^"\\]|\\.)*"|null)/;
  assert.ok(schemaEnvPath.test(source), "Generated Prisma client must expose its dotenv location.");
  // Exercise the installed generated client and actual Prisma runtime, with
  // only its dotenv location pointed at a synthetic temporary directory.
  const isolatedSource = source.replace(schemaEnvPath, () => `"schemaEnvPath": ${JSON.stringify(fixtureEnv)}`);
  const generatedModule = { exports: {} as { PrismaClient: new () => { $disconnect: () => Promise<void> } } };
  const saved = { ...process.env };
  const literal = "postgresql://synthetic:literal${VALUE}@127.0.0.1:1/unused";
  let release: (() => void) | undefined;
  try {
    writeFileSync(fixtureEnv, "DATABASE_URL='ignored'\nSTAGING_PRISMA_SENTINEL='foreign-env'\n");
    writeFileSync(join(directory, ".env.local"), "LOCAL_SENTINEL='unchanged'\n");
    process.env.DATABASE_URL = literal;
    delete process.env.VALUE;
    delete process.env.STAGING_PRISMA_SENTINEL;
    runInNewContext(isolatedSource, { require: createRequire(generated), module: generatedModule, exports: generatedModule.exports, __dirname: dirname(generated), __filename: generated, process, console, Buffer });
    const before = new generatedModule.exports.PrismaClient();
    assert.equal(process.env.STAGING_PRISMA_SENTINEL, "foreign-env", "Positive control must demonstrate Prisma loads dotenv.");
    assert.notEqual(process.env.DATABASE_URL, literal, "Positive control must reproduce variable expansion.");
    await before.$disconnect();
    process.env.DATABASE_URL = literal;
    delete process.env.STAGING_PRISMA_SENTINEL;
    release = isolateStagingDotenv(directory);
    assert.equal(existsSync(fixtureEnv), false);
    assert.throws(() => isolateStagingDotenv(directory), /retenido/);
    const after = new generatedModule.exports.PrismaClient();
    assert.equal(process.env.DATABASE_URL, literal);
    assert.equal(process.env.STAGING_PRISMA_SENTINEL, undefined);
    await after.$disconnect();
    release(); release = undefined;
    assert.match(readFileSync(fixtureEnv, "utf8"), /foreign-env/);
    release = isolateStagingDotenv(directory);
    writeFileSync(fixtureEnv, "concurrent-content");
    assert.throws(release, /Conflicto/);
    assert.equal(readFileSync(fixtureEnv, "utf8"), "concurrent-content");
    assert.equal(existsSync(`${fixtureEnv}.platform-gate-hold.local`), true);
    rmSync(fixtureEnv); release(); release = undefined;
  } finally {
    release?.();
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith("terraqo-staging-env-test-"));
    rmSync(directory, { recursive: true, force: true });
  }
}
void verifyPrismaBoundary().then(() => console.log("Staging runner PASS: literal secrets, exact target, credential/command isolation, child preflight, blocked unconfirmed fixture, real Prisma dotenv regression and conflict-safe restoration.")).catch((error) => { console.error(error); process.exitCode = 1; });
