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
  TERRAQO_B5_PILOT_WORKSPACE_IDS: "",
  AUTH_SECRET: "stage-auth-secret-00000000000000000001",
  EVIDENCE_ANALYSIS_DISPATCH_SECRET: "stage-dispatch-secret-000000000000001",
};
for (const flag of platformFlags) safeEnvironment[flag] = "false";

const target = validatePlatformStagingEnvironment(safeEnvironment);
assert.equal(target.databaseName, "terraqo_staging_gate");
assert.equal(target.remoteDatabase, true);

function rejects(change: Record<string, string | undefined>, expected: RegExp) {
  assert.throws(
    () => validatePlatformStagingEnvironment({ ...safeEnvironment, ...change }),
    expected,
  );
}

rejects({ PLATFORM_STAGING_CONFIRM: "production" }, /PLATFORM_STAGING_CONFIRM=staging/);
rejects({ B5_GATE_EXPECTED_DATABASE: "terraqo_other_gate" }, /no coinciden/);
rejects({
  B5_GATE_DATABASE_URL: "postgresql://user:unique-stage-credential@db.preview.internal:5432/terraqo_prod",
  B5_GATE_EXPECTED_DATABASE: "terraqo_prod",
}, /naturaleza aislada|productivo/);
rejects({ PLATFORM_STAGING_ALLOW_REMOTE: "false" }, /PLATFORM_STAGING_ALLOW_REMOTE=true/);
rejects({ NEXT_PUBLIC_SITE_URL: "https://portal.terraqoglobal.com", AUTH_URL: "https://portal.terraqoglobal.com" }, /producción/);
rejects({ TERRAQO_WORK_CASES_V1: "true" }, /TERRAQO_WORK_CASES_V1 debe iniciar en false/);
rejects({ TERRAQO_B5_PILOT_WORKSPACE_IDS: "workspace-real" }, /cohorte piloto debe iniciar vacía/);
rejects({ EVIDENCE_ANALYSIS_DISPATCH_SECRET: safeEnvironment.AUTH_SECRET }, /deben ser independientes/);

console.log("Platform staging readiness contract: OK (fail-closed target, flags, cohort and secrets)." );
