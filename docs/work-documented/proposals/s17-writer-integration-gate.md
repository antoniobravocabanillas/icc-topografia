# S17 writer integration gate — planned, not deployed

Baseline hosted controls: c5598dcf2fcd16617ac4e808463688f5db0cc8ac, Netlify staging 6affea85f1fdf213a24050b3. Provenance proposal is isolated in codex/s17-closure-provenance. No new schema is applied remotely.

## Ordering and compatibility

1. Rehearse proposed database guards on disposable loopback PostgreSQL; distinguish single-session invariant tests from cross-session races.
2. Implement and test the writer, DTO and editor together in this isolated branch, using its own generated client. Never regenerate the shared staging candidate client against the proposed schema.
3. Prepare an additive, reviewed migration only after the SQL and old/new writer matrix pass. Applying it to staging requires the corresponding migration authorization; existing S16 deploy authorization is not authority to apply this new migration.
4. Deploy the matching generated client only after schema compatibility is verified. A feature flag alone is insufficient: Prisma's implicit scalar selections may query acceptedProposalId even with the new writer disabled. Retain the additive column and provenance history during application rollback.

## Draft and retry contract

- The editor captures expectedAcceptedProposalId from the scope actually shown when its draft begins. Polling must not silently replace that expected identity while retaining edited text.
- A save carries the existing expected closure version and expectedAcceptedProposalId. Under the collaboration lock the service verifies both party acceptances, current accepted proposal identity and actor authority. A changed proposal returns a conflict and preserves the local text for explicit review; it does not silently bind that text to the new proposal.
- Store the authoritative proposal ID only after the precondition matches. Binding is insert-only. Legacy NULL revisions remain NULL; saving a new revision is the explicit attestation path, not a timestamp backfill.
- Include expected proposal identity in the operation fingerprint. An ambiguous response retries the same key and payload. An already committed replay must reconcile before applying current-scope freshness rules, but its response still rechecks current disclosure authorization.
- Submit and ACCEPT compare the persisted binding with the current accepted scope and issue from that exact proposal. A mismatched or legacy unbound revision cannot become a newly provenance-backed certificate without a new explicit revision. Existing private historical certificates remain readable.

## Historical display and sharing

- Project each visible closure revision with its own bound proposal number, role and scope, rather than labeling historical text with today's collaboration scope. Unsent drafts and their binding remain hidden from the professional.
- Show legacy provenance as unavailable, without suggesting a guessed link. Preview corrections and immutable accepted versions without modal navigation.
- A certificate stays private on ACCEPT. Sharing is a separate S06 typed-resource workflow; it requires the professional's explicit confirmation and company authorization for the exact disclosure, recipient and expiry. Certificate access never implies file access.

## Required tests before hosted promotion

Stale editor A after acceptance B; identical/conflicting replay; simultaneous scope acceptance/save/submit/decision in both lock orders; legacy NULL reads and new-save transition; old-writer/new-schema compatibility; rollback with retained schema; historical proposal display after amendment; private draft DTOs; unrelated/inactive tenant rejection; exact-copy certificate emission and one-certificate uniqueness; failure injection with full rollback; fixture teardown without disabling guards.

This is a prepared integration contract, not evidence that the writer, sharing UI, migration, concurrency or S17 phase is complete.
