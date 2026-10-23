import assert from "node:assert/strict";
import {
  platformFlags,
  validatePlatformStagingEnvironment,
} from "./lib/platform-staging-environment";

const safeEnvironment: Record<string, string | undefined> = {
  PLATFORM_STAGING_CONFIRM: "staging",
  PLATFORM_STAGING_ALLOW_REMOTE: "true",
  B5_GATE_DATABASE_URL: "postgresql://terraqo_stage:unique-stage-credential@db.preview.internal:5432/terraqo_staging_gate?schema=icc",
  B5_GATE_EXPECTED_DATABASE: "terraqo_staging_gate",
  NEXT_PUBLIC_SITE_URL: "https://preview-terraqo.example.net",
  AUTH_URL: "https://preview-terraqo.example.net",
  TERRAQO_EVIDENCE_ANALYSIS_PROVIDER: "off",
  TERRAQO_OAUTH_ENABLED: "false",
  TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "false",
  TERRAQO_B5_PILOT_WORKSPACE_IDS: "",
  AUTH_SECRET: "stage-auth-secret-00000000000000000001",
  EVIDENCE_ANALYSIS_DISPATCH_SECRET: "stage-dispatch-secret-000000000000001",
};
for (const flag of platformFlags) safeEnvironment[flag] = "false";

const target = validatePlatformStagingEnvironment(safeEnvironment);
assert.equal(target.databaseName, "terraqo_staging_gate");
assert.equal(target.databaseProvider, "postgresql");
assert.equal(target.remoteDatabase, true);

const supabaseRef = "abcdefghijklmnopqrst";
const supabaseEnvironment = {
  ...safeEnvironment,
  PLATFORM_STAGING_DATABASE_PROVIDER: "supabase",
  PLATFORM_STAGING_RESOURCE_NAME: "Terraqo Platform Staging",
  PLATFORM_STAGING_SUPABASE_PROJECT_REF: supabaseRef,
  B5_GATE_DATABASE_URL: `postgresql://postgres:unique-stage-credential@db.${supabaseRef}.supabase.co:5432/postgres`,
  B5_GATE_EXPECTED_DATABASE: "postgres",
};
const supabaseTarget = validatePlatformStagingEnvironment(supabaseEnvironment);
assert.equal(supabaseTarget.databaseProvider, "supabase");
assert.equal(supabaseTarget.resourceName, "Terraqo Platform Staging");
assert.equal(supabaseTarget.supabaseProjectRef, supabaseRef);

const poolerTarget = validatePlatformStagingEnvironment({
  ...supabaseEnvironment,
  B5_GATE_DATABASE_URL: `postgresql://postgres.${supabaseRef}:unique-stage-credential@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`,
});
assert.equal(poolerTarget.supabaseProjectRef, supabaseRef);

function rejects(change: Record<string, string | undefined>, expected: RegExp) {
  assert.throws(
    () => validatePlatformStagingEnvironment({ ...safeEnvironment, ...change }),
    expected,
  );
}

rejects({ PLATFORM_STAGING_CONFIRM: "production" }, /PLATFORM_STAGING_CONFIRM=staging/);
rejects({ PLATFORM_STAGING_DATABASE_PROVIDER: "supabse" }, /debe ser postgresql o supabase/);
rejects({ B5_GATE_EXPECTED_DATABASE: "terraqo_other_gate" }, /no coinciden/);
rejects({
  B5_GATE_DATABASE_URL: "postgresql://user:unique-stage-credential@db.preview.internal:5432/terraqo_prod",
  B5_GATE_EXPECTED_DATABASE: "terraqo_prod",
}, /naturaleza aislada|productivo/);
rejects({ PLATFORM_STAGING_ALLOW_REMOTE: "false" }, /PLATFORM_STAGING_ALLOW_REMOTE=true/);
rejects({ NEXT_PUBLIC_SITE_URL: "https://portal.terraqoglobal.com", AUTH_URL: "https://portal.terraqoglobal.com" }, /producción/);
rejects({ TERRAQO_WORK_CASES_V1: "true" }, /TERRAQO_WORK_CASES_V1 debe iniciar en false/);
rejects({ TERRAQO_OAUTH_ENABLED: "true" }, /OAuth debe iniciar deshabilitado/);
rejects({ TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "true" }, /correo transaccional debe iniciar deshabilitado/);
rejects({ TERRAQO_B5_PILOT_WORKSPACE_IDS: "workspace-real" }, /cohorte piloto debe iniciar vacía/);
rejects({ EVIDENCE_ANALYSIS_DISPATCH_SECRET: safeEnvironment.AUTH_SECRET }, /deben ser independientes/);

function rejectsSupabase(change: Record<string, string | undefined>, expected: RegExp) {
  assert.throws(
    () => validatePlatformStagingEnvironment({ ...supabaseEnvironment, ...change }),
    expected,
  );
}

rejectsSupabase({ PLATFORM_STAGING_RESOURCE_NAME: "Terraqo Production" }, /naturaleza aislada|productivo/);
rejectsSupabase({ PLATFORM_STAGING_SUPABASE_PROJECT_REF: "short" }, /formato valido/);
rejectsSupabase({
  PLATFORM_STAGING_SUPABASE_PROJECT_REF: "zyxwvutsrqponmlkjihg",
}, /PROJECT_REF confirmado/i);
rejectsSupabase({
  B5_GATE_DATABASE_URL: "postgresql://postgres:unique-stage-credential@db.preview.internal:5432/postgres",
}, /PROJECT_REF confirmado/i);
rejectsSupabase({
  B5_GATE_DATABASE_URL: `postgresql://postgres.wrongwrongwrongwrongw:unique-stage-credential@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`,
}, /PROJECT_REF confirmado/i);

console.log("Platform staging readiness contract: OK (fail-closed PostgreSQL/Supabase target, flags, cohort and secrets)." );
