import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  NEXT_PUBLIC_PORTAL_URL: "https://preview-terraqo.example.net",
  NEXT_PUBLIC_ADMIN_URL: "https://preview-terraqo.example.net",
  NEXT_PUBLIC_API_URL: "https://preview-terraqo.example.net",
  AUTH_URL: "https://preview-terraqo.example.net",
  TERRAQO_EVIDENCE_ANALYSIS_PROVIDER: "off",
  TERRAQO_OAUTH_ENABLED: "false",
  TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "false",
  TERRAQO_B5_PILOT_WORKSPACE_IDS: "",
  AUTH_SECRET: "stage-auth-secret-00000000000000000001",
  EVIDENCE_ANALYSIS_DISPATCH_SECRET: "stage-dispatch-secret-000000000000001",
  TERRAQO_STAGING_DOCUMENT_CLEANUP_SECRET: "stage-document-cleanup-00000000000001",
  TERRAQO_STAGING_BILLING_RECONCILE_SECRET: "stage-billing-reconcile-0000000000001",
};
for (const flag of platformFlags) safeEnvironment[flag] = "false";

const target = validatePlatformStagingEnvironment(safeEnvironment);
assert.equal(target.databaseName, "terraqo_staging_gate");
assert.equal(target.databaseProvider, "postgresql");
assert.equal(target.remoteDatabase, true);
assert.deepEqual(target.enabledFlags, []);
assert.deepEqual(target.pilotWorkspaceIds, []);
assert.equal(target.evidenceAnalysisProvider, "off");

const supabaseRef = "abcdefghijklmnopqrst";
const supabaseEnvironment = {
  ...safeEnvironment,
  PLATFORM_STAGING_DATABASE_PROVIDER: "supabase",
  PLATFORM_STAGING_RESOURCE_NAME: "Terraqo Platform Staging",
  PLATFORM_STAGING_SUPABASE_PROJECT_REF: supabaseRef,
  PLATFORM_STAGING_DATABASE_ROLE: "terraqo_staging_migrator",
  B5_GATE_DATABASE_URL: `postgresql://terraqo_staging_migrator:unique-stage-credential@db.${supabaseRef}.supabase.co:5432/postgres`,
  B5_GATE_EXPECTED_DATABASE: "postgres",
};
const supabaseTarget = validatePlatformStagingEnvironment(supabaseEnvironment);
assert.equal(supabaseTarget.databaseProvider, "supabase");
assert.equal(supabaseTarget.resourceName, "Terraqo Platform Staging");
assert.equal(supabaseTarget.supabaseProjectRef, supabaseRef);
assert.equal(supabaseTarget.databaseRole, "terraqo_staging_migrator");

const poolerTarget = validatePlatformStagingEnvironment({
  ...supabaseEnvironment,
  B5_GATE_DATABASE_URL: `postgresql://terraqo_staging_migrator.${supabaseRef}:unique-stage-credential@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
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
rejects({ NEXT_PUBLIC_PORTAL_URL: "https://portal.terraqoglobal.com" }, /producción/);
rejects({ NEXT_PUBLIC_ADMIN_URL: "https://admin-preview.example.net" }, /mismo host de staging/);
rejects({ NEXT_PUBLIC_API_URL: undefined }, /Define NEXT_PUBLIC_API_URL/);
rejects({ TERRAQO_WORK_CASES_V1: "true" }, /TERRAQO_WORK_CASES_V1 debe ser false/);
rejects({ PLATFORM_STAGING_ENABLED_FLAGS: "UNKNOWN_FLAG", PLATFORM_STAGING_ACTIVATION_CONFIRM: "cohort" }, /Flag no autorizado/);
rejects({ PLATFORM_STAGING_ENABLED_FLAGS: "TERRAQO_WORK_CASES_V1", TERRAQO_WORK_CASES_V1: "true" }, /ACTIVATION_CONFIRM=cohort/);
const activated = validatePlatformStagingEnvironment({
  ...safeEnvironment,
  PLATFORM_STAGING_ENABLED_FLAGS: "TERRAQO_WORKLOG_FTS_V1,TERRAQO_WORK_CASES_V1",
  PLATFORM_STAGING_ACTIVATION_CONFIRM: "cohort",
  TERRAQO_WORKLOG_FTS_V1: "true",
  TERRAQO_WORK_CASES_V1: "true",
});
assert.deepEqual(activated.enabledFlags, ["TERRAQO_WORKLOG_FTS_V1", "TERRAQO_WORK_CASES_V1"]);
rejects({ TERRAQO_OAUTH_ENABLED: "true" }, /OAuth debe iniciar deshabilitado/);
rejects({ TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "true" }, /correo transaccional debe iniciar deshabilitado/);
rejects({
  TERRAQO_EVIDENCE_ANALYSIS_PROVIDER: "ollama",
  PLATFORM_STAGING_PROVIDER_CONFIRM: "ollama",
}, /debe ser off, groq u openai/);
rejects({ TERRAQO_EVIDENCE_ANALYSIS_PROVIDER: "groq" }, /PROVIDER_CONFIRM=groq/);
rejects({
  TERRAQO_EVIDENCE_ANALYSIS_PROVIDER: "groq",
  PLATFORM_STAGING_PROVIDER_CONFIRM: "groq",
}, /Define GROQ_API_KEY/);
rejects({
  TERRAQO_EVIDENCE_ANALYSIS_PROVIDER: "openai",
  PLATFORM_STAGING_PROVIDER_CONFIRM: "openai",
  OPENAI_API_KEY: "short",
}, /OPENAI_API_KEY debe tener al menos 24/);
const providerPrepared = validatePlatformStagingEnvironment({
  ...safeEnvironment,
  TERRAQO_EVIDENCE_ANALYSIS_PROVIDER: "groq",
  PLATFORM_STAGING_PROVIDER_CONFIRM: "groq",
  GROQ_API_KEY: "gsk_staging_contract_12345678901234567890",
});
assert.equal(providerPrepared.evidenceAnalysisProvider, "groq");
rejects({ TERRAQO_B5_PILOT_WORKSPACE_IDS: "workspace-real" }, /coincidir exactamente/);
rejects({
  TERRAQO_B5_PILOT_WORKSPACE_IDS: "cm00000000000000000000001",
  PLATFORM_STAGING_PILOT_WORKSPACE_IDS: "workspace-real",
  PLATFORM_STAGING_ACTIVATION_CONFIRM: "cohort",
}, /Workspace piloto invalido/);
const pilotActivated = validatePlatformStagingEnvironment({
  ...safeEnvironment,
  TERRAQO_B5_PILOT_WORKSPACE_IDS: "cm00000000000000000000001",
  PLATFORM_STAGING_PILOT_WORKSPACE_IDS: "cm00000000000000000000001",
  PLATFORM_STAGING_ACTIVATION_CONFIRM: "cohort",
});
assert.deepEqual(pilotActivated.pilotWorkspaceIds, ["cm00000000000000000000001"]);
const allFlags = platformFlags.join(",");
const activeB5Environment: Record<string, string | undefined> = {
  ...safeEnvironment,
  PLATFORM_STAGING_ENABLED_FLAGS: allFlags,
  PLATFORM_STAGING_PILOT_WORKSPACE_IDS: "cm00000000000000000000001",
  PLATFORM_STAGING_ACTIVATION_CONFIRM: "cohort",
  PLATFORM_STAGING_PROVIDER_CONFIRM: "groq",
  TERRAQO_B5_PILOT_WORKSPACE_IDS: "cm00000000000000000000001",
  TERRAQO_EVIDENCE_ANALYSIS_PROVIDER: "groq",
  GROQ_API_KEY: "gsk_staging_contract_12345678901234567890",
};
for (const flag of platformFlags) activeB5Environment[flag] = "true";
const activeB5 = validatePlatformStagingEnvironment(activeB5Environment);
assert.equal(activeB5.evidenceAnalysisProvider, "groq");
assert.deepEqual(activeB5.pilotWorkspaceIds, ["cm00000000000000000000001"]);
rejects({
  ...Object.fromEntries(platformFlags.map((flag) => [flag, "true"])),
  PLATFORM_STAGING_ENABLED_FLAGS: allFlags,
  PLATFORM_STAGING_PILOT_WORKSPACE_IDS: "cm00000000000000000000001",
  PLATFORM_STAGING_ACTIVATION_CONFIRM: "cohort",
  TERRAQO_B5_PILOT_WORKSPACE_IDS: "cm00000000000000000000001",
}, /exige un proveedor externo confirmado/);
const missingPrerequisiteFlags = platformFlags.filter((flag) => flag !== "TERRAQO_WORK_CASES_V1");
rejects({
  ...Object.fromEntries(missingPrerequisiteFlags.map((flag) => [flag, "true"])),
  PLATFORM_STAGING_ENABLED_FLAGS: missingPrerequisiteFlags.join(","),
  PLATFORM_STAGING_PILOT_WORKSPACE_IDS: "cm00000000000000000000001",
  PLATFORM_STAGING_ACTIVATION_CONFIRM: "cohort",
  PLATFORM_STAGING_PROVIDER_CONFIRM: "groq",
  TERRAQO_B5_PILOT_WORKSPACE_IDS: "cm00000000000000000000001",
  TERRAQO_EVIDENCE_ANALYSIS_PROVIDER: "groq",
  TERRAQO_WORK_CASES_V1: "false",
  GROQ_API_KEY: "gsk_staging_contract_12345678901234567890",
}, /exige TERRAQO_WORK_CASES_V1/);
rejects({ EVIDENCE_ANALYSIS_DISPATCH_SECRET: safeEnvironment.AUTH_SECRET }, /deben ser independientes/);
rejects({ TERRAQO_STAGING_DOCUMENT_CLEANUP_SECRET: undefined }, /Define TERRAQO_STAGING_DOCUMENT_CLEANUP_SECRET/);
rejects({ TERRAQO_STAGING_BILLING_RECONCILE_SECRET: undefined }, /Define TERRAQO_STAGING_BILLING_RECONCILE_SECRET/);
rejects({
  TERRAQO_STAGING_DOCUMENT_CLEANUP_SECRET: safeEnvironment.TERRAQO_STAGING_BILLING_RECONCILE_SECRET,
}, /secretos operativos de staging deben ser independientes/);

function rejectsSupabase(change: Record<string, string | undefined>, expected: RegExp) {
  assert.throws(
    () => validatePlatformStagingEnvironment({ ...supabaseEnvironment, ...change }),
    expected,
  );
}

rejectsSupabase({ PLATFORM_STAGING_RESOURCE_NAME: "Terraqo Production" }, /naturaleza aislada|productivo/);
rejectsSupabase({ PLATFORM_STAGING_SUPABASE_PROJECT_REF: "short" }, /formato valido/);
rejectsSupabase({ PLATFORM_STAGING_DATABASE_ROLE: "Postgres-Admin" }, /DATABASE_ROLE no tiene un formato valido/);
rejectsSupabase({
  PLATFORM_STAGING_SUPABASE_PROJECT_REF: "zyxwvutsrqponmlkjihg",
}, /PROJECT_REF confirmado/i);
rejectsSupabase({
  B5_GATE_DATABASE_URL: "postgresql://terraqo_staging_migrator:unique-stage-credential@db.preview.internal:5432/postgres",
}, /PROJECT_REF confirmado/i);
rejectsSupabase({
  B5_GATE_DATABASE_URL: `postgresql://terraqo_staging_migrator.wrongwrongwrongwrongw:unique-stage-credential@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
}, /PROJECT_REF confirmado/i);
rejectsSupabase({
  B5_GATE_DATABASE_URL: `postgresql://postgres.${supabaseRef}:unique-stage-credential@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
}, /PROJECT_REF confirmado/i);

const deployScript = readFileSync(
  resolve(process.cwd(), "scripts/deploy-platform-staging.ps1"),
  "utf8",
);
const envExample = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
const declaredApplicationVariables = new Set(
  [...envExample.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)]
    .map((match) => match[1]),
);
for (const name of ["DATABASE_URL", "AI_PROVIDER", "GROQ_API_KEY", "OPENAI_API_KEY"]) {
  assert.ok(
    declaredApplicationVariables.has(name),
    `${name} debe estar en .env.example para que el deploy lo aisle del proceso del operador.`,
  );
}
for (const name of [
  "DATABASE_URL",
  "DIRECT_URL",
  "SHADOW_DATABASE_URL",
  "AI_PROVIDER",
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "OLLAMA_BASE_URL",
]) {
  assert.match(
    deployScript,
    new RegExp(`"${name}"`),
    `${name} debe quedar en la lista explicita de aislamiento runtime.`,
  );
}
const clearOperatorEnvironment = deployScript.indexOf(
  '[Environment]::SetEnvironmentVariable($name, $null, "Process")',
);
const netlifyDeploy = deployScript.indexOf("npx netlify deploy --build");
const restoreOperatorEnvironment = deployScript.lastIndexOf(
  "$deploymentEnvironment[$name]",
);
assert.match(deployScript, /function Get-DotEnvVariableNames/);
assert.match(deployScript, /\$envExamplePath/);
assert.match(deployScript, /\$deploymentVariableNames/);
assert.match(
  deployScript,
  /\$preflightVariableNames \+ \$runtimeIsolationVariableNames \+ \$dotenvVariableNames/,
);
assert.match(deployScript, /\$netlifyCredentialVariableNames = @\("NETLIFY_AUTH_TOKEN"\)/);
assert.match(deployScript, /Where-Object \{ \$_ -notin \$netlifyCredentialVariableNames \}/);
assert.ok(clearOperatorEnvironment >= 0, "El deploy debe limpiar las variables efimeras del preflight.");
assert.ok(netlifyDeploy > clearOperatorEnvironment, "La limpieza del entorno debe ocurrir antes del build Netlify.");
assert.ok(restoreOperatorEnvironment > netlifyDeploy, "El entorno del operador debe restaurarse despues del deploy.");

console.log("Platform staging readiness contract: OK (fail-closed target, provider, prerequisites, single cohort and secrets)." );
