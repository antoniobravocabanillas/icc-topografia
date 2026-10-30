import assert from "node:assert/strict";
import { parseEnv } from "node:util";

const publicTemplates = new Set([".env.example", ".env.platform-staging.example"]);

export function isPrivateEnvironmentFile(path: string) {
  // Preserve this gate's scope: root Next.js environment files. Worker-service
  // templates have their own configuration and are not new exceptions here.
  return (path === ".env" || path.startsWith(".env.")) && !publicTemplates.has(path);
}

export function assertStagingTemplateIsPublic(source: string) {
  const values = parseEnv(source);
  for (const key of [
    "B5_GATE_DATABASE_URL", "AUTH_SECRET", "EVIDENCE_ANALYSIS_DISPATCH_SECRET",
    "TERRAQO_STAGING_DOCUMENT_CLEANUP_SECRET", "TERRAQO_STAGING_BILLING_RECONCILE_SECRET", "GROQ_API_KEY",
    "PLATFORM_STAGING_PROVIDER_CONFIRM", "PLATFORM_STAGING_PILOT_WORKSPACE_IDS",
    "TERRAQO_B5_PILOT_WORKSPACE_IDS", "TERRAQO_STAGING_MUTATING_TESTS", "TERRAQO_STAGING_B5_PROVIDER_TESTS",
  ]) {
    assert.ok(Object.hasOwn(values, key) && values[key] === "", `La plantilla publica debe declarar ${key} vacio.`);
  }
  for (const [key, value] of Object.entries(values)) {
    // Never echo a rejected credential in a build log. Extra provider secrets
    // are subject to the same rule, even when not yet in the required list.
    if (/(?:SECRET|TOKEN|PASSWORD|API_KEY|DATABASE_URL)/i.test(key)) {
      assert.ok(value === "", `La plantilla publica no puede contener un valor para ${key}.`);
    }
  }
  for (const key of ["TERRAQO_OAUTH_ENABLED", "TERRAQO_TRANSACTIONAL_EMAIL_ENABLED", "TERRAQO_EVIDENCE_ANALYSIS_V1"]) {
    assert.ok(values[key] === "false", `La plantilla publica debe mantener ${key} apagado.`);
  }
  assert.ok(values.TERRAQO_EVIDENCE_ANALYSIS_PROVIDER === "off", "La plantilla publica debe mantener el proveedor apagado.");
}
