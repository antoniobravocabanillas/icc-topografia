import assert from "node:assert/strict";

export const workspaceAdministrationStagingSite = "6b8c43fb-6083-450a-9b85-46a820fb6358";
export const workspaceAdministrationStagingOrigin = "https://terraqo-platform-staging.netlify.app";
export const workspaceAdministrationStagingProject = "mghdpciewbsowjrjwmwk";

const applicationUrlKeys = [
  "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_PORTAL_URL", "NEXT_PUBLIC_ADMIN_URL", "NEXT_PUBLIC_API_URL", "AUTH_URL",
] as const;

function parseUrl(value: string | undefined): URL {
  assert.ok(value && value === value.trim() && !/[\s\\]/.test(value), "A canonical target URL is required");
  // Do not expose connection credentials in parser errors or assertion output.
  try { return new URL(value); } catch { throw new Error("Invalid target URL"); }
}

function applicationUrl(value: string | undefined): URL {
  const url = parseUrl(value);
  assert.ok(url.protocol === "http:" || url.protocol === "https:", "HTTP(S) application URL required");
  assert.ok(!url.username && !url.password && !url.hash, "Application URL credentials/fragments forbidden");
  return url;
}

/** Pure, fail-closed fixture guard. Never loads dotenv or selects a fallback target. */
export function assertWorkspaceAdministrationTestTarget(
  env: Record<string, string | undefined>, origin: string,
): "local" | "staging" {
  const db = parseUrl(env.DATABASE_URL);
  const app = applicationUrl(origin);
  assert.ok(db.protocol === "postgres:" || db.protocol === "postgresql:", "PostgreSQL URL required");
  assert.ok(!db.hash, "Database fragments forbidden");
  assert.equal(decodeURIComponent(db.pathname), "/postgres", "Expected postgres database");
  assert.ok(db.password.length > 0, "Database password required");
  // Reject duplicate keys and driver overrides (host, user, options, sslcert, etc.).
  const seen = new Set<string>();
  for (const [key, value] of db.searchParams) {
    assert.ok(!seen.has(key), "Duplicate database parameters forbidden");
    seen.add(key);
    assert.ok(["schema", "sslmode", "connection_limit", "pool_timeout", "pgbouncer", "sslaccept"].includes(key), "Unsupported database parameter");
    if (key === "pgbouncer") assert.ok(value === "true" || value === "false", "Explicit pooler boolean required");
    if (key === "sslaccept") assert.equal(value, "strict", "Certificate verification cannot be disabled");
    if (key === "connection_limit" || key === "pool_timeout") assert.match(value, /^[1-9]\d*$/);
  }
  assert.equal(db.searchParams.get("schema"), "icc", "Expected icc schema");
  assert.equal(env.TERRAQO_WORKSPACE_INVITATIONS_V1, "true");
  assert.equal(env.TERRAQO_TRANSACTIONAL_EMAIL_ENABLED, "false");
  if (env.DIRECT_URL !== undefined) assert.ok(env.DIRECT_URL === env.DATABASE_URL, "DIRECT_URL must match DATABASE_URL");

  if (env.TERRAQO_LOCAL_S22_TEST !== undefined) {
    assert.equal(env.TERRAQO_LOCAL_S22_TEST, "synthetic-only");
    assert.match(origin, /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::[0-9]+)?(?:[/?#]|$)/, "Literal local application host required");
    assert.ok(["localhost", "127.0.0.1"].includes(app.hostname), "Local application required");
    assert.ok(["localhost", "127.0.0.1"].includes(db.hostname), "Local database required");
    assert.equal(decodeURIComponent(db.username), "terraqo_s22_test");
    if (env.B5_GATE_DATABASE_URL !== undefined) assert.ok(env.B5_GATE_DATABASE_URL === env.DATABASE_URL, "B5 URL must match DATABASE_URL");
    for (const key of applicationUrlKeys) {
      if (env[key] !== undefined) {
        assert.match(env[key], /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::[0-9]+)?(?:[/?#]|$)/, "Literal local application host required");
        assert.equal(applicationUrl(env[key]).origin, app.origin, "Local application origins must match");
      }
    }
    return "local";
  }

  assert.equal(origin, workspaceAdministrationStagingOrigin);
  assert.equal(env.SITE_ID, workspaceAdministrationStagingSite);
  assert.equal(env.TERRAQO_S22_STAGING_CONFIRM, `${workspaceAdministrationStagingProject}:s22-fixtures`);
  assert.equal(env.PLATFORM_STAGING_SUPABASE_PROJECT_REF, workspaceAdministrationStagingProject);
  assert.equal(env.PLATFORM_STAGING_DATABASE_ROLE, "terraqo_staging_runtime");
  assert.equal(env.PLATFORM_STAGING_ALLOW_REMOTE, "true");
  assert.ok(env.B5_GATE_DATABASE_URL === env.DATABASE_URL, "B5 URL must match DATABASE_URL");
  const user = decodeURIComponent(db.username);
  assert.ok(
    (db.hostname === `db.${workspaceAdministrationStagingProject}.supabase.co` && user === "terraqo_staging_runtime") ||
    (/^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/.test(db.hostname) &&
      user === `terraqo_staging_runtime.${workspaceAdministrationStagingProject}`),
    "Expected staging database host and runtime role",
  );
  assert.ok(!db.port || db.port === "5432" || db.port === "6543", "Unexpected staging database port");
  assert.ok(["require", "verify-ca", "verify-full"].includes(db.searchParams.get("sslmode") || ""), "Database TLS required");
  for (const key of applicationUrlKeys) assert.equal(applicationUrl(env[key]).origin, workspaceAdministrationStagingOrigin);
  return "staging";
}
