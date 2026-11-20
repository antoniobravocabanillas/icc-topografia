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

1. Build/reconcile the consolidated access screen and navigation to private Documents and Plan subroutes; retain server ownership and avoid another nested modal. Current selection editor is not the full S18 page.
2. Audit existing `ProfessionalDocumentUploader` and server routes for revision replacement, withdrawal, review status, private downloads and tenant isolation; validate with synthetic documents only.
3. Audit professional versus company billing entry points and administrator authorization. Reuse existing entitlements and usage; no charge or new gateway.
4. Run authenticated staging acceptance for owner/recipient/outsider, expiry/revoke and derived reads, documents and administrator/non-administrator plan controls. Promote only a fixed reviewed candidate; no S19 completion claim before S18 acceptance.

Previous S17 staging runtime remains `a187f7c9ebb8ddc7af3a3af71109dcd98bbd3b65` with migration50. See `proposals/s17-disclosure-release-gate.md`; combined plugin-reporting limitation remains explicitly open.
