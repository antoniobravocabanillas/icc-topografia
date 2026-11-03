export function selectionAccessStagingReadiness(snapshot) {
  const blockers = [];
  const audit = snapshot?.audit;
  if (snapshot?.projectId !== "mghdpciewbsowjrjwmwk" || snapshot?.projectName !== "Terraqo Platform Staging") blockers.push("STAGING_IDENTITY_NOT_CONFIRMED");
  if (!audit || !Array.isArray(audit.roles) || !Array.isArray(audit.defaultTableGrants)) return { schemaReady: false, blockers: [...blockers, "INCOMPLETE_CATALOG_READBACK"], releaseReady: false };
  if (audit.newTablePresent !== true) blockers.push("REQUEST_TABLE_MISSING");
  if (audit.migrationApplied !== true) blockers.push("MIGRATION_NOT_RECORDED");
  const runtime = audit.roles.find(role => role.name === "terraqo_staging_runtime");
  if (!runtime || runtime.superuser !== false || runtime.bypassRls !== false || runtime.schemaUsage !== true || runtime.schemaCreate !== false) blockers.push("RUNTIME_ROLE_UNSAFE_OR_MISSING");
  for (const name of ["anon", "authenticated", "service_role"]) {
    const role = audit.roles.find(role => role.name === name);
    if (!role || role.schemaUsage !== false || role.schemaCreate !== false || role.tablePrivileges?.length) blockers.push(`PRIVATE_SCHEMA_EXPOSURE:${name}`);
  }
  const required = ["SELECT", "INSERT", "UPDATE", "DELETE"];
  for (const privilege of required) {
    if (!audit.defaultTableGrants.some(grant => grant.owner === "terraqo_staging_migrator" && grant.grantee === "terraqo_staging_runtime" && grant.privilege === privilege)) blockers.push(`MIGRATOR_RUNTIME_DEFAULT_MISSING:${privilege}`);
    if (audit.newTablePresent && !runtime?.tablePrivileges?.includes(privilege)) blockers.push(`RUNTIME_TABLE_PRIVILEGE_MISSING:${privilege}`);
  }
  if (audit.defaultTableGrants.some(grant => ["PUBLIC", "anon", "authenticated", "service_role"].includes(grant.grantee))) blockers.push("PUBLIC_DEFAULT_TABLE_GRANT");
  return { schemaReady: blockers.length === 0, blockers, releaseReady: false, remaining: ["authenticated E2E", "deployment and feature-flag acceptance"], remoteWrites: false };
}
