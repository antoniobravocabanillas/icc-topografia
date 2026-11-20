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
