# S17 — Certificate disclosure release gate

## Scope

Separate certificate sharing, not worklog publication: immutable selected fields and audience, explicit professional and company approvals of the same digest, public or identity-bound invited access, expiry and permanent revocation. The original certificate remains private. Attachments keep their independent authorization. No automatic mail, CV listing, payments or production operations.

The in-page UI provides exact preview, separate approvals, current status, copy/open link, and inline revocation confirmation explaining that downloaded copies cannot be recovered. Changing fields, recipient or expiry requires a new selection and new approvals.

## Candidate requirements

- New additive migration: `20261120000200_certificate_disclosure_consent` (migration50). Two tables, two SECURITY INVOKER trigger functions and three triggers; existing certificates are not backfilled.
- Flag: `TERRAQO_CERTIFICATE_DISCLOSURE_V1=true`, together with collaboration/closure flags and an explicitly scoped B5 pilot. Default disabled.
- Authorization is evaluated in SERIALIZABLE transactions with bounded conflict retries. Current verified identities, workspace membership, module, recipient and expiry are checked on reads. Public DTO contains only selected fields.
- Mutation bodies are bounded to 4096 bytes, same-origin and authenticated. Actor-bound operation keys reconcile identical retries and reject altered payloads.
- SQL rejects mutable snapshots/history, invalid audience/NULL invited expiry, digest mismatch and approval after revocation/expiry. The application exposes no history deletion; fixture teardown uses owned IDs only.

## Staging promotion order

1. Finish the local authenticated journey and record success plus independent fixture cleanup. Do not equate TypeScript or a partial browser run with phase completion.
2. Fix a candidate commit. Obtain specific authorization for migration50 and that staging candidate. The earlier migration49 approval is not reused.
3. Verify Supabase project `mghdpciewbsowjrjwmwk`, database identity, ledger49, checksums and restricted role memberships. Take a fresh backup and restore it to a disposable local cluster; rehearse the complete reviewed DDL, rollback and preservation there.
4. Prepare a migration50-specific atomic operator artifact. Do not run the migration49 generator unchanged: it pins another candidate, ledger and catalog. Preserve grantor memberships exactly; own new objects with the staging migrator, grant only necessary DML to runtime and revoke public/anon/authenticated/service_role access. Verify functions, triggers, checks and ACLs independently.
5. Apply only the authorized artifact, then deploy only to Netlify site `6b8c43fb-6083-450a-9b85-46a820fb6358`. Isolate deploy credentials from build. Never publish diagnostic branch commit `4004fb8`.
6. Enable only synthetic pilots; repeat dual-party real-login UI, private/public/invited/denied reads, revocation, expiry, altered digest/retry, current membership, concurrent decisions and exact field projection. Inspect actual mobile/desktop viewports, including the shared visitor page.
7. Clean only run-owned database/blob/pilot fixtures; verify absence independently and the served candidate. Leave S17 open until the hosted gate passes. Then resume the next PDF phase; production remains a separate release decision.

## Rollback

Disable the disclosure flag and restore the previously served application after compatibility verification. Preserve additive tables and all consent history; do not delete certificates, revoke historical events by rewriting them, reset schemas or remove guards to obtain a passing test.

## Local checkpoint

Final run `a55a25fd-72f0-4482-8944-6c347cae5848` PASS, exit0: complete S16/S17 real-login PostgreSQL/Next/Chromium journey with the complete migration50 applied to an identity-checked disposable loopback cluster. Independent fixture absence passed and the harness stopped/deleted its local server/cluster. Evidence: `output/s17-disclosure-verified.log`, `output/playwright/s16/a55a25fd-72f0-4482-8944-6c347cae5848/`. The receipt's SHA is base HEAD `a025dc4`, not an assertion that the uncommitted implementation was already deployed.

Verified: explicit separate UI approvals; no access until both; public DTO/page only scope when scope alone is selected; invitation created through UI and readable only by its verified recipient; current workspace membership, verification and actual expiry enforced; immutable database rows and NULL invited expiry rejected; cross-origin and oversized bodies denied; exact retry reconciliation, altered retry conflict, single persisted concurrent approval and approve/revoke race ending revoked. Revocation confirmation is inline and warns about prior downloads. Existing private drafts, source images, corrections, cancellation/replay and tenant isolation continue to pass.

`tsc --noEmit --incremental false`, focused ESLint and snapshot unit tests passed. Inspected actual desktop/mobile disclosure views; no horizontal overflow at 1440/375/320. This does not claim global PDF or hosted visual approval. Earlier runs `0320e037-e916-4c54-a152-bd108b83bb81` and diagnostic `bbe43130-2750-4671-837f-4f98cd94d044` timed out on the exact destination label (options were included in its accessible name); an explicit labelled-by association corrected the product accessibility issue without weakening the test. Their independent cleanup passed.

Staging and production have not been changed in this continuation. Migration50 remains unapplied remotely and needs specific authorization. S17 remains open until the hosted promotion steps above pass; S18 has not been promoted.
