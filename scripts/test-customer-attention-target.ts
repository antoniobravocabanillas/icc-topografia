import assert from "node:assert/strict";
import { assertAttentionTestTarget, attentionStagingOrigin, attentionStagingProject } from "./lib/customer-attention-test-target";
const url = `postgresql://terraqo_staging_runtime.${attentionStagingProject}:synthetic@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?schema=icc&sslmode=require`;
const env: Record<string, string | undefined> = { DATABASE_URL: url, B5_GATE_DATABASE_URL: url, PLATFORM_STAGING_ALLOW_REMOTE: "true", PLATFORM_STAGING_DATABASE_ROLE: "terraqo_staging_runtime", PLATFORM_STAGING_SUPABASE_PROJECT_REF: attentionStagingProject, TERRAQO_ATTENTION_STAGING_CONFIRM: `${attentionStagingProject}:attention-fixtures` };
for (const key of ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_PORTAL_URL", "NEXT_PUBLIC_ADMIN_URL", "NEXT_PUBLIC_API_URL", "AUTH_URL"]) env[key] = attentionStagingOrigin;
assert.equal(assertAttentionTestTarget(env, attentionStagingOrigin), "staging");
for (const patch of [
  { TERRAQO_ATTENTION_STAGING_CONFIRM: "" }, { PLATFORM_STAGING_ALLOW_REMOTE: "false" },
  { DATABASE_URL: url.replace(attentionStagingProject, "different-project-ref") },
  { DATABASE_URL: url.replace("terraqo_staging_runtime.", "postgres.") },
  { DATABASE_URL: url.replace("aws-1-sa-east-1.pooler.supabase.com", "db.prisma.io") },
  { DIRECT_URL: "postgresql://prod:synthetic@db.prisma.io/postgres" },
  { AUTH_URL: "https://admin.terraqoglobal.com" }, { TERRAQO_LOCAL_ATTENTION_TEST: "synthetic-only" },
]) {
  const candidate: Record<string, string | undefined> = { ...env, ...patch };
  if (patch.DATABASE_URL) candidate.B5_GATE_DATABASE_URL = patch.DATABASE_URL;
  assert.throws(() => assertAttentionTestTarget(candidate, attentionStagingOrigin));
}
assert.throws(() => assertAttentionTestTarget(env, "https://terraqoglobal.com"));
assert.equal(assertAttentionTestTarget({ TERRAQO_LOCAL_ATTENTION_TEST: "synthetic-only", DATABASE_URL: "postgresql://terraqo_attention_test:synthetic@127.0.0.1/postgres?schema=icc" }, "http://127.0.0.1:3000"), "local");
console.log("PASS attention test destination guard: exact staging project/role/origin, confirmation, local isolation and production rejection.");
