# S18 private document lifecycle — implementation contract

Status: SQL substrate and withdrawal transaction core implemented and tested locally; not wired to routes or migrated remotely. Existing S18 access screen is a separate local candidate. No remote DDL, payment, message or deployment is authorized by this document.

## Existing paths that must remain compatible

- Personal UI: `components/portal/professional-document-uploader.tsx`; personal GET `/api/terraqo/professional-documents/[id]`.
- Upload service: `lib/server/professional-document-upload.ts`, shared by personal/workspace/native paths. Identity replacement locks profile and preserves verified/in-review identity; keep these guards.
- Native workspace resource: `lib/server/portal-professional-documents.ts` already has bounded listing and guarded deletion. Only rejected, non-identity, non-imported files are eligible. It locks profile then document, checks version, clears matching cvUrl, records cleanup and refunds quota only after physical deletion. This is not the proposed withdrawal lifecycle and must not be casually reused for verified documents.
- CV consumers: `lib/server/cv-import.ts`, `lib/server/cv-import-extraction.ts`; queued work must recheck availability before reading the blob and before publishing extraction results. Existing imports/reference history must survive withdrawal.
- Personal storage accounting includes retained documents; keeping a blob requires retaining its quota charge. Withdrawal must not refund storage.

## State and transaction design

Keep reviewStatus independent from availability. Proposed additive fields: withdrawnAt, withdrawnByUserId, replacesDocumentId and monotonic lifecycleVersion. Each new document remains a distinct immutable blob/review record. No inferred backfill from matching names or reviewer notes. Old rows remain active with no inferred lineage.

Replacement must name an exact owned predecessor with the same type and workspace scope. Use a unique predecessor relationship to prevent branching replacements; preserve historical versions. Lock profile before predecessor, check expected lifecycleVersion, recheck identity/review rules and membership in the transaction, commit the new row and lineage together. Failed attempts compensate only their own stored objects and reserved quota. Never overwrite historical review notes to represent supersession.

Withdrawal uses an explicit owner action and expected lifecycleVersion, with atomic audit. Replaying the same operation must be idempotent; an unrelated stale operation must conflict. Do not hard-delete metadata or blobs. Clear only an exact current CV pointer; do not silently reactivate an older CV. Verified identity needs a separate controlled process; this screen must not silently invalidate identity or modify employment records.

New reads and queued derivations must deny withdrawn documents. Replacements remain historical private records; no public link or broader tenant visibility is created. Decide whether owner-only retained downloads are supported before shipping, then enforce one policy across personal GET, native download and import workers. A read already delivered cannot be revoked retroactively.

## UX and acceptance

Inline actions and confirmation, visible version chronology and review state; preserve file-selection input on conflict. Explain that withdrawal stops future access and does not retrieve downloads or free storage while retained. Do not label withdrawal as rejection. No nested modal required for history.

Tests required before migration promotion: owner/other professional/other tenant/reviewer access, concurrent replace/withdraw/review, exact retry versus stale version, CV pointer compare-and-set, imports started before withdrawal, cleanup failures with quota preserved, legacy rows and native compatibility. Use an isolated PostgreSQL fixture for transaction races and real authenticated staging browser flows after an approved additive migration. No phase-complete claim from mocks alone.

## Current bounded prerequisite

Web and native multipart now use the existing bounded byte reader before parsing. Web ceiling permits two 10 MiB identity files plus 64 KiB envelope; native retains 4 MiB plus envelope. Per-file limits remain unchanged. Missing or understated Content-Length cannot bypass the actual-byte check. Malformed input returns 400 and timeout 408. No schema changes are needed for this prerequisite.

## Local transaction checkpoint

`s18-document-lifecycle.proposed.sql` is outside active Prisma migrations and ends in ROLLBACK. Adds withdrawal actor/time/operation key, lifecycleVersion and exact predecessor. Guards enforce complete withdrawal tuples, immutable identity/lineage, single successor, matching profile/type/workspace, no identity replacement/withdrawal, no restoration and retention of withdrawn/linked rows. No inferred legacy relationships. Withdrawal's immutable tuple is its atomic audit; no private personal document is written to the workspace-required ActivityLog.

`lib/server/professional-document-lifecycle.ts` provides a transaction-only core, not an endpoint. Server actor -> locked owner profile -> locked owned document; validates version and operation key; exact replay returns the same result, stale or different intent conflicts. Clears only the exact active CV pointer. Does not delete files, release quota, rewrite review status or modify completed import history.

Real PostgreSQL 18 disposable-loopback test applies baseline DDL generated from the full current Prisma schema plus proposed SQL. Uses independent sessions, production transaction core via a Prisma SQL-to-pg transport adapter (not mocked predicates), and no .env or remote connection. PASS: legacy preservation; incompatible lineage; single successor; immutable/retained history; invalid/identity transitions; no restoration; concurrent replacements and withdrawals; owner/outsider; stale version; transaction rollback; exact concurrent replay; stable audit timestamp; pointer compare-and-set; preserved storage metadata/review. Owned cluster stopped and resolved temporary directory removed. Reproduce: `node scripts/test-s18-document-lifecycle-local.mjs --confirm=local-s18-only`.

Open integration requirements: replacement command with expected version, authenticated endpoint/CSRF, guarded readers and extraction/apply workers, Prisma schema alignment, UI/native eligibility, and hosted acceptance. The SQL retention guard intentionally rejects generic deletion of linked/withdrawn history; reconcile account-erasure/retention workflows before promoting it. Do not deploy only this SQL or expose the withdrawal core while existing readers still ignore its state. No remote migration or deployment performed.

Final non-incremental TypeScript, focused ESLint and diff-check PASS. No visual check required for this unconnected backend-only block; no hosted or full S18 completion claim.

## Replacement transaction checkpoint

`replaceProfessionalDocumentInTransaction` now accepts a server-prepared file descriptor, locks owner profile and exact predecessor, validates lifecycle version, preserves type/workspace and requires current PROFESSIONAL membership for company-scoped files. Identity remains in its dedicated workflow. Content signature/size and storage reservation must be validated by the upload orchestrator before calling this core; HTTP callers must never supply trusted storageKey/hash directly.

Proposed SQL now includes immutable replacementOperationKey/fingerprint, a complete-tuple constraint and a unique operation per profile. Fingerprint binds predecessor, expected version, content SHA256, name, MIME and size; excludes attempt-specific allocated blob key. Concurrent exact retries return one successor. Reusing a key with changed content or another predecessor conflicts. Retrying after withdrawal returns the committed ID without resurrecting it or moving the CV pointer. A later fresh operation cannot branch an already replaced document.

Old review status/note remain unchanged; successor begins SUBMITTED. Exact current CV pointer moves only if it still references the predecessor. Retiring an old version affects that exact document, not a later successor. New row contains retained storage metadata; no quota release or blob deletion occurs in the transaction core.

Expanded real PostgreSQL suite PASS: rollback/no partial successor, concurrent exact replay, conflicting hash/key/predecessor, foreign-owner/storage-key denial, protected identity, stale version, verified review preserved, successor pending, fingerprint immutability, no replay resurrection, current CV compare-and-set, mixed replacement/withdrawal race, company scope and membership revocation (including replay). Temporary cluster removed after validation. TypeScript non-incremental and focused ESLint PASS.

Next executable integration: upload reservation/compensation for rejected and replayed attempts, read/derivation barriers, Prisma schema alignment and account-erasure compatibility, then authenticated endpoints/UI and approved staging migration. Neither transaction core is reachable from live routes. SQL remains a rollback-wrapped proposal outside migrations; no remote database or production deployment changed.

## Durable reservation and finalization checkpoint

`document-replacement-attempt.ts` adds transaction-only reserve, finalize and cleanup-fence services. Proposed SQL includes a personal-owner attempt ledger (not workspace-required ActivityLog). Reservation locks profile/document and current company membership, resolves the personal plan from locked billing rows/catalog, raises stale quota floors, charges units and writes RESERVED atomically. No quota amount is supplied by the HTTP client. Committed operation replay returns a receipt before charging or allocating another key. Active paid capacity is rechecked for expiry before reservation finishes.

Each parallel in-flight attempt has its own server-generated storage key and charge. Finalize invokes the existing replacement core in the same transaction: one attempt becomes COMMITTED and transfers accounting to the retained document; a duplicate becomes CLEANUP_PENDING and keeps its reservation. A committed-reference fence prevents deleting the successful blob after lost acknowledgement. Immutable owner/key/size/fingerprint, exact committed-document provenance and irreversible pending state are enforced in proposed SQL. No refund or physical deletion is performed by these functions.

Expanded disposable PostgreSQL suite PASS: quota+attempt rollback together; two distinct keys/two charges; one successor under concurrent finalization; replay receipt without new charge; committed reference preserved; cleanup-pending finalization rejected; quota exhaustion leaves no orphan; immutable attempt metadata and state. The shared storage-floor Prisma aggregates are transported to real SQL for these fixtures; no mocked balances. Initial harness runs required react-server condition and correcting the actual direct-message table name; fixed without weakening assertions. All test clusters were stopped and removed, including failed runs.

Reproduction now requires `node --conditions=react-server scripts/test-s18-document-lifecycle-local.mjs --confirm=local-s18-only` for server-only imports. Focused ESLint and non-incremental TypeScript pass.

Next: storage-write orchestration plus durable recovery/tombstone watch, and **shared quota-floor integration across every cleanup/reservation path**. The new reserve includes its own pending ledger in its floor, but existing generic helpers do not yet include it; deployment is blocked until that is reconciled after schema alignment. No live endpoint calls these services. Readers/import barriers, native compatibility, account-erasure policy, UI and hosted acceptance also remain. This checkpoint is not full upload integration or S18 completion.

## Recovery and retained tombstones checkpoint

`document-replacement-cleanup.ts` implements the two-transaction recovery wrapper: commit CLEANUP_PENDING first, then re-read under owner/attempt locks before store I/O. The transaction core checks PostgreSQL xmin against the current transaction ID and rejects a newly written, uncommitted fence. Exact live reference/COMMITTED prevents deletion. Quota floor includes retained documents/other existing resources plus this ledger's pending units; inconsistent balances block deletion.

Physical deletion has a five-second wait deadline, explicitly not cancellation. Failure/timeout retains the reservation and persists bounded exponential backoff. Only confirmed delete plus successful SQL transaction can decrement the bucket and set CLEANED/zero units. Lost acknowledgement or SQL rollback can safely repeat deletion of an already missing blob without duplicate refund. CLEANED tombstones persist and rearm after six hours with zero units, so a late write can be removed without another refund. A scheduler still needs to call these due tombstones; nothing is running automatically yet.

Proposed SQL adds retry metadata and allows zero-unit CLEANED -> CLEANUP_PENDING watch transitions while forbidding reservation changes during pending->pending and reserved->pending. No active migration/schema update. Both reserve and recovery now use `documentReplacementStorageFloor`; the older generic storage helpers still need migration-compatible integration before release.

Real PostgreSQL plus real disposable local-file tests PASS: confirmed blob remains, store outage/backoff, concurrent cleanup refunds once, late-write resurrection removed on watch revisit, SQL rollback after physical delete retains quota until retry, uncommitted fence rejects I/O, insufficient floor rejects deletion, five-second timeout retains charge until later confirmation. The provider is replaced only by a local-file adapter/fault injection; no remote blob operation. Cluster/files were removed after checks. TypeScript non-incremental, focused ESLint and diff-check PASS.

Next executable work: storage-write orchestrator and due-attempt dispatcher, global quota-floor/schema integration, all readers/import barriers and account-erasure compatibility; API/UI and hosted staging acceptance follow. Do not describe S18 as complete or these services as deployed.

## Storage orchestration and dispatcher checkpoint

`document-replacement-upload.ts` now validates a bounded File's name/MIME/signature, computes its SHA256 on the server, reserves in SQL, writes the attempt-specific key, and confirms through the existing transaction core. A committed receipt returns before another write/charge. Fifty-second admission budget, five-second store wait and bounded transaction allowances; no Promise.race around SQL. Errors after reservation commit a durable cleanup fence where budget permits; otherwise the RESERVED ledger remains recoverable. A timed-out provider promise has no continuation that can commit SQL. No direct physical compensation in the request.

Current new replacement parser validates PDF/images only. Existing legacy CV uploads still accept DOC/DOCX; safe Office validation is an explicit integration requirement before exposing equivalent replacement UI. Multipart/HTTP authentication and byte bounding remain the future adapter's responsibility; this internal service accepts server-owned DB/store ports, not request-supplied dependencies. This is not an antivirus scanner.

`dispatchDocumentReplacementCleanup` selects at most five due pending/tombstone rows or reservations older than ten minutes. It admits work against a fifty-second allowance, returns only aggregate counts and defers anomalous blocked/retained pending rows for six hours. Fresh RESERVED rows are excluded. No scheduler or external endpoint has been activated.

Full local PostgreSQL + actual temporary-file flow PASS: invalid PDF before write/charge, receipt without rewrite/recharge, lost SQL commit acknowledgement preserving the committed blob, uncertain write fenced/reclaimed, fresh reservation excluded, abandoned reservation reclaimed, upload timeout followed by late bytes with no late SQL commit and zero additional refund on tombstone cleanup. Earlier lifecycle/quota/recovery cases pass as part of the same runner. Cluster and owned files removed. Non-incremental TypeScript, focused ESLint and diff-check PASS; backend-only change, no UI screenshot claim.

Next: align proposed schema and shared quota floors across all existing cleanup/reservation consumers, enforce withdrawal in downloads/import/apply workers, reconcile account-erasure and Office format compatibility, then authenticated API/UI and staging gate. No remote schema, blobs, production changes or deployment in this continuation.

## Prisma and shared quota alignment checkpoint

Local Prisma schema now models withdrawal/lineage fields and replacement attempts. Generated client with pinned installed Prisma 6.19.3; no dependency upgrade. Validation/generation used an unreachable loopback dummy DATABASE_URL, never provider credentials. The first validation correctly refused missing DATABASE_URL; no database connection was attempted by validation/generation.

The real-PostgreSQL runner now bootstraps immutable pre-S18 schema `f1055b6`, applies the rollback-wrapped proposal only in its owned disposable cluster, then compares the complete resulting structure to current Prisma using migrate diff. Structural diff is empty. CHECK/trigger behavior remains covered separately by the invariant/concurrency tests. Unique indexes use ordinary PostgreSQL nullable uniqueness rather than partial predicates so Prisma can represent them without structural drift.

`personalRetainedStorageUnits` now aggregates RESERVED/CLEANUP_PENDING document-attempt units alongside education attempts and retained resource bytes. All existing callers (generic quota bootstrap, document/experience/education recovery and deletion) inherit this floor. COMMITTED contributes only through the retained document; CLEANED contributes zero. The S18-specific wrapper delegates to the shared floor after owner verification and no longer adds its ledger twice. Unit contract rejects negative/unsafe totals, and real PostgreSQL asserts both pre-commit and post-commit totals.

Validation: Prisma validate/generate, structural parity, full local lifecycle/upload/recovery suite, personal-storage contract, legacy professional cleanup, experience cleanup and portal deletion regression, TypeScript non-incremental and focused ESLint PASS. Synthetic mock clients were extended with zero replacement units where that ledger is intentionally empty; no production fallback silently ignores the new table.

**Deployment prerequisite:** this local candidate now references new Prisma columns/table even through existing storage helpers. It is incompatible with an un-migrated staging/production schema. Do not deploy or run old provider-backed integration scripts until an explicitly approved migration is prepared/applied. SQL remains outside active migrations and no remote DDL was executed. Next: download/import/apply withdrawal barriers, account-erasure and Office compatibility, then API/UI, migration promotion and full hosted acceptance.

## Withdrawal availability and native retention checkpoint

Personal and native private download handlers now authorize before acquiring profile/document locks, retain those locks through the blob read, and return 404 without provider access for withdrawn documents. Existing no-store/sandbox headers and owner/company permission checks remain. The availability helper is not authorization; it serializes against the same profile-first withdrawal order.

CV queue, review, apply and extraction now check source availability inside their protected transaction. Extraction rechecks before publishing derived items after the external service returns. Retrieval excludes imports backed by withdrawn documents. Existing hash receipts cannot silently reuse a withdrawn source. Already completed profile imports are not retroactively erased. Native legacy hard-delete eligibility now excludes withdrawn documents, version ancestors/successors and upload-attempt references, returning a controlled conflict before deletion instead of violating retention constraints.

Validation PASS: real PostgreSQL reader/withdrawal lock contention and subsequent denial, full lifecycle/upload/recovery regression and owned-cluster cleanup; production personal/native GET handler tests (synthetic authorization/storage), CV entrypoint tests including withdrawal during extractor response, and native listing/deletion regression. TypeScript non-incremental, focused ESLint pass. Route/provider tests use explicit test doubles, not hosted sessions; no visual change or hosted acceptance claim.

Reproduce new focused tests with `node --require ./scripts/portal-route-test-preload.cjs --import tsx scripts/test-professional-document-download-availability.ts` and `scripts/test-cv-import-withdrawal.ts` using the same loader. PostgreSQL runner command remains unchanged.

Next: Office format compatibility, explicit retained-history/account-erasure handling (generic cascades remain deliberately blocked), HTTP mutation adapters/UI and cleanup scheduling, then migration preparation and authenticated staging acceptance. Existing candidate still requires the new schema before deployment. No remote migration, provider write or deployment occurred.

## Authenticated mutation adapters and inline private-document controls

Added POST withdrawal/replacement adapters behind `TERRAQO_DOCUMENT_LIFECYCLE_V1` (default off; do not enable before migration/cleanup/staging acceptance). They derive the actor from session, require same origin, reject unknown/duplicate fields, limit actual JSON/multipart bytes before parsing, require expected version and operation key, and never accept storage/hash/quota/actor inputs from the browser. Existing transaction cores retain ownership and company checks. New HTTP contract test passes authentication/origin/type/size/spoofing/duplicate-field boundaries with explicit service doubles; real SQL core evidence remains the prior PostgreSQL suite.

Private supporting-document rows now offer inline new-version and withdrawal actions when enabled. Cancellation performs no request; uncertain retries retain the same key; a conflict disables mutation and offers refresh; a completed withdrawal removes download/preview controls immediately. The UI explains retained history/storage and pending review. Withdrawn CVs are excluded from the active CV slot. Historical predecessor rows keep download availability but do not offer another replacement. Personal portal query now projects the lifecycle fields needed by the controls. Identity and the legacy CV replacement form remain unchanged: Office/CV integration is still pending, not silently treated as complete.

Browser fixture `/s18-documents`: inspected desktop1440 and mobile375; found and fixed existing min-content overflow in forms/cards. Confirmed all main element rectangles fit after correction; inline confirmation has no dialog; cancellation zero requests, two uncertain retries reuse one operation key, successful withdrawal removes links, 409 disables confirm and shows refresh. Browser service responses are synthetic, not hosted acceptance. Initial fixture font404s were resolved with temporary copies of the real Satoshi files; final font readiness and zero console errors checked. Screenshot inspection preceded that font repair, so final hosted typography remains an acceptance item. Impeccable detector returned no findings; TypeScript and ESLint pass. The owned fixture server was stopped.

Remaining before enabling/deploying: Office validation and legacy CV version-flow integration, retained-history/account-erasure path, authenticated cleanup scheduling, migration and hosted end-to-end acceptance. Current schema remains incompatible with the old hosted database. No production change or remote migration performed.

## Authenticated replacement cleanup scheduling checkpoint

Added a five-minute scheduled invocation with an eight-second transport deadline, a background worker with a 55-second API transport deadline, and an internal API calling the existing bounded dispatcher. All three are disabled unless TERRAQO_DOCUMENT_LIFECYCLE_V1=true. Secrets and URLs use the existing deployment-aware resolver; staging cannot inherit a production secret/target. Worker/API require a constant-time bearer comparison. The scheduler requires provider202, worker requires API200, redirects are rejected and late responses after timeout are discarded. No private keys/content/errors are logged; only dispatcher counters and sanitized failures. No remote schedule is active: these are local source files only.

Tests PASS: actual bundled Netlify entrypoints, disabled gate, incorrect/missing secret, wrong method, transport deadline with a non-cooperating adapter, status handling, API auth/isolation before storage, sanitized failure, and the expanded all-job staging-isolation regression. Existing PostgreSQL/local-file suite again passes real cleanup/refund/fence/late-write invariants and removes its owned cluster. TypeScript and ESLint pass. Initial isolation test expected the newly added targets without invoking their functions; extended it to exercise both new wrappers rather than dropping coverage. Anonymous-default-export warnings corrected.

Account-erasure audit: app/lib currently expose no normal account/profile hard-delete service. The one user.delete in public careers compensates a just-created applicant after onboarding failure; it does not target an established document owner. Generic SQL cascade of retained history remains explicitly rejected; a separate audited purge policy/workflow is still unresolved, and this checkpoint does not authorize or implement erasure. Office validation/CV integration and migration/hosted acceptance remain next.

## Fresh staging baseline and trigger hardening

Read-only Supabase verification on 20 November: mghdpciewbsowjrjwmwk is Terraqo Platform Staging, ACTIVE_HEALTHY, PostgreSQL17.11.0.003. Ledger has50 applied migrations, zero unfinished; latest is20261120000200_certificate_disclosure_consent. Replacement table absent and lifecycle columns absent. Runtime has private-schema USAGE but no CREATE, superuser, role creation, database creation or BYPASSRLS; migrator retains schema CREATE; anon/authenticated/service_role have no icc USAGE. No remote write performed.

Proposed trigger functions now explicitly use SECURITY INVOKER and fixed search_path=pg_catalog,icc. Local catalog assertions check both attributes, and the complete PostgreSQL lifecycle/upload/recovery suite passes again with structural Prisma parity. This remains a rollback-wrapped proposal, not an applied migration. Current candidate cannot be deployed safely against the verified old hosted schema.
