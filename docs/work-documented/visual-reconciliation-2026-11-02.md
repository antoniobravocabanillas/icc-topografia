# Visual reconciliation — current checkpoint

Source: supplied `02-ui-ux-pantallas.pdf`, including its written behavior rules. This checkpoint supersedes any inference that B1–B5 technical acceptance alone closes the 24 visual screens. No production deployment in this correction.

## S09 continuation

Inspected PDF page 10, rendered to `output/s09-reference.png`, and rules headed S09. Implemented compact identity, two image-led recent public records, direct canonical record links, archive navigation and in-page Respaldo. Availability remains the declared profile value; last profile update is labelled as such, not an independently measured availability timestamp. Preserved actual social links, PDF route, education, experience, capabilities and public record authorization.

Removed the decorative live-network animation, fabricated reputation percentage and aggregate trust level. Replaced validated-experience percentage with actual validated-experience count. Projects are labelled linked, not completed, and use all returned unique projects rather than a three-item preview count. Status on a featured work follows its actual evidence status.

Reference deviations are intentional: no nonfunctional AI-summary toggle; no invented data or images. The new cards are recent public bitácoras, not a completed public WorkCase implementation. Contact retains the existing account callback; a true contextual conversation transition still needs S15 acceptance.

### Real checks

- TypeScript and targeted ESLint passed.
- CV browser harness passed at 1440, 375 and 320: two work previews, canonical detail, browser Back, archive, in-page Respaldo, PDF URL, no horizontal overflow or uncaught page exceptions.
- Found and fixed a real App Router regression: native hash links followed by client route navigation restored the URL but not the CV on Back. Framework Links now own those transitions; the regression test covers the sequence.
- Screenshot review caught inherited dark text and encoding corruption introduced during editing; corrected before the last run. Local screenshots use explicitly synthetic evidence, not customer photos. The fixture includes the actual public header and production CV component; it does not verify PDF bytes, contact delivery, or database authorization.
- Existing archive browser regression passed again at 1280/375. No database, mail, payment or production changes.

## Screen inventory and remaining acceptance

| Screens | Current evidence | Next acceptance |
| --- | --- | --- |
| S01 Access | Prior recovery/auth work exists | Compare compact form and context return to reference; no new mail dispatch |
| S02 Trajectory | Existing portal | Visual audit of draft-first ordering and four destination links |
| S03–S04 Capture/review | Technical contracts exist | Actual mobile offline queue, draft/conflict UX and visual comparison |
| S05 Work organization | Existing work-case organizer | Public WorkCase projection/navigation is not covered by recent-bitácora cards |
| S06–S08 Sharing/endorsement | Scoped backend contracts exist | Screen-level field preview, draft/send distinction, reviewer journey |
| S09 Public CV | Local presentation and navigation correction validated | Hosted visual check with authorized representative media; contextual contact; public WorkCases |
| S10–S11 Archive/detail | Local in-page filters/calendar and gallery correction validated | Hosted visual and public-field acceptance of release candidate |
| S12–S14 Need/discovery/evaluation | Prior B4 technical evidence | Visual comparison, actual navigation and source citations |
| S15–S17 Conversation/closure | Prior B4 contracts and staging evidence | End-to-end screen-level continuity, not generic login callbacks |
| S18 Permissions/plan | Existing scoped permissions | Visual audit and actual revoke/recovery transitions |
| S19 Mobile evidence | Archive/CV fixture widths covered | Reference comparison and physical-device acceptance remain distinct |
| S20 Recovery | Existing contracts | Context-preserving offline/session/error UI acceptance |
| S21 Proposal | Prior B4 implementation | Compare version/acceptance screens and real navigation |
| S22 Team administration | Confirmed historical gap | Full workspace invitation lifecycle and last-admin protection remain separate work |
| S23 Shared selection | Existing public route | Visual comparison; avoid unsupported “verified” claims and preserve allowed fields |
| S24 Company authorization | Core hosted staging gate passed | Attachment bytes, stale-request and downstream hosted coverage; manual visual sign-off |

This is an acceptance inventory, not a claim that unreviewed screens are absent. Use `s24-preparation-2026-11-02.md` for the current hosted S24 evidence; older reconciliation paragraphs saying S24 is entirely absent are historical. Three missing historical blobs still require originals.

## Next executable block

Render S05 and S23 references and reconcile the public WorkCase/shared-selection flow against existing authorized DTOs. Do not expose source worklogs or profile fields omitted from a selection. Then proceed to authenticated screens in order, recording visual and behavior evidence separately from unit contracts. Keep the current UI diff local until candidate build, hosted visual checks and release review pass.

## Continuation — S05 and S23 local correction

Rendered and inspected PDF pages 6 and 24 (`output/s05-reference.png`, `output/s23-reference.png`) and the written S05/S23 behavior rules.

- S23 public and granted routes now share a typed, authorization-output-only presentation. List shows image-led rows and an access sidebar. `?registro=N` opens a server-rendered detail with previous/next and return navigation; each route render runs the existing public/granted loader before selecting the item. Invalid, repeated or out-of-range indices produce neutral 404. Links do not resolve to the unrestricted source worklog.
- Inline gallery replaces new-tab image navigation. Download controls require an actual `downloadHref`; public visibility does not manufacture a private download permission. Omitted titles receive neutral ordinal labels, never a source lookup. Responsibilities/methods/tools supplied by the authorized DTO are now also visible in private details. Removed the unsupported “verified selection” claim and internal policy-version label.
- Private login redirect preserves the selection and requested detail. Dates use America/Lima. No new author/client identity or evidence verification status is inferred.
- S05 organizer is directly visible, with image preview, thumbnail rows, title search, selected count, confirmation form and separate existing groups. Images use the existing authenticated evidence route; only one image ID per record is selected in the existing owner-scoped query. Original 200-row bound remains visible in the UI.
- S05 no longer silently classifies every selected record as EXECUTION. Phase defaults to unclassified and is omitted from the payload unless explicitly selected. “Mantener separados” clears the selection without a write. Existing backend context checks and versioned unlink are unchanged.

### Validation

- TypeScript and targeted ESLint passed after component/route changes.
- `test-shared-selection-browser.mjs` passed at 1440/375/320: list/detail/back, previous/next, inline gallery, withheld title/metadata, conditional download links, Peru date boundary, invalid-index 404 and no overflow/hydration errors.
- `test-work-case-organizer-browser.mjs` passed at 1440/375/320: explicit selection, incompatible-company disabled state, optional phase payload, no-write cancel, failed-request draft preservation, successful retry and versioned DELETE without deleting source content.
- Desktop/mobile screenshots inspected in a synthetic local fixture. Network writes were intercepted; these are UI behavior checks, not new hosted database acceptance. No customer mutations, migrations, emails or deployment.

### Still open / next block

- Public WorkCase publication is not implied by private grouping. Existing group title/description have no newly authorized public projection; do not add them to the public CV without a defined publication path.
- S23 access-request/contact workflow and active-session revocation/expiry UI remain acceptance work; current server loaders/media routes still enforce authorization. Do not describe this visual correction as full S23 closure.
- S05 needs full hosted group create/unlink verification and broader archive selection beyond the existing 200-row bound if required; current local checks use mocks.
- Next: complete S23 contextual access/recovery behavior, then compare S06–S08 permission and endorsement screens. Hosted visual review and release remain separate gates.

## Continuation — S23 active-session access checks

- Public and granted selection APIs support `?access=check` only after their existing authorization loaders. The response contains a SHA-256 fingerprint of the authorized DTO, not its fields. Normal API payloads are unchanged. Both success and failure responses are explicitly private/no-store.
- Selection pages pass the same authorized fingerprint to a client boundary. It checks on mount, focus/visibility return, reconnection and every 60 seconds while visible. Unchanged background checks preserve the mounted view/gallery. Changed fingerprints hide the old content and refresh the server-rendered selection. Denial, expired grant and network failure replace content with a neutral status and retry; 401 offers login with the exact selection/detail destination.
- Exact grant expiry has a separate local timer; it does not wait for the polling interval. Background browser suspension can delay timers until execution resumes. Revocation polling is bounded freshness, not instantaneous push. Already viewed/downloaded bytes cannot be recalled; server media authorization remains the actual enforcement boundary.
- Old requests are aborted and identity-checked; a superseded success cannot restore a later denied view. No selection content is persisted locally by this change.

Validation: access-boundary browser fixture passed revalidation/state preservation, denial, 503 retry, offline/online, login callback, changed scope and expiry. Snapshot unit checks passed Date/JSON consistency and invalidation on field, media, download permission and expiry changes. Existing scoped-sharing/endorsement contracts passed. Targeted ESLint and TypeScript passed. No hosted/authenticated production acceptance claimed; no deployment or database changes.

Remaining S23: a complete selection-access request lifecycle is absent from the inspected service/API/schema. It needs persisted requester/target context, neutral responses, rate limits, owner pending/decision UI and explicit scoped grant creation. Do not replace this with a decorative request button or silently broaden an existing grant. Next acceptance work is that lifecycle plus real staging revocation tests; S06–S08 visual reconciliation remains queued.


## Continuation — S23 persisted access requests (local, disabled)

- Prepared `TerraqoSelectionAccessRequest` and migration `20261102000100_selection_access_requests`; NOT applied. Regenerated Prisma locally. Feature requires both scoped sharing and `TERRAQO_SELECTION_ACCESS_REQUESTS_V1=true`; no environment flag enabled.
- Request service serializes actor attempts, bounds unique daily targets, uses neutral receipts for unavailable/unknown targets and records pending requests separately from grants. Owner decisions lock collection then request, compare versions and create a new scoped grant atomically with the decision. Exact decision retries use a fingerprint. No existing grant is broadened.
- HTTP checks session, verified email, origin, strict schema and actual body bytes (4 KiB). All replies are private/no-store. Owner queries are scoped to collection creator.
- Connected owner pending inbox and unavailable public/private selection views. Unavailable views are neutral HTTP 200 request surfaces only when the new flag is enabled; otherwise prior 404 behavior remains. No unavailable selection title/content is returned. Active-session denial can offer the same form.
- Approval displays selected fields/media counts, requires explicit confirmation and expiry; downloads default off. Request and decision errors preserve the draft. Inline forms, no modal.

Validation: HTTP tests passed feature/auth/origin/schema/body limits, spoofed actor rejection, neutral receipt and expiry policy with mocked service. Browser tests passed at 1440/375/320 for retry, explicit approval, download opt-in, rejection payload and no overflow. Mobile screenshot inspected; corrected form contrast on light containers and repeated browser checks. Targeted ESLint passed. These tests DO NOT establish database concurrency or hosted acceptance.

Remaining before enabling: PostgreSQL migration/role isolation and concurrent approval/retry tests; requester-facing status and navigation to the granted private selection (especially requests from revoked public links); stale collection-version request renewal and retention for unknown targets; authenticated staging end-to-end checks. Current approval creates a grant but is not yet a complete requester delivery flow. No emails, production changes or deployment. Next block is requester recovery/navigation, then database acceptance. Broader S06–S08 visual audit remains pending.


## Continuation — S23 requester recovery

- Added an authenticated target lookup to the existing request API. It binds the target hash to the session user and requires an APPROVED request with a matching, active, unrevoked, unexpired VIEW_COLLECTION grant. Collection must not be archived. Unknown/pending/declined/withdrawn targets return the same `{available:false}` response. The positive DTO contains only a private selection route and expiry, not collection content or identity.
- Request form now offers “Comprobar mi acceso”, including on return to an old public link. A current grant offers “Abrir selección autorizada”. Revoked public links are not republished; the private route performs its own existing authorization. Login preserves the target URL. The link clears on failed recheck, expiry or offline event. No automatic messages or email were sent.
- GET query rejects duplicate/unexpected parameters; requester identity cannot be supplied in the query. Existing owner GET without parameters remains unchanged. Replies remain private/no-store.

Validation: HTTP boundary tests passed, including target query validation and session identity. Recovery service query/projection tests passed using a mocked Prisma delegate (NOT a real database). Browser fixture passed at 1440/375/320 for no grant, current approval, failed recheck, login callback, and prior request/decision behavior. Mobile screenshot inspected; no overflow. `git diff --check` passed. Runtime data and production unchanged; migration and feature flags remain unapplied/off.

Next: PostgreSQL concurrency and role-isolation acceptance for requests/approval, stale-version renewal behavior, and authenticated staging journey. Recovery is a manual check on the original target, not a notification or requester-wide inbox. S06–S08 visual reconciliation is still pending. Do not mark S23 or release complete based on these mocked tests.


## Continuation — S23 real local PostgreSQL acceptance

Environment: PostgreSQL 18, fresh synthetic cluster `output/s23-access-test-pg`, loopback-only port 55439, database `terraqo_s23_access_test`. No restored customer data. Generated the pre-request baseline from `output/schema-before-access.prisma`; applied the exact new migration only to this disposable database. Runtime role `s23_test_runtime` is not superuser; anonymous test role has schema usage but no table access. This does not certify staging role/default privileges.

Added `scripts/test-selection-access-postgres.ts`, guarded by loopback URL, explicit database-name confirmation, dedicated runtime username and synthetic-only flag. Real service calls passed: eight simultaneous requests produce one row; eight simultaneous approvals produce one grant; exact replay is idempotent; competing decline is rejected; unauthorized owner cannot decide/list; invalid expiry/download approval creates no grant; stale collection version fails closed; decline grants nothing; revoked/expired access cannot be recovered; daily limit counts unknown targets. Successful run observed seven serialization conflicts in approval and one committed decision. SQL confirmed anonymous SELECT/INSERT privileges false, runtime UPDATE true, actual anonymous SELECT denied. Invalid status update rejected by CHECK constraint and rolled back on connection close.

The first concurrency run exposed Prisma `$queryRaw` serialization errors as P2010 with SQLSTATE 40001, rather than P2034. Fixed HTTP classification for precisely 40001/40P01 to return recoverable 409. Added HTTP regressions for both; other raw-query errors remain server failures. No blanket retry or automatic repeated mutation introduced.

Validation: real local database test passed after fix; HTTP regressions passed; targeted ESLint passed. No UI change in this phase. Full hosted journey, staging migration/roles, stale-request renewal and release remain open. New feature remains off. Next bounded block: stale-scope request renewal without silently changing the scope the owner reviewed, then authenticated staging acceptance. S06–S08 visual reconciliation remains queued.


## Continuation — S23 explicit review of changed scope

- Approval now requires `expectedCollectionVersion` for the exact selection displayed plus explicit `scopeChangeConfirmed`. Server locks still apply; the current collection version must equal the reviewed version. If it differs from the request-time version, the extra confirmation is mandatory. No automatic renewal or implicit permission broadening.
- Owner inbox shows a changed-selection notice with an unchecked review checkbox. Approval remains disabled until the new scope, normal consent and expiry are confirmed. Card identity includes collection version so refreshed scope resets approval inputs. Rejection remains available without consent or expiry.
- Preserves the request-time collection version; the decision fingerprint includes reviewed version and scope confirmation for exact replay. No new schema migration required. A requester need not be rejected and wait 24 hours solely because another grant incremented the collection version.

Validation: PostgreSQL synthetic runtime test passed stale reviewed-version rejection (even when confirmation is true), missing changed-scope consent rejection, explicit current-scope approval, and exact replay with one grant. Existing concurrency/rollback/isolation/limit checks passed again. HTTP checks and targeted ESLint passed. Browser tests passed at 1440/375/320, including disabled approval before changed-scope consent and exact reviewed-version payload. Mobile screenshot inspected. Local test cluster stopped after tests. Production/staging unchanged; feature remains off.

Next gates: authenticated staging request-to-grant flow, staging role/default-privilege audit and controlled migration; requester-wide history/notifications and unknown-target retention are not implemented. S06–S08 reference reconciliation remains pending. This local acceptance is not a release declaration.


## Continuation — S23 confirmed staging catalog preflight (read-only)

Live Supabase MCP confirmed project `mghdpciewbsowjrjwmwk`, name `Terraqo Platform Staging`, ACTIVE_HEALTHY, PostgreSQL 17.11.0.003. Read-only catalog audit found 44 applied Prisma migrations; S23 access-request table and migration are absent. No remote writes, DDL, deployment, emails or fixture creation occurred.

- `terraqo_staging_runtime`: no superuser, no BYPASSRLS, schema USAGE present, schema CREATE absent.
- `terraqo_staging_migrator`: schema USAGE/CREATE present, not superuser/BYPASSRLS. Its icc table defaults grant runtime SELECT/INSERT/UPDATE/DELETE.
- anon/authenticated/service_role have no USAGE or CREATE on icc. New-table privileges cannot be validated until it exists. Do not infer future table isolation from schema defaults alone.

Added read-only `scripts/selection-access-staging-audit.sql` and offline checker `scripts/check-selection-access-staging-readiness.mjs`. Saved live identity/catalog readback in ignored `output/s23-staging-catalog-audit.json`. The checker reports exactly REQUEST_TABLE_MISSING and MIGRATION_NOT_RECORDED. It never reports release readiness, even for a valid synthetic schema snapshot. Tests cover wrong target, missing schema/ledger, unsafe runtime, public grants, missing runtime privileges and incomplete readback. Tests, ESLint and diff whitespace validation passed.

Re-run process: verify staging project identity; run audit SQL through the confirmed project connection; save `{projectId,projectName,observedAt,audit}` JSON; run `node scripts/check-selection-access-staging-readiness.mjs <readback.json>`. Non-ready result is an intentional nonzero exit, not a successful migration or E2E acceptance.

Next dependent gate: controlled staging migration using terraqo_staging_migrator and fresh backup/rehearsal evidence, followed by the same catalog audit and authenticated synthetic request/approval/revocation journey. New local UI/service is not yet deployed to staging. Independent executable work remains S06–S08 visual reconciliation. Preserve the prior no-production-change boundary; this preflight does not authorize or perform a production release.


## Continuation — S23 fresh backup and exact migration rehearsal

- Fresh staging-only pg_dump completed through the existing guarded backup script. Archive: `output/s24-backup-1793678990358/icc.dump` (historical backup-prefix retained), 639047 bytes, SHA-256 `8b4831d375920e0c0e2c032fe7c5117eb4032582a37288338f0c8a1ea36939d5`. Credentials remained in child environment; no database writes. Manifest now records successful local restore/rehearsal.
- Re-read staging's 44 applied Prisma ledger entries. Added S23-specific readback checker, SQL artifact preparer and local restore rehearsal scripts. All ledger checksums matched repository migrations, allowing only CRLF normalization. Sole pending migration: `20261102000100_selection_access_requests`.
- Prepared `output/s23-staging-migration.sql`. It requires whole-artifact transaction execution, locks/checks the exact ledger, uses the staging migrator role, enforces runtime CRUD and rejects schema/table access for anon/authenticated/service_role. Generated migration checksum: `78be174a7b140054e3c4b5813e67d07e5880a4c322292b298337a9ff0e534e69`. The artifact was NOT run remotely.
- Restored the fresh archive into a temporary loopback-only PostgreSQL 18 instance with random password; source is PostgreSQL 17. Rehearsed the exact artifact: ledger 44 to 45, preserved counts for users/workspaces/worklogs/projections, runtime read granted, public schema access denied, temporary role-switch privilege restored. Duplicate installation rejected without changing ledger. Local server stopped and temporary password file removed by script finally block.

Validation: exact artifact rehearsal passed; backup SHA and readability passed; targeted ESLint and git diff whitespace checks passed. This is backup/migration preparation, not hosted API or visual acceptance. No remote migration, deployment, production write or feature flag activation.

Next dependent operation: refresh/check staging identity and ledger, apply the prepared artifact transactionally only to staging, read back checksum/table/effective grants, then deploy staging and run authenticated synthetic request/approval/revocation journeys. The backup is point-in-time evidence, not indefinitely current. Keep release blocked until these hosted checks pass; S06–S08 visual audit remains independent pending work.


## Continuation — S23 migration applied to confirmed staging

Executed the reviewed SQL artifact through Supabase apply_migration ONLY on `mghdpciewbsowjrjwmwk` (`Terraqo Platform Staging`, ACTIVE_HEALTHY). Immediately before execution, live 44-entry ledger matched the rehearsed readback; backup SHA, restore evidence and exact migration bytes passed again. Supabase operation `selection_access_requests_staging` succeeded.

Post-write readback: Prisma applied count 45; `20261102000100_selection_access_requests` checksum `78be174a7b140054e3c4b5813e67d07e5880a4c322292b298337a9ff0e534e69`; table owner terraqo_staging_migrator; runtime effective SELECT/INSERT/UPDATE/DELETE; anon/authenticated/service_role no schema or table access. Temporary postgres SET-role permission restored to false. Users/workspaces/worklogs/projections counts remained zero; new requests table empty. No application records created or modified.

Saved `output/s23-staging-postmigration-audit.json`. Offline readiness checker now returns schemaReady=true, blockers=[], releaseReady=false. Its remoteWrites=false describes the checker only; this phase DID apply staging DDL and the migration ledger entry. Prior sections saying migration pending are historical and superseded by this section.

Next: staging-only application build/deploy with the S23 flag explicitly controlled, then authenticated synthetic owner/requester/outsider E2E including revocation and expired grants, with fixture cleanup. Application deployment and flag activation were NOT performed in this phase. Production schema, application and customers remain unchanged. S06–S08 visual reconciliation still pending; no release-ready claim.

## Continuation — hosted S23 acceptance and deployment-target incident

Staging candidate `41ddcec2f2a67896d809f9efd21603fef9cbf04a` published in deploy `6ae9679bee13fc7640800afd`. Netlify plugin readback reports onSuccess=success, title="Staging gate verified", summary="PASS s23" with this exact candidate and deploy. This is post-deployment acceptance, not merely a successful build. Authenticated synthetic owner/requester/outsider flow passed UI request and approval, permitted-field projection, outsider denial, and revoked-grant denial. Independent Supabase readback after completion confirmed zero users, requests, collections and worklogs. Expired-grant behavior was tested locally previously; this hosted script does not exercise expiry and must not be described as doing so.

Deployment configuration incident: Netlify CLI env:set used the locally linked production site despite the supplied staging --site argument. Five new overrides were written there. They were subsequently removed through explicit siteId API calls. Independent production readback confirms none of those five overrides remain and published deploy remains `6ae7ec06e99b195a657aa8be`. No production build/deployment or database mutation was performed. This was a corrected production configuration write, not a claim that production was never touched; pre-write values were not independently snapshotted.

Added `scripts/configure-selection-access-staging.mjs`: uses the pinned local CLI SDK, explicit staging site ID, asserted name/URL and exact readback for five non-secret settings. Configuration and build remain separate operations. Do not use env:set CLI for this workflow. Staging S23 is enabled; workspace publication is false. Production release remains blocked pending remaining acceptance.

Next: S06–S08 visual reconciliation against the reference PDF, then remaining hosted acceptance (including expiry). Requester-wide history/notifications and unknown-target retention remain explicit gaps; do not infer global completion from PASS s23.

## Continuation — S06 field-level preview

Reviewed source PDF page 7 (S06 render) and written S06–S08 rules. The existing scope preview showed the source title regardless of field selection and only counted permitted fields. Replaced it with the actual selected values, labelled by field. Deselecting a field removes its value from the preview; unselected title stays hidden there. The owner's source-selection card still identifies the source. Added owner-scoped revision fields to the authenticated page query; no public DTO or permission change. Date preview uses America/Lima. Media remains explicit opt-in with count and authorization caveat; this is not an attachment-image preview.

Field selectors now have visible native checkboxes, 44px minimum targets and focus-within rings. Preserved private-first creation and explicit later grant/publication actions. No modal added. This bounded correction is not a claim that the whole S06 layout matches the reference: attachment preview, visibility layout and company-authorization guidance still need reconciliation. S07 final recipient confirmation and S08 reviewer UX remain next.

Validation: TypeScript and targeted ESLint passed. Real browser against local production component with synthetic fixture and intercepted API passed at 1440/375/320: selected values, deselected fields, Peru calendar date, explicit media inclusion, no writes before confirmation, exact submitted scope, success state, no horizontal overflow. Inspected 375px screenshot. Persistent fixture: scripts/fixtures/scoped-sharing-preview.tsx; mount it at /compartir in the existing local Next harness (port 3190) for scripts/test-scoped-sharing-preview-browser.mjs. First browser run exposed hidden-checkbox interaction; corrected controls. Second run required locale punctuation tolerance in the date assertion; third passed. No remote deployment or database write in this phase.

## Continuation — S07 recipient confirmation and scoped preview

Reviewed reference page 8 and written rule requiring final recipient confirmation within the form. Added selected-value preview, excluding unselected fields and attachments. Expanded only the owner-filtered revision query to supply the requested values and corrected its nested worklog/date mapping. Existing reviewer projection remains unchanged.

Creating-and-sending now requires unchecked, explicit recipient/scope confirmation. Consent is tied to current email, revision, relationship, expiry and scope; changed values invalidate it. Draft creation still requires no send consent and sends nothing. Sending an existing draft requires its own confirmation tied to version, recipient, revision hash, scope and expiry. Kept versioned PATCH, existing backend authorization and no modals. Field chips now use visible checkboxes, 44px targets and keyboard focus rings. Mobile review corrected arbitrary word splitting in confirmation copy.

Validation: TypeScript, targeted ESLint and whitespace checks passed. Local real-browser fixture with intercepted API passed 1440/375/320: preview excludes title, draft remains available, send disabled before consent, editing recipient disables send again, no implicit writes, exact POST scope/recipient, and separately confirmed versioned draft PATCH. Inspected mobile screenshots at 375 and 320. Fixture scripts/fixtures/endorsement-preview.tsx mounted at /respaldo-preview in local port-3190 harness; test scripts/test-endorsement-preview-browser.mjs. These tests do not certify email delivery or hosted server behavior. No remote writes or deployment.

Next: S08 reviewer UX (per-aspect decisions, optional/required comments, response summary and navigation), then remaining full visual fidelity work for S06/S07 and hosted expiry. This is a bounded S07 interaction correction, not certification that S06–S08 or the entire release is complete.

## Continuation — S08 per-aspect review and hosted-expiry preparation

Extracted EndorsementReviewForm with no default answers, explicit personal-capacity notice, full decision labels, optional confirmation comments, required nonblank clarification, and per-field summary before submission. Preserves answers on failure; identical payload retries reuse the idempotency key. Immediate in-flight guard prevents duplicate local sends; success disables resubmission. Parent keys the form by request/version/revision hash so a refreshed version cannot inherit old responses. This does not broaden server-authorized scope or alter backend decisions.

Validation: source page 9 inspected; local browser fixture passed 1440/375/320, optional/required comments, exact response payload, failure recovery with same key, no preselected answers, completion lock and version reset. S07 regression passed. TypeScript, targeted ESLint and whitespace checks passed. Mobile screenshot inspected. These remain mocked-HTTP UI tests, not hosted S08 acceptance or full visual parity.

Extended hosted S23 test to expire only its synthetic grant, verify denied detail and neutral recovery, restore that fixture's expiry, verify availability, then test revocation. Added finite browser action/navigation timeouts. Not yet executed remotely at this checkpoint. No schema change. Next operation: controlled staging candidate build with existing cloud runner, then read back postdeploy gate result and fixture cleanup. Broader screen inventory above remains open; no 100% claim.

## Continuation — S18 deliberate revocation

Private-grant and public-projection revocation now open an inline confirmation, not a modal. Opening/cancelling makes no API write. Explains that downloaded copies cannot be recovered. Confirmation retains exact grant/collection version payload and resets when that version changes. Added visible recipient/expiry labels to private-grant controls. Server authorization and revocation behavior are unchanged.

Validation: browser tests with actual ScopedSharingConsole and synthetic/intercepted HTTP passed 1440/375/320, cancel-without-write, explicit private/public DELETE payloads and no overflow. S06 preview regression passed. TypeScript and targeted ESLint passed; mobile screenshot inspected. Fixture scripts/fixtures/sharing-revocation.tsx at /revocar-preview; scripts/test-sharing-revocation-browser.mjs. S18 permission listing and other plan surfaces still need full reference reconciliation. Changes are local only and are not in the in-progress 2ece409 staging candidate.

## Continuation — hosted S23 expiry accepted

Netlify postdeploy plugin onSuccess=success, summary PASS s23 for candidate `2ece409ccc920c0da317f80b8a9a35c571c45dd7`, deploy `6aea2a045ee12c88f761c44c`. Public staging marker matches both values and exact staging site ID. Extended test verifies synthetic expired grant denies detail/recovery, restoration of fixture expiry permits access, then revocation denies again, alongside owner/requester/outsider isolation and scoped projection. Independent Supabase readback after gate: users=0, requests=0, collections=0, worklogs=0.

S06–S08 code is now deployed to staging; S08 browser interaction acceptance remains local/mock HTTP, not a hosted review-flow claim. S18 local changes await a later candidate. Production readback retains deploy `6ae7ec06e99b195a657aa8be` and none of the five previously misplaced staging overrides. No production configuration/database/deployment mutation in this continuation. Remaining ordered queue: remaining-platform-execution-2026-11-03.md; next local work is S22 authority/invitation lifecycle, with S18 inclusion in the next controlled staging candidate.
