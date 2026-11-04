# S22 — workspace authority safety

## Latest checkpoint — clean authenticated local gate

Resolved both findings from the previous authenticated run. Notifications pulse now uses the nullable current workspace resolver and returns private/no-store 403 for a session without workspace access, instead of throwing into a 500. Database errors still follow the normal error handler. Notification monitor clears existing event/count and disables adaptive polling on 401/403; it does not continue displaying stale notifications after losing authority.

Full hydration diagnostic identified `style={caret-color: transparent}` injected into inputs by Playwright's screenshot capture while the reloaded server page was hydrating. Screenshots now use `caret: "initial"`; no suppression or product hydration workaround was added. The E2E gate now rejects any hydration/runtime/500 browser diagnostic (only expected forbidden-resource console messages are allowed).

Validation PASS: all three PostgreSQL service suites; actual Next.js + Auth.js credential-session + Chromium E2E; explicit notification pulse 403 after revocation; no more browser pulse requests over nine seconds (longer than both active/idle intervals); no hydration/runtime/server errors; desktop/mobile captures. TypeScript noEmit, targeted ESLint and git diff --check PASS. Disposable Next and PostgreSQL processes stopped. Three bounded runs in this phase: full diagnostic, corrected gate, final stop-polling assertion.

Next block is release reconciliation/preflight, alongside the remaining S22 requirements: Evaluator/granular-permission semantics and authorized email delivery. This closes the tested local functional gate, not hosted acceptance or complete S22 scope. Preserve current live attention changes when preparing a staging candidate. No staging/production migration, deployment, real customer operation or outbound email performed.

## Latest checkpoint — authenticated local E2E

`node scripts/rehearse-workspace-membership-local.mjs --confirm=local-s22-only --http-e2e` now creates disposable PostgreSQL, runs the service suites and starts actual Next.js with an OS-only environment allowlist, disposable database URL and generated auth secret. Refuses automatic `.env` files; no provider tokens supplied. Real credentials callback/CSRF issues real Auth.js cookies into separate Chromium contexts; no injected actor or forged cookie. Browser external origins are blocked. App/DB stop in finally. Evidence under ignored `output/s22/authenticated/`; screenshots contain synthetic users only and are captured after clearing raw invitation links.

Functional PASS: unauthenticated 401; owner loads real admin shell and S22; role edit through UI persists in PostgreSQL; invitation generated through UI; verified recipient signs in separately and accepts via fragment link; VIEWER cannot list invitations; previously authenticated owner loses list/mutation authority immediately after synthetic membership revocation. Desktop/mobile inspected without horizontal overflow. All prior disposable service suites still PASS. TypeScript, targeted ESLint and diff whitespace validation PASS.

First real run exposed an Origin check failure: Next normalized request.url hostname. Replaced request.url-only comparison with shared `isSameOriginMutation`, binding Origin to HTTP Host plus request protocol. Ignores x-forwarded-host and rejects malformed authority, opaque/missing origins, protocol/port mismatch and paths in Origin. Focused regression script PASS; subsequent authenticated flow PASS. Production proxy protocol/Host behavior still requires staging verification.

This is not a clean release gate: diagnostic follow-up captured a React hydration attribute mismatch on initial render and a notifications-pulse 500 after revoking owner workspace access. Core S22 requests correctly return 403; notification polling currently calls throwing getSessionTerraqoWorkspaceId after membership loss. Bounded three local runs completed (initial failure, corrected functional run, diagnostic run). Next block: isolate hydration mismatch with full browser diagnostic and return appropriate access-loss response from notification polling; rerun authenticated local gate before staging. Evaluator/granular permissions, email delivery and production reconciliation remain outstanding. No remote migration/deployment/mail/customer changes.

## Latest checkpoint — workspace member authority controls

Added workspace-scoped `PATCH /api/terraqo/workspace-members`, behind the existing S22 feature flag. Bounded 4096-byte JSON, same-origin protection, server session identity and strict schema. New policy: active OWNER/ADMIN/MANAGER can manage strictly lower ranks; self-demotion/suspension is allowed subject to last-admin protection. No self-promotion, equal/higher peer modification or OWNER/ownerUserId change. Global account role does not grant authority here. Ownership transfer remains outside this route. Explicit reactivation is allowed only with the same current authority checks.

Mutation locks the workspace, rereads active actor and target membership, checks expected updatedAt against the current record, and invokes the existing last-admin guard before writing. Conflicting stale submissions return 409. Matching desired state is a no-op with no duplicate audit. Timestamp advances monotonically for this path. ActivityLog records before/after role and active state in the same transaction, scoped to workspace; no member deletion, profile deletion or staff unlink occurs.

The page projects allowed role options from the same policy. Each editable row now has `Gestionar acceso`, explicit role/status fields, inline confirmation, saving/error/success feedback and cancel without mutation. Protected owner/equal-or-higher rows have no edit action. Own authority changes reload the page to discard stale authorized UI. Parent state retains saved values when filtering unmounts and remounts rows.

Validation: disposable PostgreSQL rehearsal PASS (existing membership/invitation suites plus new `test-workspace-member-management-postgres.ts`). Covers escalation/ownership rejection, cross-tenant target, stale input, concurrent conflicting updates, retry/no duplicate audit, last-admin rollback, suspended actor rejection, preserved user identity, disabled flag/session/origin/body/schema HTTP contract. Synthetic Chromium component suite PASS including confirmation, suspension, cancellation, version payload and filtering after save. Desktop/mobile screenshots inspected; mobile action moved to its own line to prevent compressed identity text. Targeted ESLint and mechanical visual detector PASS. No real cookie session or hosted E2E was exercised. No production/staging mutation, migration, email or deployment.

Next: combined authenticated local Next.js E2E against disposable PostgreSQL, including permission loss and recipient identity. Then reconcile current released attention changes and perform staging release gates. Reference Evaluator/granular-permission semantics and authorized email delivery remain open. S22 is not production-ready yet.

## Latest checkpoint — 4 November, members and invitation UI

Added `/admin/workspace/miembros`, live membership-authorized member projection, invitation history/search and inline creation/rotation/cancellation. Page 23 of the source PDF was rendered and inspected (`output/s22/reference.png`); the dark two-column list/panel composition is preserved, with a stacked mobile layout. Existing membership roles are read-only in this phase. No Evaluator permissions or delivery claims were fabricated. A feature-gated navigation entry leads here; the page and API remain disabled unless `TERRAQO_WORKSPACE_INVITATIONS_V1=true`.

Added shared `/invitacion-workspace` route on the public, portal and admin hosts. Invitation credentials live only in URL fragments, are captured once and removed from browser history, never placed in query strings or persisted in browser storage. Acceptance is explicit and uses the existing server-verified identity checks. A logged-out recipient signs in and reopens the original private link. Creation preserves its operation key on transport failure; UI locks prevent concurrent clicks. Rotation/cancellation require inline confirmation. Successful mutation followed by failed refresh is distinguished from a failed mutation.

Validation: `node scripts/check-workspace-invitation-ui.mjs` PASS with real Chromium and synthetic API fixtures. Covers search/empty result, failed request and same-key retry, private link, no mutation before confirmation, rotation, cancellation, fragment cleanup and explicit acceptance. Desktop 1440px and mobile 390px screenshots inspected; mobile search width corrected and confirmed. No overflow or browser runtime errors. Initial harness failed because Next Link expected `process.env`; corrected only the esbuild fixture environment, then passed. Targeted ESLint and Impeccable detector PASS. These tests are component contracts, not authenticated Next.js/hosted E2E. Screenshots and generated bundle are local ignored artifacts, not shipped pages.

Remaining S22 gates: role-change/removal controls backed by last-admin transaction guard; reference permission semantics (Evaluator is not a currently supported invite role); authorized delivery integration; real cookie-session/browser acceptance; merge latest released attention changes before staging candidate; additive migration/permissions/backup and release validation. No remote migration, deployment, customer mutation or mail was performed. Next executable block: workspace-scoped member-role actions and tests, then wire inline controls and perform combined authenticated E2E.

## Resume checkpoint — 4 November, authenticated invitation routes

Worktree: `icc-topografia-s22`, branch `codex/s22-workspace-admin-20261104`, based on `b3a9a10`. Paused S22 files were copied selectively; unrelated attention edits were not copied. This branch is not a release candidate: reconcile the live attention release `285b20ad45f79e80e0410967f399f561f0a64781` before preparing deployment.

Implemented `GET/POST /api/terraqo/workspace-invitations` behind `TERRAQO_WORKSPACE_INVITATIONS_V1=true` (disabled by default). Identity comes from `requireUser`; live membership is checked in the service. Writes require same-origin JSON and enforce 4096 actual bytes before parsing. Strict schemas reject injected identity and administrator roles. Responses are private/no-store; listing is capped at 50 and excludes tokens, hashes and operation fingerprints. No email dispatch is implemented.

Validation: disposable PostgreSQL 18 baseline plus exact additive invitation migration and both membership/invitation suites PASS. Request/Response tests PASS for feature flag, session absence, foreign/missing origin, content type, schema escalation, oversized body with absent/false Content-Length, no writes on rejection, creation, replay without token, restricted listing and tenant isolation. Actor resolution is injected in these tests: this is not real cookie-authentication or hosted E2E evidence. TypeScript `--noEmit --incremental false` PASS; targeted Next ESLint PASS without warnings; `git diff --check` PASS. Cluster stopped; no remote database was accessed.

Next: implement S22 members/invitations screen against PDF page 23 and recipient acceptance, then real authenticated browser coverage. Hosted gates remain: merge current production features, staging identity/backup/permissions, migration rehearsal, deployment and release acceptance. No remote migration, feature flag change, deployment, mail or customer mutation occurred during this phase.

Implemented the first bounded S22 block locally. The complete invitation/acceptance UI and lifecycle are not implemented by this change.

## Authority mutations

- Global membership update and upsert now acquire a workspace row lock before inspecting current membership and remaining administrators. Mutation and check share an explicit READ COMMITTED transaction, so a waiter sees the preceding committed removal. Uses existing effective admin roles OWNER/ADMIN/MANAGER; it does not silently change authorization semantics.
- Staff access unlink now locks workspace then staff profile, checks membership, deactivates it and clears the staff association atomically. Rejecting the last administrator keeps both links intact. Other-workspace staff IDs fail closed.
- Professional-affiliation approval preserves the role of an existing member instead of overwriting it with PROFESSIONAL. New memberships still use PROFESSIONAL. Checkout/staff upserts inspected: their update paths do not reduce role or deactivate members.
- Last-admin rejection redirects to a visible explanatory alert in the appropriate admin page. Other errors still propagate. Global SUPER_ADMIN does not bypass the invariant.

## Validation

`node scripts/rehearse-workspace-membership-local.mjs --confirm=local-s22-only` starts a fresh password-protected loopback PostgreSQL 18 cluster, builds the current schema only there, runs synthetic service tests and stops the cluster/removes the temporary password file in finally. It does not use staging or production. The test runtime is the local bootstrap role; this is concurrency/transaction evidence, not hosted role-isolation certification.

Real PostgreSQL checks passed: two simultaneous removals yield one success and one LastWorkspaceAdministratorError; one active administrator remains; role demotion rejects and rolls back an earlier write in the transaction; another workspace's owner cannot satisfy the guard; no-op/admin-preserving transitions remain allowed; rejected staff unlink preserves association; cross-workspace unlink rejects; allowed unlink deactivates membership without deleting users. TypeScript and targeted ESLint checked separately. HTTP admin actions and visible alerts still need browser/hosted acceptance.

## Next block

Workspace invitation model and service: hashed single-use tokens, recipient's verified identity, role/expiry/workspace binding, minimal-role creation, cancellation and bounded resend, transactional acceptance. Preserve explicit mail-send authorization and do not reuse operational team invitations as workspace authority. Add local migration rehearsal and real concurrent acceptance tests before any remote schema operation. Then implement the dedicated S22 screen against reference page 23.

No schema migration, deployment, email or real customer mutation in this block.

## 4 November — invitation service and additive migration rehearsal

Local implementation adds TerraqoWorkspaceInvitation and a dependency-injected service for create, rotate, cancel and accept. Default VIEWER; administrative roles cannot be granted by this service. Tokens are random and stored only as SHA-256 hashes. Verified recipient identity, current issuer authority, active workspace, expiry and pending status are checked transactionally. Workspace row locks serialize creation, cancellation, rotation and acceptance. Existing roles are preserved; suspended memberships cannot be reactivated by invitation. Creation uses a workspace operation key with payload fingerprint, 50/day cap; rotation has 60-second cooldown and five-rotation cap, without extending expiry. No email is sent by these methods.

The additive SQL in 20261104000100_workspace_invitations was applied to a disposable loopback database built from the pre-invitation schema, then both membership and invitation tests passed. Invitation checks cover unauthorized creation, prohibited admin roles, token hashing, replay/payload conflicts, unverified/wrong recipients, concurrent acceptance, tenant isolation, cancellation, token rotation/cooldown/cap, preserving existing roles, suspension, expiry, concurrent duplicate creation and revoked issuer authority. TypeScript and targeted ESLint passed. This is local transaction evidence, not HTTP, UI, email delivery or hosted authorization certification.

Next: dedicated authenticated S22 routes and reference-page-23 interface, bounded request bodies, feature gating and browser acceptance; then staging migration preflight/backup and hosted tests. The migration has NOT been applied to staging or production. No deployment, email or real customer change.
