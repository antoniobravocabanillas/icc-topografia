# S18 — Access, private documents and plan

## Source and acceptance

Reviewed `C:/Users/Binv/Downloads/02-ui-ux-pantallas.pdf`, physical page19 (S18 mockup) and the textual section “S18 · Accesos, documentos y plan”. Source images are visual references, not production content. Existing scopes, entitlement checks and billing must remain authoritative.

Required: selection, recipient, permission and expiry visible together; deliberate inline revocation explaining downloaded copies; private document upload/review/version replacement/withdrawal; a separate plan/usage route and administrator-authorized company billing; insufficient plan must preserve existing work. Do not expose health/background documents publicly or invent pricing/payment flows.

## 20 November — bounded access-list correction, local PASS

Existing `ScopedSharingConsole` omitted grant scopes, printed internal lifecycle values and retained active controls for expired grants. `SharedAccessRow` now shows granted permissions, readable state, expiry with time and explicit America/Lima timezone. An expiry timer removes actions without a reload; invalid dates and unknown lifecycle states are unavailable. Revocation timestamp takes precedence over a stale ACTIVE lifecycle. This is display state only; server permission checks remain mandatory.

Actual component fixtures: active, persisted-ACTIVE-but-expired, revoked timestamp with stale ACTIVE, malformed date. Chromium PASS at1440/375/320, no overflow, simulated clock crosses the true supplied deadline and removes actions. Existing private/public revocation regression PASS: opening/cancelling makes no request; confirming preserves exact version and DELETE payload. Initial test accidentally counted Next's development button; narrowed to the actual named product action, without changing expected behavior. TypeScript and focused ESLint PASS; Impeccable detector on new row: no findings. Actual mobile/desktop images inspected in `output/s18-access-{375,1440}.png`. These are component fixtures, not hosted authenticated proof or full-screen fidelity.

No database, migration, staging deployment or production changes in this continuation.

Fixture reproduction: start Next against `scripts/fixtures/public-archive` on loopback3190. Supply the existing Satoshi regular/medium/bold assets from root `public/fonts/satoshi` in the fixture's matching public directory before visual testing; the first inspection exposed missing-font404s, then both browser suites and screenshots were repeated with those assets available. Temporary copies and generated next-env were removed and the owned server stopped afterwards. Run `node scripts/test-s18-access-browser.mjs` and `node scripts/test-sharing-revocation-browser.mjs`.

## Next executable blocks

1. Consolidated `/portal/accesos` implemented locally: searchable owner inventory, recipient/scopes/expiry, inline revocation with optimistic version and explicit conflict recovery; navigation to Documents and Plan. Dark responsive layout follows the S18 reference. Hosted authenticated acceptance remains pending.
2. Audit existing `ProfessionalDocumentUploader` and server routes for revision replacement, withdrawal, review status, private downloads and tenant isolation; validate with synthetic documents only.
3. Audit professional versus company billing entry points and administrator authorization. Reuse existing entitlements and usage; no charge or new gateway.
4. Run authenticated staging acceptance for owner/recipient/outsider, expiry/revoke and derived reads, documents and administrator/non-administrator plan controls. Promote only a fixed reviewed candidate; no S19 completion claim before S18 acceptance.

Previous S17 staging runtime remains `a187f7c9ebb8ddc7af3a3af71109dcd98bbd3b65` with migration50. See `proposals/s17-disclosure-release-gate.md`; combined plugin-reporting limitation remains explicitly open.

## Consolidated inventory and remaining lifecycle audit

Owner query constrains both professionalProfileId and createdById, excludes archived selections, and returns no revision bodies, media or bearer tokens. Recipient display uses the grant invitation address or the subject name, never the subject's current private email. Missing profile redirects to profile setup instead of returning 500. Mock query-contract test passes; this is not hosted authorization evidence.

Browser fixture covers search, empty state, navigation, cancel without mutation, 409 without false success, successful grant revocation and subsequent public withdrawal with the updated expectedVersion. Desktop/mobile visual inspection performed; narrow search placeholder shortened after inspection. Existing mutation authorization remains unchanged.

Document audit: private GET checks owner or authorized workspace member and disables caching. The schema has review status but no explicit withdrawal lifecycle or revision lineage. CV/identity replacement rejects older submitted documents; generic documents append. No withdrawal endpoint/UI exists. Implementing this requires preserving review history, import references, storage/quota accounting and private authorization, then synthetic lifecycle tests. Do not delete records/blobs as a shortcut.

Plan audit: personal billing requires a profile; current company billing policy requires active CLIENT_COMPANY ownership via ownerUserId. This change only links existing personal billing and does not broaden that policy or execute payments. Company administrator expectations must be reconciled with the existing ownership model before changing access.

No migration or deployment executed for this inventory candidate. Next: document lifecycle design and implementation, then full S18 authenticated staging acceptance.

Fixture limitation: server shutdown logs exposed a missing preloaded `satoshi-black.woff2` asset (regular/medium/bold were supplied). Functional browser assertions passed, but do not treat these screenshots as final hosted typography approval. Recheck with the complete font set during staging visual acceptance. The isolated owner test initially used unsupported top-level await and direct Prisma mock casts; moved it into async main and made the deliberate mock boundary explicit.

Final local checks after those fixes: `tsc --noEmit --incremental false`, focused ESLint, owner-query contract and inventory Chromium suite PASS. Temporary fixture fonts/generated next-env removed; owned Next process stopped. Existing access-expiry and revocation browser suites also passed during this bounded change. Hosted acceptance remains pending.
