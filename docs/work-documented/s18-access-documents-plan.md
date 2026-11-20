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

## Document lifecycle dependency — bounded uploads

Further audit corrects the earlier broad statement about deletion: the personal web route has GET only, but `portal-professional-documents.ts` already supports guarded native deletion of rejected non-identity documents without imports, including audit, version checks, deferred cleanup and quota retention. Preserve it; it is not general withdrawal/version history.

Web multipart previously parsed without an aggregate byte limit. Both transports now use `readBoundedRequestBytes`: actual-byte cap, deadline and cancellation before multipart parsing, including absent/false Content-Length. Web allows two 10 MiB files plus bounded envelope; native retains its existing cap. Per-file validation is unchanged. Invalid multipart returns 400; timeout returns 408.

Synthetic streaming tests and existing identity, native CV, native identity, native document deletion and cleanup suites PASS. DB/storage are mocked in these suites; no remote state touched. Initial standalone runs needed the repository's server-only preload for Next navigation dependencies; this was a harness correction, not a product bypass. Lifecycle contract and required real-DB concurrency matrix are documented in `proposals/s18-document-lifecycle.md`; fields are proposed only, not added or migrated. No UI change in this prerequisite and no new visual acceptance claim.

Final TypeScript (non-incremental), focused ESLint and diff-check PASS after correcting a HeadersInit union in the test. Run the streaming test with `node --require ./scripts/portal-route-test-preload.cjs --import tsx scripts/test-professional-upload-body.ts`.

## Withdrawal transaction substrate — real local PostgreSQL PASS

Proposed additive SQL and owner-only transaction core implemented, outside active migrations/routes. Real disposable PostgreSQL tests pass legacy compatibility, lineage constraints, concurrent successor creation, withdrawal version/immutable audit, outsider isolation, exact replay, rollback and CV pointer compare-and-set. Retained rows/files are not deleted or refunded. Test cluster stopped and guarded temporary directory removed; no remote database touched. See `proposals/s18-document-lifecycle.md` for test scope and integration requirements. Next: replacement command, all reader/import barriers and account-erasure compatibility before wiring API/UI or requesting promotion. S18 remains open.

Replacement core is now implemented and tested on the same real disposable PostgreSQL harness. Exact operation/fingerprint replay, conflicting payload, owner/company membership, historical review preservation, successor pending status, rollback and CV pointer preservation PASS. Proposed DDL extended with immutable operation fingerprint; no active schema/migration change. TypeScript/ESLint PASS. Next: upload orchestration/compensation and read/import barriers, then remaining integration and staging. Both cores remain deliberately unconnected to live routes.

Durable upload-attempt reserve/finalize/fence now implemented and validated in real local PostgreSQL. Atomic charge/intent, duplicate receipt without recharge, distinct in-flight keys, one commit and retained cleanup reservation, immutable attempt and pending-fence protection PASS. No physical storage orchestration/refund yet. Next blocking dependency: shared quota-floor integration plus cleanup/tombstone recovery, then readers/UI and staging. Proposed schema only; services remain dormant. Details and new test command in `proposals/s18-document-lifecycle.md`.

Recovery/refund core now implemented and tested with PostgreSQL plus real temporary files: committed fence before delete, exact live-reference protection, deadline/backoff, refund-once and persistent zero-unit tombstone revisits. SQL rollback after deletion, late writes and insufficient floor cases pass. TypeScript/ESLint PASS. No automatic dispatcher or live storage adapter wired yet; shared generic quota floor and migration alignment remain release blockers. Next: orchestrator/dispatcher and remaining integration, per the lifecycle handoff.

Upload orchestrator and bounded due-cleanup dispatcher now implemented internally. Actual PostgreSQL/local-file flow passes valid upload, early rejection, exact replay without writing, lost commit acknowledgement, uncertain/late store writes and abandoned reservation recovery. TypeScript/ESLint PASS. Dispatcher is not scheduled or exposed. Remaining: shared floor/schema alignment, withdrawal read/import barriers, Office replacement validation, account-erasure compatibility and API/UI/staging. See the latest checkpoint in the lifecycle proposal; earlier next-step entries above are historical.
