# Remaining platform execution — 3 November 2026

Use with visual-reconciliation-2026-11-02.md. This is an ordered execution queue, not a percentage or a release declaration. S06/S07/S08 interaction fixes are in staging candidate 2ece409; S18 inline revocation is local commit 1427d37. The candidate's postdeploy S23 acceptance PASSED, including hosted expiry and revocation. Independent readback confirmed zero synthetic users/requests/collections/worklogs.

## Next executable blocks

1. CLOSED: S23 expiry/revocation gate, candidate 2ece409ccc920c0da317f80b8a9a35c571c45dd7, deploy 6aea2a045ee12c88f761c44c. Marker, onSuccess PASS and independent zero-fixture readback verified. This does not certify the hosted S08 review form or broader reference fidelity.
2. Include the S18 confirmation change in a later candidate after the current gate finishes. The S23 owner expiry selector has been narrowed to its complete accessible name to avoid ambiguity with the newly labelled manual-grant field. No additional migration.
3. Complete S22 workspace administration separately from operational teams. Current `TerraqoWorkspaceMember` has active/invitedAt/joinedAt and roles OWNER/ADMIN/MANAGER/MEMBER/VIEWER/CLIENT/PROFESSIONAL, but no full workspace invitation lifecycle. Audit effective authorization before adding any UI. Existing write paths requiring last-admin protection: `updateMembershipAction` in app/admin/terraqo/usuarios/page.tsx and `unlinkStaffAccessAction` in lib/server/admin-actions.ts; inspect creation/upsert/deletion paths too. Guard the entire mutation transaction, including unlinking the staff user; serialize per workspace and test two simultaneous demotions/removals. Preserve historic authorship and personal profiles. Invitation acceptance must bind verified identity, workspace, minimal role, expiry and single-use token; store only token hash. Add cancel/rate-limited resend without implicitly delivering mail or granting access. Rehearse any additive migration locally before staging application.
4. Public WorkCase navigation (S05/S09): distinguish recent individual bitácoras from an authorized grouped work case; preserve field projection across CV, list, case and canonical evidence detail. Add back/forward/URL-state and revoked-source coverage.
5. Remaining visual reconciliation: S01/S02 access/trajectory; S03/S04 capture/draft/conflict; full S06–S08 composition/media/context navigation; S09–S11 hosted CV/archive/detail; S12–S17 discovery/conversation/closure; S18 plan/documents; S19/S20 mobile/offline/session recovery; S21 proposals. Consult exact source pages before editing. Existing technical tests do not certify screen fidelity.
6. S24 broadened hosted acceptance: selected attachment bytes, stale request versions and downstream readers, with exact permitted field/media scope and cleanup. Do not treat the prior core gate as full coverage.
7. Release gate: whole candidate diff, migration/backup/rehearsal evidence, explicit target/flags, E2E/navigation and rollback plan. Run only the reviewed production procedure when all required gates pass; do not equate a staging deployment with a public rollout.

## External evidence gaps

S22 progress: local last-admin guard, atomic staff unlink and preservation of existing authority during professional-affiliation approval are implemented and tested against disposable PostgreSQL. See s22-workspace-administration-2026-11-03.md. Invitation lifecycle and hosted/admin browser acceptance remain open; item 3 is not complete.

- Three historical missing media blobs need original bytes or external copies. A reference or URL cannot reconstruct the files.
- Physical-device/screen-reader acceptance is distinct from desktop browser viewport testing.
- Real email receipt requires its own authorized delivery test; mocked HTTP and UI messages are not delivery proof.

No new production operation, migration, payment or customer mutation is performed by this document. Daybreak remains excluded.
