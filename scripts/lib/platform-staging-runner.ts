import assert from "node:assert/strict";
import { parseEnv } from "node:util";
import { platformFlags, validatePlatformStagingEnvironment } from "./platform-staging-environment";

export const stagingGateScripts = {
  preflight: "check-platform-staging-readiness.ts",
  "b1-b2": "test-platform-staging-http.ts",
  b3: "test-platform-staging-b3-http.ts",
  b4: "test-platform-staging-b4-http.ts",
  "b5-readiness": "test-platform-staging-b5-readiness.ts",
  "b5-dispatch": "test-platform-staging-b5-dispatch.ts",
} as const;

const allowedKeys = new Set([
  ...platformFlags,
  "PLATFORM_STAGING_CONFIRM", "PLATFORM_STAGING_ALLOW_REMOTE",
  "PLATFORM_STAGING_DATABASE_PROVIDER", "PLATFORM_STAGING_RESOURCE_NAME",
  "PLATFORM_STAGING_SUPABASE_PROJECT_REF", "PLATFORM_STAGING_DATABASE_ROLE",
  "PLATFORM_STAGING_ENABLED_FLAGS", "PLATFORM_STAGING_PILOT_WORKSPACE_IDS",
  "PLATFORM_STAGING_ACTIVATION_CONFIRM", "PLATFORM_STAGING_PROVIDER_CONFIRM",
  "B5_GATE_DATABASE_URL", "B5_GATE_EXPECTED_DATABASE", "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_PORTAL_URL", "NEXT_PUBLIC_ADMIN_URL", "NEXT_PUBLIC_API_URL",
  "AUTH_URL", "AUTH_SECRET", "EVIDENCE_ANALYSIS_DISPATCH_SECRET",
  "TERRAQO_STAGING_DOCUMENT_CLEANUP_SECRET", "TERRAQO_STAGING_BILLING_RECONCILE_SECRET",
  "TERRAQO_B5_PILOT_WORKSPACE_IDS", "TERRAQO_EVIDENCE_ANALYSIS_PROVIDER",
  "TERRAQO_OAUTH_ENABLED", "TERRAQO_TRANSACTIONAL_EMAIL_ENABLED",
  "TERRAQO_STAGING_MUTATING_TESTS", "TERRAQO_STAGING_B5_PROVIDER_TESTS",
  "GROQ_API_KEY", "OPENAI_API_KEY", "GROQ_EVIDENCE_ANALYSIS_MODEL",
]);
const osKeys = new Set(["PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA"]);
const stagingOrigin = "https://terraqo-platform-staging.netlify.app";

export function stagingRunnerEnvironment(source: string, inherited: Record<string, string | undefined>): NodeJS.ProcessEnv {
  assert.ok(Buffer.byteLength(source) <= 64 * 1024, "El archivo de staging supera 64 KiB.");
  // parseEnv preserves $, ${...}, quotes and shell text literally. Never eval,
  // interpolate, expand dotenv variables or fall back to the checkout's .env.
  const values = parseEnv(source);
  for (const name of Object.keys(values)) assert.ok(allowedKeys.has(name), "El archivo contiene una variable no permitida para este runner.");
  const target = validatePlatformStagingEnvironment(values);
  assert.equal(target.databaseProvider, "supabase");
  assert.equal(target.supabaseProjectRef, "mghdpciewbsowjrjwmwk");
  assert.equal(target.databaseRole, "terraqo_staging_runtime");
  assert.equal(target.resourceName, "Terraqo Platform Staging");
  for (const name of ["AUTH_URL", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_PORTAL_URL", "NEXT_PUBLIC_ADMIN_URL", "NEXT_PUBLIC_API_URL"]) {
    assert.ok([stagingOrigin, `${stagingOrigin}/`].includes(values[name] ?? ""), "Todas las superficies deben usar el origen exacto de staging.");
  }
  const environment: Record<string, string | undefined> = {};
  // Do not inherit app credentials, NODE_OPTIONS, proxy settings, deployment
  // tokens or destinations from the invoking shell.
  for (const [key, value] of Object.entries(inherited)) if (osKeys.has(key.toUpperCase())) environment[key] = value;
  return {
    ...environment, ...values, NODE_ENV: "production", AUTH_TRUST_HOST: "true",
    DATABASE_URL: values.B5_GATE_DATABASE_URL, DIRECT_URL: values.B5_GATE_DATABASE_URL,
    TEST_PLATFORM_STAGING_URL: stagingOrigin,
  };
}

export function stagingGateScript(name: string) {
  assert.ok(Object.hasOwn(stagingGateScripts, name), "Gate no permitido. Usa preflight, b1-b2, b3, b4, b5-readiness o b5-dispatch.");
  return stagingGateScripts[name as keyof typeof stagingGateScripts];
}
