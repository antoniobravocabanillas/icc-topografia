# S22 dedicated staging gate — 4 November 2026

## Hosted deployment and acceptance investigation

Authorized staging configuration now selects `codex/s22-workspace-admin-20261104`, phase `workspace-administration`, the exact candidate SHA, explicit S22 fixture consent and invitations enabled; transactional email remains disabled. Production was not modified. Management API secrets are masked: configuration validates nonsecret destination metadata and secret presence/scopes, while the hosted prebuild validates actual URLs, database authority and migration checksums before fixtures. The Netlify repository update requires the writable `repo` payload with its existing provider/path/URL/installation identity.

First preflight attempts rejected an unsupported connection parameter before any fixture writes. The destination validator now accepts explicit Prisma `pgbouncer=true|false` and `sslaccept=strict`, while still rejecting certificate-validation bypass, duplicate parameters and target overrides. Its 146 negative tests pass; TypeScript, targeted lint and plugin dispatch pass.

Candidate `d55e8106c119254172bf058f3737d06072c7c124`, deploy `6aebdb49de107fb695f5a07a`, passed hosted prepare and compiled/deployed successfully. Independent HTTP readback matched its exact commit/deploy marker and anonymous invitations returned 401. **Authenticated acceptance failed; ready deployment status is not a passing gate.** The verifier's exact-fixture cleanup passed, followed by independent provider readback confirming zero users/workspaces/invitations. Credential-free phase/location diagnostics were added for the next hosted run.

Rollback metadata is retained in ignored `output/s22/netlify-before.json`: prior staging branch `codex/customer-attention-release-20261104`, deploy `6aeb9b79ca0426eb80b3521b`, phase `customer-attention`, invitations previously unset, email disabled. Do not reverse the additive invitation migration or replay it. Hosted browser acceptance remains required before any release decision.

Diagnostic candidate `3182fef51ac12be8e146ac8738e343e69c099459`, deploy `6aebdd26c3520cf08526d453`, localized the failure to waiting for the members heading. The server function log independently identified Prisma P2028: unable to acquire a transaction in time. Authentication and invitation API lifecycle had already passed. The members page now uses bounded `maxWait: 20000` and `timeout: 15000` for its existing RepeatableRead transaction, matching the constrained serverless pool rather than changing authorization or consistency. Hosted verification of this correction is pending.

## Authorized remote schema application

After explicit user authorization, refreshed hosted preflight confirmed the unchanged 46-entry ledger, absent invitation table, no unfinished migrations and zero users/workspaces/worklogs. Applied the previously restored/rehearsed artifact only to `mghdpciewbsowjrjwmwk` through the Supabase migration connector (`s22_workspace_invitations_guarded`). Independent post-read confirms 47 finished entries, zero unfinished, exact invitation source checksum `28d6588fe6dba24a47b7ac1592e96d84d1ba5e0db7775d70289d70d2199972cf`, empty invitation table, all runtime DML grants, no public schema exposure and `postgres` SET restored to false. Existing entity counts remain zero. Production untouched.

Next: deploy the exact reviewed candidate to the isolated Netlify staging site and require its hosted prepare/verify gates. Historical “no remote writes” statements below refer to earlier phases.

## Implemented and validated locally

- Dedicated Netlify phase `workspace-administration` routes prepare/verify to `scripts/run-workspace-administration-staging.ts`, preserving attention and general platform routing.
- Pure destination validator requires exact staging site/project/runtime role, matching database URLs, schema/database/TLS, application origins, explicit fixture consent, invitations flag on and transactional email off. 141 unsafe-input cases rejected. Local mode requires its own synthetic marker and loopback database role.
- Prepare verifies branch, commit/deploy identity, actual database role, private schema, all four relevant migration checksums, invitation table and individual DML grants. It never applies DDL. Verify checks the served commit/deploy marker before and after the browser flow.
- Shared authenticated browser contract runs locally and remotely: anonymous rejection, cross-tenant rejection, replay without token redisclosure, wrong recipient, rotation throttle, replaced-token rejection, cancellation, private projection, member-role UI persistence, verified invitation acceptance, mobile layout, revoked session authority and stopped notification polling.
- Unique fixture IDs are written to a credential-free manifest before writes. Cleanup uses exact IDs in a transaction, then independently reads back zero users/workspaces/memberships/invitations/audit events. Browser external requests are blocked. No invitation email is sent.
- Deployment variable allowlists now include `TERRAQO_WORKSPACE_INVITATIONS_V1`; the template keeps it false. Hosted phase/confirmation/SHA are documented but not configured remotely.

## Executed checks

1. Target-validator tests PASS (141 rejection cases).
2. Dedicated plugin dispatcher tests PASS: prepare/verify, attention/platform preservation, foreign-site exclusion, surfaced failures.
3. Existing platform runner security suite PASS.
4. Disposable PostgreSQL S22 lifecycle/concurrency/HTTP suites and real Auth.js/Chromium flow PASS, including exact-fixture zero-row cleanup.
5. Customer-attention PostgreSQL/authenticated Chromium regression PASS.
6. Full Next.js production compilation PASS, including type validation and 102 generated static pages. One pre-existing unused variable warning remains in admin-actions. **This build uses disposable synthetic data and MUST NOT be deployed.**
7. New/changed scripts targeted ESLint and whitespace checks PASS.

The first shared-verifier run rejected missing explicit local feature/email flags, before fixture writes. Corrected the local harness to pass its sanitized environment; the second run passed. One new lint naming issue in the VM test was corrected and rerun successfully.

## Read-only hosted evidence

Supabase plugin confirmed `mghdpciewbsowjrjwmwk`, **Terraqo Platform Staging**, `ACTIVE_HEALTHY`. Catalog snapshot saved in `s22-staging-ledger-2026-11-04.json`:

- 46 finished migration records; zero unfinished records.
- All 46 source checksums verified offline (existing newline normalization rules preserved).
- Publication review, selection access and attention follow-up are applied.
- `20261104000100_workspace_invitations` is the only missing repository migration; invitation table is absent.
- Anonymous/authenticated roles have no private `icc` schema usage.

This is a point-in-time snapshot, not permission to skip fresh preflight later.

## Migration artifact rehearsal

`prepare-s22-staging-migration.ts` produces `output/s22/staging-migration.sql` only, with explicit transaction, locked exact ledger, migration role, timeout, default runtime DML and public-role exposure checks. It never opens a database connection. Generated against all 46 confirmed source checksums.

`rehearse-workspace-membership-local.mjs --confirm=local-s22-only --staging-artifact` PASS: recreated roles/default grants in disposable local PostgreSQL; unfinished-ledger rejection and rollback; successful application; duplicate application rejection; exactly one new ledger record. S22 service suites passed on the resulting schema. No remote DDL was executed.

## Remaining gates and order

### Backup/restore gate completed later in this run

Fresh read-only provider backup captured with `backup-publication-staging.mjs --confirm=staging-backup-only` from the original checkout's existing protected configuration. Archive path: `C:/Users/Binv/Documents/New project/icc-topografia/output/s24-backup-1793838371470/icc.dump` (historical script prefix; this is the new S22 backup). Size 646318 bytes; SHA256 `5301e98cb65b2a84fbe061ae7efda4e3a07e7adebfa6c16f993d7496e660aa7e`. No connection secret or customer payload is committed.

`restore-s22-staging-local.mjs` verified the archive checksum, restored the real staging schema/data into isolated loopback PostgreSQL, checked its 46-entry ledger, recreated the audited role boundary, applied the S22 artifact locally, verified 47 ledger entries, preserved existing users/workspaces/worklogs/projection counts, and rejected duplicate application. It also verified the migrator SET privilege was disabled again. Manifest records `restoreVerified`, `localMigrationVerified`, `duplicateRejected`, `existingCountsPreserved`: all true. Engine is PostgreSQL 18 restoring a PostgreSQL 17 source; this is not a hosted PostgreSQL 17 execution proof.

Fresh read-only hosted role audit: runtime and migrator are neither superusers, role/database creators nor RLS bypass roles. `icc` owner is migrator; its default table privileges grant runtime SELECT/INSERT/UPDATE/DELETE. `postgres` SET privilege is false; anon/authenticated/service_role cannot use `icc`.

Item 1 below is now complete for this snapshot; refresh if provider state changes. Next executable remote phase is item 2. No remote migration or deployment was executed.

1. Fresh isolated staging backup and verified local restoration, including actual role/default-grant audit. Do not treat the synthetic artifact rehearsal as proof that a current provider backup restores.
2. Recheck hosted ledger and review regenerated artifact; apply only through the approved isolated staging procedure, never the production target.
3. Configure the exact candidate SHA/branch, S22 phase and explicit fixture consent on the isolated staging site, then run hosted prepare/deploy/verify and independent cleanup readback. Local passing results do not certify proxy-origin/cookie behavior on Netlify.
4. Complete Evaluator/granular permission semantics and real invitation delivery integration, keeping the current manual-link wording until email delivery is implemented and proven with an authorized recipient.
5. Review combined candidate scope, remaining S23/S24/public UX acceptance and rollback before a separately verified production release.

No remote migration, deployment, customer mutation, email or payment was performed in these phases. Daybreak remains excluded.
