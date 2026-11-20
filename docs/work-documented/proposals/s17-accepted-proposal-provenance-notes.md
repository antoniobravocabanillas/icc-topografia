# S17 accepted-proposal provenance — LOCAL PROPOSAL, NOT APPLIED

Base/worktree: `f0b34c58c54bd92a9af09d66dc9e199cf43354af`, `icc-topografia-s17-provenance`.
Prepared 2026-11-20. Initial worktree clean. No local ancestor/repository/nested
`AGENTS.md` found; supplied session instructions apply. Reviewed the prior audit at
`../icc-topografia-s22-evaluator/output/s17-next-slice-audit.md` (audit base `7776439`)
and rechecked current schema, closure/collaboration writers and S16 cleanup at this base.

## Proposed delta and boundaries

Only `prisma/schema.prisma`, the adjacent `s17-accepted-proposal-provenance.proposed.sql`
and this note are changed. The schema adds a nullable indexed relation from closure
revision to proposal, its inverse, and explicit DELETE/UPDATE RESTRICT. No certificate
proposal FK is needed: its existing unique revision FK supplies that path. No sharing
models, migration directory files, application changes or backfill are included.

Binding is **insert-only**, including NULL: existing NULL cannot become an ID later.
Old writers can still insert NULL and use the existing lifecycle; those rows carry no
new provenance assurance. New bound writers must create a fresh revision, never infer
identity from timestamps. Database installation alone does not enable bound writes.

| Guard | Why it is needed / intentionally permitted |
| --- | --- |
| Proposal FK + index | Existence and live-reference deletion/key protection; not sufficient for collaboration identity or payload immutability. |
| Revision INSERT | Same collaboration, accepted proposal and both party records; workspace acceptance actor matches proposal creator, professional actor matches collaboration and decision actor. No timestamp inference. |
| Revision UPDATE | Freeze ID, parent, proposal, content, creator, creation time and save receipt. Allow status, submit receipt/time and decision receipt/actor/comment/time for existing submit/decision/supersede flows. Domain authorization/state machine remains mandatory. |
| Proposal UPDATE | Freeze all fields except lifecycle status while a bound revision exists, including scope, role, revision number and acceptance decision evidence. A status-only transition remains legal. |
| Acceptance UPDATE/DELETE | Freeze evidence only while referenced, including moves into/out of a pinned proposal. No INSERT guard: two required parties, enum and existing unique key already bound the set. |
| Closure/collaboration UPDATE | Prevent bypass by moving closure to another collaboration or rewriting workspace, professional or conversation identity. Current revision pointer, versions, accepted-scope pointer and lifecycle remain mutable. |
| Certificate INSERT/UPDATE | For bound revisions only: match closure/revision pairing, proposal number/role/scope and copied closure text, require accepted revision/professional issuer/private default; then freeze certificate row. Private default is not authorization. |

No unconditional DELETE trigger on proposals, certificates, revisions or closures.
The proposal FK and existing certificate FKs provide necessary live-reference limits.
An acceptance DELETE guard is necessary because a proposal FK does not pin its child
evidence. It stops protecting the evidence after the last bound revision is removed.
This is referential provenance while records exist, **not** a tamper-proof retention
ledger: authorized deletion/reinsertion is not prevented. Production retention policy
and database-owner/trigger-disable bypass are outside this proposal.

## Isolation, compatibility and future application work

Cross-table predicate checks require SERIALIZABLE for bound revision/certificate
inserts, proposal non-status updates, acceptance updates/deletes and closure/collaboration
identity updates. The guard checks isolation **before** checking whether a binding
exists, including unbound rows: otherwise concurrent first-binding/mutation can escape
an empty-result check. No-op acceptance updates and lifecycle-only updates are allowed.
Expect SQLSTATE `25001` for wrong isolation, `23514` for invariant violations, `23503`
for missing/restricted FK references. Retry entire transactions on `40001`/`40P01`;
do not retry individual statements or change an operation key/fingerprint.

This explicit isolation requirement is a compatibility cost, not a verified runtime
guarantee. Existing closure/collaboration services already use Serializable transactions
(`lib/terraqo/closure.ts`, `lib/terraqo/collaboration.ts`). Ad-hoc proposal corrections,
acceptance deletion and current S16 fixture teardown use weaker/default transactions
and must be adapted during future rehearsal. In particular, existing S16 tests that
edit legacy acceptance dates outside transactions will need Serializable wrappers.
No existing test or runtime writer was changed in this task.

Future bound flow must retain collaboration -> revision lock order, live workspace/
professional authorization, optimistic version checks and replay reconciliation.
Compare client `expectedAcceptedProposalId` with the current server-accepted proposal
under that lock before inserting; reject stale intent. At submit/ACCEPT recheck current
scope and issue from the stored proposal ID, not the latest accepted proposal query.
Keep old committed replays read-only and preserve fingerprints. SQL checks party IDs,
not historical workspace membership/authority, latest-scope freshness, or permission
to accept/issue. Those remain service responsibilities. Reference-child snapshots and
their access policy are unchanged; this slice is not a complete evidence-freezing or
sharing implementation.

Fixture teardown must be explicitly scoped to fixture IDs and SERIALIZABLE: delete
certificates, clear `currentRevisionId`, delete reference children/revisions, delete
closures, then acceptances/proposals, collaboration and remaining parents in existing
FK order. No trigger disabling or unconditional global delete is needed. Do not rely
on unspecified cascade order for bound fixtures. The existing S16 parent-only cascade
cleanup is not certified compatible; a future test must exercise the explicit order.

The draft DDL is transactional, one-shot and ends in `ROLLBACK`; repeat execution
must not mask drift with IF NOT EXISTS or replace existing guards. Future promotion
needs an explicit reviewed migration and rehearsal. Operational rollback should retain
the nullable column, bindings and guards and disable the bound writer; reverting to
an old writer may produce more NULL rows. Do not drop audit data or claim rollback
compatibility before the old/new writer matrix passes.

## Local verification and remaining gates

Executed from this worktree, exit 0 (Prisma package installed in parent is **6.19.3**):

```powershell
$env:DATABASE_URL='postgresql://s17_dummy:s17_dummy@127.0.0.1:1/s17_not_used?schema=icc'
$env:DIRECT_URL=$env:DATABASE_URL
$env:CHECKPOINT_DISABLE='1'
$env:PRISMA_HIDE_UPDATE_MESSAGE='1'
$env:PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING='1'
$env:PRISMA_SCHEMA_ENGINE_BINARY='C:\Users\Binv\Documents\New project\icc-topografia\node_modules\@prisma\engines\schema-engine-windows.exe'
node 'C:\Users\Binv\Documents\New project\icc-topografia\node_modules\prisma\build\index.js' validate --schema 'C:\Users\Binv\Documents\New project\icc-topografia-s17-provenance\prisma\schema.prisma'
```

Result: `The schema at prisma\schema.prisma is valid`. This validates Prisma syntax,
types and relations only. `git diff --check` passed. Local static assertions checked
the five-line schema-only delta, SQL/schema FK/index parity, lifecycle allowlist against
current writes, insert-only NULL policy, bounded DELETE guard, isolation-before-predicate
checks, rollback terminator and exact three-file change allowlist. These are source
checks, not PostgreSQL execution evidence. No installed SQL parser was available;
PL/pgSQL syntax, trigger behavior and concurrency have **not** been validated by a DB.

Required future disposable-PostgreSQL rehearsal (separate authorization):

1. Apply inside a rollback-only transaction; verify legacy NULL values unchanged and
   old-writer insert/submit/decision/certificate behavior, including missing legacy evidence.
2. Reject cross-collaboration/missing-party/wrong-actor binding, NULL->ID, ID->NULL and
   ID->other-ID; allow inserting a new revision and exact no-op/replay behavior.
3. Reject pinned proposal/acceptance/closure content, parent and party rewrites; allow
   DRAFT->SUBMITTED->ACCEPTED/CHANGES_REQUESTED/DECLINED and superseding prior revisions,
   collaboration state/version/current-scope updates and proposal status-only updates.
4. Reject mispaired/miscopied certificates and bound certificate mutation; accept exact
   source copy and retain legacy NULL certificate behavior and existing uniqueness.
5. Race first binding against proposal edits, acceptance update/delete and reparenting
   in both orders using separate sessions. Verify predicate-lock/SSI aborts and full
   retry with the same key; assert no surviving invalid binding or duplicate certificate.
6. Delete bound proposal/acceptance before revision -> reject; run ordered fixture cleanup
   -> succeed and independently count zero fixture rows. Test multiple bound revisions
   sharing one proposal: deleting one must not unpin evidence used by the other.
7. Inject failure after bound revision/certificate insertion -> full rollback; test old/
   new writer compatibility and retained-data operational rollback. No schema/client-only
   validation can establish any of these outcomes.

No remote calls, database application, migrations, Prisma generation, deploys or commits
were performed. Main worktree/staging candidate was not modified or independently tested.
