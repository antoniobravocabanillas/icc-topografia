# S22 dedicated staging gate — 4 November 2026

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

1. Fresh isolated staging backup and verified local restoration, including actual role/default-grant audit. Do not treat the synthetic artifact rehearsal as proof that a current provider backup restores.
2. Recheck hosted ledger and review regenerated artifact; apply only through the approved isolated staging procedure, never the production target.
3. Configure the exact candidate SHA/branch, S22 phase and explicit fixture consent on the isolated staging site, then run hosted prepare/deploy/verify and independent cleanup readback. Local passing results do not certify proxy-origin/cookie behavior on Netlify.
4. Complete Evaluator/granular permission semantics and real invitation delivery integration, keeping the current manual-link wording until email delivery is implemented and proven with an authorized recipient.
5. Review combined candidate scope, remaining S23/S24/public UX acceptance and rollback before a separately verified production release.

No remote migration, deployment, customer mutation, email or payment was performed in these phases. Daybreak remains excluded.
