import assert from "node:assert/strict";
import {
  assertWorkspaceAdministrationTestTarget as validate,
  workspaceAdministrationStagingOrigin as origin,
  workspaceAdministrationStagingProject as project,
  workspaceAdministrationStagingSite as site,
} from "./lib/workspace-administration-test-target";

type Environment = Record<string, string | undefined>;
const database = `postgresql://terraqo_staging_runtime.${project}:synthetic@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?schema=icc&sslmode=require`;
const urlKeys = ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_PORTAL_URL", "NEXT_PUBLIC_ADMIN_URL", "NEXT_PUBLIC_API_URL", "AUTH_URL"];
const staging: Environment = {
  DATABASE_URL: database, B5_GATE_DATABASE_URL: database, SITE_ID: site,
  PLATFORM_STAGING_ALLOW_REMOTE: "true", PLATFORM_STAGING_DATABASE_ROLE: "terraqo_staging_runtime",
  PLATFORM_STAGING_SUPABASE_PROJECT_REF: project, TERRAQO_S22_STAGING_CONFIRM: `${project}:s22-fixtures`,
  TERRAQO_WORKSPACE_INVITATIONS_V1: "true", TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "false",
  ...Object.fromEntries(urlKeys.map(key => [key, origin])),
};
let rejected = 0;
function rejects(env: Environment, appOrigin = origin) {
  assert.throws(() => validate(env, appOrigin));
  rejected++;
}
function rejectsDatabase(value: string) {
  rejects({ ...staging, DATABASE_URL: value, B5_GATE_DATABASE_URL: value });
}

assert.equal(validate(staging, origin), "staging");
for (const suffix of ["&pgbouncer=true", "&pgbouncer=false", "&sslaccept=strict", "&pgbouncer=true&sslaccept=strict"]) {
  assert.equal(validate({ ...staging, DATABASE_URL: database + suffix, B5_GATE_DATABASE_URL: database + suffix }, origin), "staging");
}
for (const suffix of ["&pgbouncer=1", "&pgbouncer=", "&pgbouncer=true&pgbouncer=false", "&sslaccept=", "&sslaccept=strict&sslaccept=accept_invalid_certs"]) rejectsDatabase(database + suffix);
assert.equal(validate({ ...staging, DIRECT_URL: database }, origin), "staging");
for (const sslmode of ["require", "verify-ca", "verify-full"]) {
  const direct = `postgres://terraqo_staging_runtime:synthetic@db.${project}.supabase.co/postgres?schema=icc&sslmode=${sslmode}`;
  assert.equal(validate({ ...staging, DATABASE_URL: direct, B5_GATE_DATABASE_URL: direct }, origin), "staging");
}
for (const key of Object.keys(staging)) rejects({ ...staging, [key]: undefined });
for (const patch of [
  { SITE_ID: "production" }, { PLATFORM_STAGING_ALLOW_REMOTE: "false" },
  { PLATFORM_STAGING_DATABASE_ROLE: "postgres" }, { PLATFORM_STAGING_SUPABASE_PROJECT_REF: "production" },
  { TERRAQO_S22_STAGING_CONFIRM: `${project}:attention-fixtures` },
  { TERRAQO_WORKSPACE_INVITATIONS_V1: "false" }, { TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "true" },
  { DIRECT_URL: "" }, { DIRECT_URL: database + "&pool_timeout=10" }, { B5_GATE_DATABASE_URL: "" },
  { TERRAQO_LOCAL_S22_TEST: "synthetic-only" }, { TERRAQO_LOCAL_S22_TEST: "" },
] as Environment[]) rejects({ ...staging, ...patch });

for (const value of [
  "", "not-a-url", database.replace("postgresql:", "https:"),
  database.replace(project, "production"), database.replace("terraqo_staging_runtime", "postgres"),
  database.replace("terraqo_staging_runtime", "service_role"), database.replace(":synthetic@", ":@"),
  database.replace("aws-1-sa-east-1.pooler.supabase.com", "db.production.supabase.co"),
  database.replace("aws-1-sa-east-1.pooler.supabase.com", "db.prisma.io"),
  database.replace("pooler.supabase.com", "pooler.supabase.com.evil.test"),
  database.replace("aws-1-sa-east-1.pooler.supabase.com", "evil.pooler.supabase.com"),
  database.replace("aws-1-sa-east-1.pooler.supabase.com", "127.0.0.1"),
  database.replace("/postgres?", "/production?"), database.replace("schema=icc", "schema=public"),
  database.replace("schema=icc&", ""), database.replace("&sslmode=require", ""),
  database.replace("sslmode=require", "sslmode=disable"), database.replace(":5432/", ":1234/"),
  database + "&schema=public", database + "&sslmode=disable", database + "&host=production.example",
  database + "&user=postgres", database + "&options=-csearch_path%3Dpublic", database + "&sslaccept=accept_invalid_certs",
  database + "#ignored", database + "\n", database + "&connection_limit=0",
  database.replace("/postgres?", "/%ZZ?"), database.replace("terraqo_staging_runtime", "%ZZ"),
]) rejectsDatabase(value);

for (const value of [
  "https://terraqoglobal.com", origin + ".evil.test", "https://terraqo-platform-staging.netlify.app@evil.test",
  "https://evil.test@terraqo-platform-staging.netlify.app", origin + ":444", "http://terraqo-platform-staging.netlify.app",
  "javascript:alert(1)", "file:///tmp/staging", origin + "#fragment", origin + "\\@evil.test", "",
]) {
  rejects(staging, value);
  for (const key of urlKeys) rejects({ ...staging, [key]: value });
}
assert.equal(validate({ ...staging, AUTH_URL: origin + "/api/auth" }, origin), "staging");

const local: Environment = {
  DATABASE_URL: "postgresql://terraqo_s22_test:synthetic@127.0.0.1:55432/postgres?schema=icc&connection_limit=8",
  TERRAQO_LOCAL_S22_TEST: "synthetic-only", TERRAQO_WORKSPACE_INVITATIONS_V1: "true",
  TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "false",
};
for (const host of ["localhost", "127.0.0.1"]) {
  assert.equal(validate({ ...local, DATABASE_URL: local.DATABASE_URL!.replace("127.0.0.1", host) }, `http://${host}:3000`), "local");
}
for (const value of [
  local.DATABASE_URL!.replace("postgresql:", "https:"), local.DATABASE_URL!.replace("127.0.0.1", "localhost.evil.test"),
  local.DATABASE_URL!.replace("127.0.0.1", "db.prisma.io"), local.DATABASE_URL!.replace("terraqo_s22_test", "postgres"),
  local.DATABASE_URL!.replace("schema=icc", "schema=public"),
]) rejects({ ...local, DATABASE_URL: value }, "http://127.0.0.1:3000");
for (const value of ["file://127.0.0.1/test", "ftp://localhost", "http://localhost.evil.test", origin, "http://[::1]:3000", "http://127.1:3000", "http://2130706433:3000", "http://0x7f000001:3000"]) rejects(local, value);
for (const patch of [
  { TERRAQO_LOCAL_S22_TEST: undefined }, { TERRAQO_LOCAL_S22_TEST: "true" },
  { TERRAQO_WORKSPACE_INVITATIONS_V1: undefined }, { TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: undefined },
  { DIRECT_URL: database }, { B5_GATE_DATABASE_URL: database }, { AUTH_URL: origin },
] as Environment[]) rejects({ ...local, ...patch }, "http://127.0.0.1:3000");

console.log(`PASS S22 target validator: staging direct/pooler, synthetic local, ${rejected} rejected unsafe targets; no remote operations.`);
