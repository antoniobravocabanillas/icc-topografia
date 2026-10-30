import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertStagingTemplateIsPublic, isPrivateEnvironmentFile } from "./lib/release-environment-templates";

const template = readFileSync(".env.platform-staging.example", "utf8");
assert.doesNotThrow(() => assertStagingTemplateIsPublic(template));
for (const file of [".env", ".env.local", ".env.production", ".env.platform-staging.local", ".env.other.example"]) {
  assert.equal(isPrivateEnvironmentFile(file), true, file);
}
for (const file of [".env.example", ".env.platform-staging.example", "README.md"]) assert.equal(isPrivateEnvironmentFile(file), false, file);
for (const key of ["B5_GATE_DATABASE_URL", "AUTH_SECRET", "EVIDENCE_ANALYSIS_DISPATCH_SECRET", "TERRAQO_STAGING_DOCUMENT_CLEANUP_SECRET", "TERRAQO_STAGING_BILLING_RECONCILE_SECRET", "GROQ_API_KEY", "OPENAI_API_KEY", "NETLIFY_AUTH_TOKEN", "NEW_PROVIDER_PASSWORD"]) {
  assert.throws(() => assertStagingTemplateIsPublic(`${template}\n${key}="synthetic-secret"`), error => {
    assert.ok(error instanceof Error);
    assert.ok(!error.message.includes("synthetic-secret"), "Diagnostic leaked a rejected value.");
    return true;
  });
}
assert.throws(() => assertStagingTemplateIsPublic(template.replace('AUTH_SECRET=""', "")), /AUTH_SECRET/);
assert.throws(() => assertStagingTemplateIsPublic(`${template}\nAUTH_SECRET="line one\nline two"`), /AUTH_SECRET/);
for (const key of ["TERRAQO_STAGING_MUTATING_TESTS", "TERRAQO_STAGING_B5_PROVIDER_TESTS", "TERRAQO_B5_PILOT_WORKSPACE_IDS"]) {
  assert.throws(() => assertStagingTemplateIsPublic(`${template}\n${key}=synthetic-consent`), new RegExp(key));
}
assert.throws(() => assertStagingTemplateIsPublic(`${template}\nTERRAQO_EVIDENCE_ANALYSIS_PROVIDER=groq`), /proveedor/);
console.log("Release environment templates: OK (exact public filenames, empty secrets, no execution consent, redacted failures).");
