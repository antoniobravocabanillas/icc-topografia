# S24 enterprise publication — backend preparation, NOT release closure

The original UI document requires exact revision/field/attachment/destination review, explicit approval, separate publication by the professional, and revocation of future access. The previous B3 deny rule is intentional and remains unchanged.

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
