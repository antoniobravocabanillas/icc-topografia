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

1. Complete bounded authenticated API, professional request/status UI, workspace-scoped administrator queue and authorized exact-media preview. No approvals selected by default.
2. Integrate approval checks with separate publication. Pin the exact public snapshot and revalidate deletion/media permissions. Preserve the existing enterprise deny until every consumer is ready.
3. Reconcile all consumers: public selection, media, discovery, dossier, contextual source and evidence analysis. No consumer may project current mutable date/location outside the approved snapshot or broaden allowedFields.
4. Prepare the final migration only after the consumer design is complete; rehearse on an isolated PostgreSQL database, including concurrent decision/revocation and suspension, retries, stale content and post-revocation reads.
5. Browser E2E with distinct professional/admin/unrelated-workspace identities, real staging permissions and synthetic data; verify both allowed and denied paths plus mobile preview.
6. Complete migration/release gate and explicit runtime enablement. Do not enable the flag merely because the service compiles.

## Other uncovered PDF work

- S22: workspace invitations, acceptance/cancellation/rate-limited resend, effective roles, suspension/removal and last-admin protection are not fulfilled by the existing operational staff screen.
- S09: reconcile public WorkCase navigation and visibility against the specified public CV routes before marking its screen complete.
- Three historical missing document blobs still need original files or external copies; database references are insufficient.
