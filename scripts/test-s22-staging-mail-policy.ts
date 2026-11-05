import assert from "node:assert/strict";
import { canSendTransactionalEmail } from "../lib/server/transactional-email";

const simulator = { to: "delivered+s22-0123456789abcdef01234567@resend.dev", tags: [{ name: "category", value: "workspace_invitation" }] };
const origin = "https://terraqo-platform-staging.netlify.app";
Object.assign(process.env, { TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "false", TERRAQO_STAGING_INVITATION_PROBE: "true",
  PLATFORM_STAGING_SUPABASE_PROJECT_REF: "mghdpciewbsowjrjwmwk", AUTH_URL: origin, NEXT_PUBLIC_PORTAL_URL: origin });
assert.ok(canSendTransactionalEmail(simulator));
for (const to of ["reader@example.com", "delivered@resend.dev", simulator.to + ".example.com", simulator.to + ",person@example.com"]) {
  assert.equal(canSendTransactionalEmail({ ...simulator, to }), false);
}
assert.equal(canSendTransactionalEmail({ to: simulator.to }), false);
for (const [key,value] of Object.entries({ AUTH_URL: "https://admin.terraqoglobal.com", NEXT_PUBLIC_PORTAL_URL: origin + ".example.com", PLATFORM_STAGING_SUPABASE_PROJECT_REF: "unexpected", TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "true", TERRAQO_STAGING_INVITATION_PROBE: "false" })) {
  const previous = process.env[key];
  process.env[key] = value;
  assert.equal(canSendTransactionalEmail(simulator), false);
  process.env[key] = previous;
}
console.log("PASS isolated invitation mail policy: simulator, recipient binding, category and environment restrictions.");
