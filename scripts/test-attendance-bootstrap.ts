import assert from "node:assert/strict";

import { selectProfessionalWorkspaceMembership } from "../lib/terraqo/professional-workspace";
import { compatibleWebAuthnRpIds, resolveWebAuthnContext, selectCompatibleWebAuthnRpId } from "../lib/terraqo/webauthn-context";

function request(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

const productionProxyContext = resolveWebAuthnContext({
  request: request("https://codex-icc-production-preview--iridescent-fenglisu-d6595c.netlify.app/api/terraqo/field-verification", {
    "x-forwarded-host": "portal.terraqoglobal.com",
    "x-forwarded-proto": "https",
  }),
});
assert.deepEqual(productionProxyContext, {
  expectedOrigin: "https://portal.terraqoglobal.com",
  rpId: "portal.terraqoglobal.com",
  rpName: "Portal Terraqo",
});

const hiddenInternalHostContext = resolveWebAuthnContext({
  request: request("https://codex-icc-production-preview--iridescent-fenglisu-d6595c.netlify.app/api/terraqo/field-verification"),
});
assert.equal(hiddenInternalHostContext.expectedOrigin, "https://portal.terraqoglobal.com");
assert.equal(hiddenInternalHostContext.rpId, "portal.terraqoglobal.com");
assert.deepEqual(compatibleWebAuthnRpIds("portal.terraqoglobal.com"), ["portal.terraqoglobal.com", "terraqoglobal.com"]);
assert.deepEqual(compatibleWebAuthnRpIds("icctopografia.com"), ["icctopografia.com"]);
assert.equal(selectCompatibleWebAuthnRpId("portal.terraqoglobal.com", ["terraqoglobal.com"]), "terraqoglobal.com");
assert.equal(selectCompatibleWebAuthnRpId("portal.terraqoglobal.com", ["terraqoglobal.com", "portal.terraqoglobal.com"]), "portal.terraqoglobal.com");
assert.equal(selectCompatibleWebAuthnRpId("admin.terraqoglobal.com", ["portal.terraqoglobal.com"]), null);
assert.equal(selectCompatibleWebAuthnRpId("icctopografia.com", ["terraqoglobal.com"]), null);

const memberships = [
  { workspaceId: "owner-only", role: "OWNER", workRelationship: null },
  { workspaceId: "professional", role: "PROFESSIONAL", workRelationship: null },
  { workspaceId: "employee-admin", role: "ADMIN", workRelationship: { status: "ACTIVE" } },
];
assert.equal(selectProfessionalWorkspaceMembership(memberships)?.workspaceId, "employee-admin");
assert.equal(selectProfessionalWorkspaceMembership(memberships.slice(0, 2))?.workspaceId, "professional");
assert.equal(selectProfessionalWorkspaceMembership(memberships.slice(0, 1))?.workspaceId, "owner-only");
assert.equal(selectProfessionalWorkspaceMembership([]), null);

console.log("PASS: attendance bootstrap uses the public RP ID, accepts compatible Terraqo passkeys and resolves existing company links consistently.");
