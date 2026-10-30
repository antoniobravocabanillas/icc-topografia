import assert from "node:assert/strict";
import { platformFlags } from "./platform-staging-environment";
import { stagingRunnerEnvironmentFromValues, stagingRunnerKeys } from "./platform-staging-runner";

export const stagingCloudSite = "6b8c43fb-6083-450a-9b85-46a820fb6358";
export const stagingCloudBranch = "codex/platform-staging-release";
export const stagingCloudOrigin = "https://terraqo-platform-staging.netlify.app";
const project = "mghdpciewbsowjrjwmwk";
const pilot = "cm00000000000000000000001";
export const cloudPhases = {
  "b1-b3": ["b1-b2", "b3"],
  b4: ["b4", "b5-readiness"],
  "b5-dispatch": ["b5-dispatch"],
} as const;

export function stagingCloudEnvironment(source: NodeJS.ProcessEnv, head: string) {
  assert.equal(source.NETLIFY, "true", "Solo se admite el build remoto de Netlify.");
  assert.equal(source.SITE_ID, stagingCloudSite, "Site ID ajeno a staging.");
  assert.equal(source.CONTEXT, "production", "El contexto debe ser el principal del sitio aislado.");
  assert.equal(source.BRANCH, stagingCloudBranch, "Rama ajena al candidato de staging.");
  assert.match(head, /^[a-f0-9]{40}$/, "Falta el commit completo del checkout.");
  assert.equal(source.COMMIT_REF, head, "El checkout no coincide con el build.");
  assert.equal(source.PLATFORM_STAGING_CANDIDATE_SHA, head, "El candidato no esta autorizado.");
  assert.match(source.DEPLOY_ID ?? "", /^[a-f0-9]{24}$/, "Falta el identificador del deploy.");
  const phase = source.PLATFORM_STAGING_CLOUD_PHASE ?? "";
  assert.ok(Object.hasOwn(cloudPhases, phase), "Fase remota no permitida.");
  assert.equal(source.PLATFORM_STAGING_CLOUD_CONFIRM, `${project}:${phase}:synthetic-only`, "Falta consentimiento de fixtures para esta fase.");
  const selectedPhase = phase as keyof typeof cloudPhases;
  const values = Object.fromEntries(stagingRunnerKeys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
  const environment = stagingRunnerEnvironmentFromValues(values, source);
  assert.equal(source.DATABASE_URL, environment.DATABASE_URL, "La aplicacion y los fixtures deben usar la misma base aislada.");
  if (source.DIRECT_URL) assert.equal(source.DIRECT_URL, environment.DATABASE_URL, "DIRECT_URL no corresponde al destino aislado.");
  const expectedFlags = selectedPhase === "b1-b3" ? platformFlags.slice(0, 4) : platformFlags.slice(0, 8);
  assert.equal(environment.PLATFORM_STAGING_ENABLED_FLAGS, expectedFlags.join(","), "Los flags deben coincidir con la fase remota.");
  assert.equal(environment.TERRAQO_EVIDENCE_ANALYSIS_V1, "false");
  assert.equal(environment.TERRAQO_B5_PILOT_WORKSPACE_IDS ?? "", selectedPhase === "b4" ? pilot : "");
  assert.equal(environment.TERRAQO_EVIDENCE_ANALYSIS_PROVIDER, selectedPhase === "b5-dispatch" ? "groq" : "off");
  return { environment, phase: selectedPhase, gates: cloudPhases[selectedPhase], commit: head, deployId: source.DEPLOY_ID! };
}

export function stagingCloudGateEnvironment(environment: NodeJS.ProcessEnv, gate: string) {
  const consent: Record<string, string> = {
    "b1-b2": "b1-b2-http-fixtures", b3: "b3-http-fixtures", b4: "b4-http-fixtures",
    "b5-readiness": "b5-http-readiness-fixtures", "b5-dispatch": "b5-synthetic-fixtures",
  };
  assert.ok(Object.hasOwn(consent, gate));
  return { ...environment, TERRAQO_STAGING_MUTATING_TESTS: `${project}:${consent[gate]}`,
    TERRAQO_STAGING_B5_PROVIDER_TESTS: gate === "b5-dispatch" ? `${project}:b5-provider-dispatch-fixtures` : "" };
}

export function assertStagingCandidate(actual: unknown, expected: { commit: string; deployId: string }) {
  assert.deepEqual(actual, { siteId: stagingCloudSite, commit: expected.commit, deployId: expected.deployId }, "El sitio servido no corresponde a este build de staging.");
}

// Child assertions may contain synthetic passwords, session tokens or DB URLs.
// Emit only structural diagnostics, never raw stdout/stderr or error messages.
export function cloudFailureDiagnostic(output: string) {
  return {
    locations: [...new Set(output.match(/(?:test-platform-staging-[a-z0-9-]+|run-platform-staging-cloud|platform-staging-cloud|platform-staging-runner|platform-staging-environment)\.ts:\d+:\d+/g) ?? [])].slice(0, 6),
    codes: [...new Set(output.match(/\b(?:P\d{4}|ERR_ASSERTION|TimeoutError|PrismaClientInitializationError)\b/g) ?? [])].slice(0, 6),
  };
}
