import assert from "node:assert/strict";
import { selectionAccessStagingReadiness as check } from "./lib/selection-access-staging-readiness.mjs";
const required = ["SELECT", "INSERT", "UPDATE", "DELETE"];
const valid = { projectId: "mghdpciewbsowjrjwmwk", projectName: "Terraqo Platform Staging", audit: {
  newTablePresent: true, migrationApplied: true,
  roles: [{ name: "terraqo_staging_runtime", superuser: false, bypassRls: false, schemaUsage: true, schemaCreate: false, tablePrivileges: required }, ...["anon", "authenticated", "service_role"].map(name => ({ name, schemaUsage: false, schemaCreate: false, tablePrivileges: null }))],
  defaultTableGrants: required.map(privilege => ({ owner: "terraqo_staging_migrator", grantee: "terraqo_staging_runtime", privilege })),
} };
assert.equal(check(valid).schemaReady, true);
assert.equal(check(valid).releaseReady, false);
for (const mutate of [s => { s.projectId = "production"; }, s => { s.audit.newTablePresent = false; }, s => { s.audit.migrationApplied = false; }, s => { s.audit.roles[0].superuser = true; }, s => { s.audit.roles[1].schemaUsage = true; }, s => { s.audit.roles[0].tablePrivileges = []; }, s => { s.audit.defaultTableGrants[0].grantee = "PUBLIC"; }, s => { s.audit.roles = []; }]) {
  const input = structuredClone(valid); mutate(input); assert.equal(check(input).schemaReady, false);
}
assert.equal(check(null).schemaReady, false);
console.log("PASS: identity, missing schema/ledger, runtime privileges, public exposure, fail-closed readback; schema readiness never declares release readiness.");
