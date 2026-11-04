import assert from "node:assert/strict";
export const attentionStagingSite = "6b8c43fb-6083-450a-9b85-46a820fb6358";
export const attentionStagingOrigin = "https://terraqo-platform-staging.netlify.app";
export const attentionStagingProject = "mghdpciewbsowjrjwmwk";
/** Fail closed before fixture writes; no dotenv loading and no production fallback. */
export function assertAttentionTestTarget(env: Record<string, string | undefined>, origin: string) {
  const db = new URL(env.DATABASE_URL || "");
  const app = new URL(origin);
  assert.match(db.protocol, /^postgres(?:ql)?:$/);
  assert.equal(db.searchParams.get("schema"), "icc");
  if (env.TERRAQO_LOCAL_ATTENTION_TEST === "synthetic-only") {
    assert.equal(app.hostname, "127.0.0.1");
    assert.equal(db.hostname, "127.0.0.1");
    assert.equal(db.username, "terraqo_attention_test");
    return "local" as const;
  }
  assert.equal(origin, attentionStagingOrigin);
  assert.equal(env.TERRAQO_ATTENTION_STAGING_CONFIRM, `${attentionStagingProject}:attention-fixtures`);
  assert.equal(env.PLATFORM_STAGING_SUPABASE_PROJECT_REF, attentionStagingProject);
  assert.equal(env.PLATFORM_STAGING_DATABASE_ROLE, "terraqo_staging_runtime");
  assert.equal(env.PLATFORM_STAGING_ALLOW_REMOTE, "true");
  assert.equal(env.B5_GATE_DATABASE_URL, env.DATABASE_URL);
  if (env.DIRECT_URL) assert.equal(env.DIRECT_URL, env.DATABASE_URL);
  assert.equal(decodeURIComponent(db.pathname), "/postgres");
  const user = decodeURIComponent(db.username);
  assert.ok((db.hostname === `db.${attentionStagingProject}.supabase.co` && user === "terraqo_staging_runtime") ||
    (db.hostname.endsWith(".pooler.supabase.com") && user === `terraqo_staging_runtime.${attentionStagingProject}`));
  assert.ok(db.password.length > 0);
  assert.ok(["require", "verify-ca", "verify-full"].includes(db.searchParams.get("sslmode") || ""));
  for (const key of ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_PORTAL_URL", "NEXT_PUBLIC_ADMIN_URL", "NEXT_PUBLIC_API_URL", "AUTH_URL"]) {
    assert.equal(new URL(env[key] || "").origin, attentionStagingOrigin);
  }
  return "staging" as const;
}
