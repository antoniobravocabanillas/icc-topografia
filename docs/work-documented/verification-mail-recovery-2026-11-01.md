# Verification email recovery — 2026-11-01

## Scope
Company login reported an unverified account and verification resend returned service unavailable. Account verification remains mandatory; no role bypass or manual verification was introduced.

## Changes
- Login submission now prevents the React action's automatic uncontrolled-input reset after handled errors.
- Resend uses a non-submit button with pending/disabled state, network error handling, and full-width presentation. Credentials remain available to retry.
- Transactional sender rejects malformed successful provider responses and records only bounded provider status/code, never message bodies or verification tokens.
- A dedicated domain-restricted sending credential was configured in Netlify production. Masked Netlify secret readback cannot establish whether the original credential was valid; the original key was not revoked.

## Validation
- Transactional template suite PASS.
- Provider mock suite PASS: rejection, malformed success, accepted response, disabled sender, sanitized diagnostics.
- Isolated Next.js browser fixture PASS: unverified login and failed resend retain password; pending state disables duplicate resend. Synthetic credentials only.
- User expressly authorized one verification email to the affected administrator. Shared application renderer/sender accepted the email, and Resend reported delivered (recipient mail server acceptance). Account was left unverified; link consumption is for the user only.
- Receipt is in ignored output/verification-recovery-receipt.json; no credentials or verification URLs are stored in this document.

## Limits
Direct authorized recovery proves token persistence, rendering, provider dispatch and recipient-server delivery; it does not prove authenticated resend through the deployed endpoint with the user's password. Do not request or log that password. Production rebuild and smoke validation are tracked in the local launch handoff.

## Production closeout
- TypeScript check PASS; Netlify production build PASS (2m 55.9s).
- Application commit: adde7c06c0f021605b9a5b0c5f6b2f86c049cb87.
- Published deploy: 6ae7d809dc103c91f8d08349; publication unlocked after validation.
- Production smoke: 20/20 PASS, including portal/company pages, Google callback origins and authorization boundaries.
- Published UI browser test PASS using synthetic credentials and intercepted authentication/resend responses (no additional real email or account mutation). Both failed-login and failed-resend paths retain the password. Mobile screenshot reviewed: output/verification-resend-production-mobile.png.
- Only the authorized verification-token insertion was performed; no migrations, payments, manual account verification or unrelated data changes.
