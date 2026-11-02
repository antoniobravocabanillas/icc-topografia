# S24 enterprise publication — backend preparation, NOT release closure

The original UI document requires exact revision/field/attachment/destination review, explicit approval, separate publication by the professional, and revocation of future access. The B3 deny rule remains active while the rollout flag is off. The latest continuation adds approval-gated publication when explicitly enabled after migration.

## Prepared locally

- Proposed `TerraqoPublicationReview` model with per-collection/workspace/version uniqueness, immutable requested snapshot, digest, decision actor/time/comment and separate revocation actor/time/reason.
- Proposed nullable public-projection snapshot column, not yet consumed. No migration has been applied or placed in the auto-applied migration directory.
- Snapshot policy projects only requested fields and normalized selected media, isolates each workspace, excludes precise coordinates/storage keys and rejects deleted or missing material.
- Request, list, decision and revocation services behind `TERRAQO_WORKSPACE_PUBLICATION_V1` (default off).
- Decisions require current active OWNER/ADMIN membership and active workspace, locked during the transaction. Current source/version must match the requested digest. Explicit confirmation is required; rejection/changes require a reason.
- Request and exact decision retries are idempotent. Approval does not publish. Revocation updates the actual public-access root in the same transaction and preserves audit information.
- Lock ordering: collection first, then authority rows. Serializable transactions reject conflicting mutations; caller must handle retryable transaction conflicts without claiming success.

## Verification performed

`npx tsx scripts/test-publication-review.ts` exercises the actual service with transaction doubles: flag gate, ownership, workspace isolation, restricted fields, missing/deleted media, explicit approval, stale versions/content, current administrator authority, exact retries and revocation. This is NOT evidence of real PostgreSQL concurrency or rollback behavior.

## Required before enabling or claiming S24 complete

1. Local API and UI completed in the continuation below. Real authenticated staging acceptance remains pending; do not count fixture tests as that gate.
2. Integrate approval checks with separate publication. Pin the exact public snapshot and revalidate deletion/media permissions. Preserve the existing enterprise deny until every consumer is ready.
3. Reconcile all consumers: public selection, media, discovery, dossier, contextual source and evidence analysis. No consumer may project current mutable date/location outside the approved snapshot or broaden allowedFields.
4. Prepare the final migration only after the consumer design is complete; rehearse on an isolated PostgreSQL database, including concurrent decision/revocation and suspension, retries, stale content and post-revocation reads.
5. Browser E2E with distinct professional/admin/unrelated-workspace identities, real staging permissions and synthetic data; verify both allowed and denied paths plus mobile preview.
6. Complete migration/release gate and explicit runtime enablement. Do not enable the flag merely because the service compiles.

## Other uncovered PDF work

- S22: workspace invitations, acceptance/cancellation/rate-limited resend, effective roles, suspension/removal and last-admin protection are not fulfilled by the existing operational staff screen.
- S09: reconcile public WorkCase navigation and visibility against the specified public CV routes before marking its screen complete.
- Three historical missing document blobs still need original files or external copies; database references are insufficient.

## Continuation — authenticated review API and interface

Completed locally behind the same disabled feature flag:

- `GET/POST/PATCH/DELETE /api/v1/publication-reviews`: authenticated actor derived from session, strict input schemas, 16 KiB actual stream-byte limit, same-origin mutations, private/no-store responses, retryable 409 on transactional conflict.
- Private attachment preview: exact snapshot media id/revision/workspace, current active administrator or requester, deleted/revoked denial, no storage-key disclosure, second permission check after blob loading, no-store and same-origin resource policy.
- Company queue `/admin/publicaciones` uses the selected workspace and requires current OWNER/ADMIN membership. Global admin role alone does not grant publication authority. Navigation is feature-gated.
- Professional selections gain explicit authorization request and read-only status/preview. Requesting authorization still does not publish material.
- Review interface renders only requested fields/media. Confirmation starts unchecked, is reset between reviews and approval is blocked until every selected image loads. Errors, reasons, successful responses, changes requests and revocation are visible.
- Workspace soft-deletion now invalidates reviewer authority as well as active=false.

Validation:

- `npx tsc --noEmit --incremental false`: PASS.
- Targeted ESLint and `git diff --check`: PASS.
- `node --conditions=react-server --import tsx scripts/test-publication-review-http.ts`: PASS; tests actual HTTP handler with injected identity/service doubles, including fake Content-Length and unauthenticated body non-consumption.
- `npx tsx scripts/test-publication-review.ts`: PASS; transaction doubles, not PostgreSQL concurrency certification.
- `node scripts/test-publication-review-browser.mjs`: PASS at 1280 and 375 px. Explicit approval, reason requirement, payload scope, confirmation reset, failed image denial and professional read-only mode. Synthetic API/attachment fixture only, no real company or DB mutations.
- Batched screenshots inspected at `output/publication-review-{1280,375}.png`; no overflow. Impeccable mechanical detector returned no findings.

Fixture reproduction: copy tsconfig.json/package.json/postcss.config.mjs and app/layout.tsx from scripts/fixtures/public-archive into output/publication-ui-fixture, then scripts/fixtures/publication-review/page.tsx into its app/page.tsx. Run `node node_modules/next/dist/bin/next dev output/publication-ui-fixture -p 3191` and the browser script.

Next executable block remains publication integration and all downstream readers (steps 2–3). The enterprise publication deny is unchanged. No migration, feature enablement or production deploy was performed for this continuation.

## Continuation — publication and derived readers integrated locally

- Public selection v2 stores an immutable projection of approved fields and pinned media, including date/location. Publication checks every contributing company approval against the exact collection version and snapshot digest under the collection lock.
- Public selection HTML/JSON, media reads, discovery, dossier source authorization and evidence analysis consume the current authorized root. Discovery loads roots in batches of 100; ranking uses pinned fields. Dossier accessSnapshot can only narrow live allowed fields. Contextual messaging carries need/dossier context, not unrestricted evidence payloads.
- Revoked approvals, inactive/deleted companies, removed worklogs/media, mismatched scopes and narrower live selections fail closed. Public JSON and media are no-store; media permission is checked again after storage I/O.
- Republishing v2 rotates both projection id and slug. Old links and derived access references do not regain access to a new publication.
- With the feature disabled, v2 roots are excluded and the new snapshot/review schema is not queried by the resolver. Legacy v1 remains available.

Validation for this continuation:

- TypeScript, targeted ESLint and whitespace checks PASS.
- Publication projection, review service, HTTP boundary, scoped sharing, discovery, evidence analysis and contextual messaging suites PASS.
- Disposable PostgreSQL 18 rehearsal PASS using loopback only and synthetic users/workspace/evidence. Migration preserved a preexisting sentinel. Concurrent administrators produced exactly one accepted decision. Approval did not publish; public fields stayed frozen after worklog edits; revocation/inactive workspace denied access; republication invalidated old id/URL.
- Rehearsal setup was corrected to explicit search_path=icc. The final runner applies the committed migration artifact itself after comparing it to the generated diff, normalizing schema qualification and Windows line endings. Initial runner failures were local harness issues; all temporary clusters were stopped.
- `prisma/migrations/20261101000100_enterprise_publication_review/migration.sql` was successfully applied to the disposable database. Additive enum, review table/indexes/FKs and nullable snapshot column; no existing table/column/row deletion.
- Reproduce: `node scripts/rehearse-publication-local.mjs --confirm=local-s24-only`. Proof: `output/publication-local-rehearsal.json`. Random password files removed, stopped synthetic-only cluster directories retained.

Next: confirmed isolated staging preflight/backup, migration and enabled authenticated browser E2E; then full release build and production migration/deployment gate. Local PostgreSQL and browser fixtures do not substitute for hosted E2E. No remote migration, production deployment or flag enablement was performed here.

## Continuation — hosted staging identity and migration preflight

Live read-only checks confirmed:

- Supabase project `mghdpciewbsowjrjwmwk`, name `Terraqo Platform Staging`, ACTIVE_HEALTHY, PostgreSQL 17.11.
- Netlify staging site `6b8c43fb-6083-450a-9b85-46a820fb6358`, origin `https://terraqo-platform-staging.netlify.app`, branch `codex/platform-staging-release`. Published staging candidate remains `d28b881cdfcf7576069579a3e00087eb53157a13`, deploy `6ae4f17330916b391143f258`; it does not contain S24.
- Database `postgres`, private schema `icc`: 43 applied Prisma migrations, zero unfinished/unrolled-back migrations. All 43 stored checksums match current local migration bytes exactly. S24 is the only pending local migration.
- S24 review table and public projection snapshot column are absent, as expected before migration.
- Neither `anon` nor `authenticated` has schema USAGE. Runtime role has no superuser, database creation, role creation or schema creation privilege; existing projection DML is available.

Important migration execution detail: connector SQL runs as `postgres`, while the existing default table/sequence/function grants belong to `terraqo_staging_migrator`. Do not assume a connector-created table inherits runtime access. Before hosted installation, choose and verify execution under the intended migrator role or explicitly scoped runtime grants, preserving the private schema and recording the exact Prisma checksum/ledger consistently. Never apply the migration twice through different ledgers.

Added read-only `scripts/check-publication-migration-readback.mjs`. It compares an exported confirmed-staging ledger to repository SQL and requires S24 to be the only pending migration. This is not a backup or live schema drift certification. `scripts/test-publication-migration-readback.mjs` verifies rejection of edited checksums, omissions, duplicates, unknown paths and empty ledgers.

Validation: live ledger comparison PASS (43 exact byte matches); six checker scenarios PASS; `git diff --check` PASS. Readback artifact: `output/s24-staging-migration-readback.json` (ignored, migration metadata only).

Next: verified staging backup/restore evidence, controlled hosted migration with runtime grants and aligned migration ledger, then a new staging candidate and real authenticated S24 browser E2E. No remote writes, migration, runtime flag enablement, production deployment or customer data modifications occurred in this continuation.

## Continuation — backup runner and transactional installation artifact

- Added `scripts/backup-publication-staging.mjs --confirm=staging-backup-only`: verifies the exact Netlify staging site and PostgreSQL host/user/database, invokes pg_dump with credentials in the child environment only, checks archive readability and writes a checksum manifest. It never restores remotely or applies DDL. Archive readability is explicitly not restore verification.
- Attempted backup: BLOCKED. Netlify returns B5_GATE_DATABASE_URL masked; neither local dotenv files nor process environment supplies a staging connection. Initial masked URL parsing was corrected to an explicit fail-closed diagnostic with no input disclosure. No database connection or dump was made. Await a process-level B5_GATE_DATABASE_URL for the confirmed staging runtime role; never use production DATABASE_URL as fallback.
- Added `scripts/prepare-publication-staging-migration.mjs`: validates all 43 readback checksums, prepares the exact committed migration plus transactional guards, executes as the intended staging migrator role, checks each runtime DML privilege, and records the Prisma checksum in the same transaction. Generated artifact is `output/s24-staging-migration.sql`; it must be executed as a whole transaction only through the confirmed staging project after backup/restore evidence. Database name and role checks do not replace external project identity confirmation.
- Preparation and syntax/whitespace checks passed. The generated SQL has NOT been executed or certified against hosted staging. Do not treat artifact generation as migration success.

Next: supply the readable staging connection via process environment, complete backup and disposable local restore, validate transactional installation against the restored database, then apply to the confirmed staging project and proceed with authenticated E2E. Production remains unchanged.

## Continuation — local backup credential supplied

- Confirmed `.env.platform-staging.local` is ignored by Git; credential content was not printed. Backup runner now reads only STAGING_BACKUP_DATABASE_URL from that file without populating the application environment. Administrative backup connection requires the exact confirmed project/host and session port; child connection defaults to read-only transactions.
- Actual pg_dump attempt failed with PostgreSQL password authentication failure for postgres. Host, project username, password presence and URL structure checked without exposing the password; no surrounding placeholder brackets or whitespace detected. No valid archive or restore proof exists from this attempt.
- Await correction of the postgres password for the dedicated staging project. No remote writes, migration or deployment performed. Syntax/whitespace checks pass.

## Continuation — staging backup retry succeeded

- User corrected the local credential and requested a retry. Actual pg_dump completed successfully for confirmed project mghdpciewbsowjrjwmwk, private schema icc, with read-only transactions.
- Archive: output/s24-backup-1793591752281/icc.dump; 633045 bytes; SHA-256 b56606db2597f448be9e9f0e83ccedcee1c00f3c47aa8105145b9976c653897c. Manifest stored beside archive. pg_restore --list succeeded and includes the Prisma migration ledger.
- Archive readability confirmed; restoreVerified remains false. Next: disposable local restore and migration rehearsal before any hosted S24 application. No remote writes or production changes.

## Continuation — restored backup and hosted S24 migration PASS

- Added scripts/restore-publication-staging-local.mjs. Restored the checksum-verified archive into loopback-only disposable PostgreSQL 18; source staging is PostgreSQL 17. Exact installation artifact passed; existing table counts preserved, duplicate installation rejected, runtime DML and private schema verified. Local clusters stopped and password files removed.
- Initial local ownership setup failed on system objects; corrected to icc tables only. Hosted attempts via connector and direct psql failed atomically because postgres had ADMIN membership but SET=false and INHERIT=false for terraqo_staging_migrator. Confirmed ledger remained 43 and review table absent.
- Installation now temporarily grants SET within the same transaction and restores SET=false before commit. Rehearsal reproduces a non-superuser postgres session and verifies the temporary permission is removed; an initial test using SET ROLE instead of session authorization was corrected to model RESET ROLE accurately.
- Applied successfully through Supabase apply_migration to mghdpciewbsowjrjwmwk only, migration name enterprise_publication_review_s24. Prisma ledger now 44, checksum 1cbf0517579579375084bf54c3eb79c448b3f64d4c1687e52d5805b1698d5c46. Table and snapshot column verified. Runtime SELECT/INSERT/UPDATE/DELETE true; anon/authenticated schema USAGE false; temporary SET permission false.
- Users/workspaces/worklogs/projections were zero before and after. No customer rows modified. Backup manifest output/s24-backup-1793591752281/manifest.json records restore and migration rehearsal success.
- Production untouched. S24 application code is not yet deployed or enabled in staging. Next: authenticated browser gate, clean staging candidate deployment and explicit staging-only enablement, fixture cleanup and release validation. Hosted schema success is not application E2E completion.
