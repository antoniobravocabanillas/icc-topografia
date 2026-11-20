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

## Authorized bounded loopback rehearsal — 2026-11-20 (incomplete)

The statements above describe the previous draft-only subtask. The parent explicitly
authorized a **fresh disposable loopback PostgreSQL cluster** for this follow-up at
HEAD `612a4225ad8c9cd25745a66428c25d9e41ca4efd`. The draft SQL header's earlier
no-rehearsal statement is historical scope, not a permanent restriction. No remote
database, runtime/application source, migration directory, shared client generation,
dependency installation, push or commit was authorized or performed here.

Added `scripts/test-s17-provenance-local.mjs`. Reproduce from this worktree:

```powershell
node --check scripts/test-s17-provenance-local.mjs
node scripts/test-s17-provenance-local.mjs --confirm=local-s17-only
```

Defaults use the existing sibling `../icc-topografia-s22-evaluator/node_modules`
and `C:/Program Files/PostgreSQL/18/bin`. Explicit local tool overrides are available:

```powershell
node scripts/test-s17-provenance-local.mjs --confirm=local-s17-only --dependencies="C:/Users/Binv/Documents/New project/icc-topografia-s22-evaluator" --pg-bin="C:/Program Files/PostgreSQL/18/bin"
```

The installed `pg` package metadata and connection-parameter implementation were
inspected first: `pg 8.20.0`. Prisma CLI is `6.19.3`, Node is `v24.15.0`, and the
actual server reported `PostgreSQL 18.4 on x86_64-windows, compiled by
msvc-19.44.35226, 64-bit`. No Prisma client is imported by the harness.

The baseline is fetched with `git show
f0b34c58c54bd92a9af09d66dc9e199cf43354af:prisma/schema.prisma`, not the modified
worktree schema. It lacks `acceptedProposalId`. The existing CLI runs
`migrate diff --from-empty --to-schema-datamodel <temporary-baseline.prisma>
--script` with a sanitized environment and temporary working directory. It only
produces baseline SQL; it does not use a datasource, migration directory or client
generator. `pg` then installs that baseline into the newly initialized cluster.

Each attempt uses `mkdtemp`, a dynamically selected IPv4 loopback port, UTF8,
SCRAM and an ephemeral random password. No inherited app URL is accepted. Before
schema application, a real connection verifies database/role, server address/port,
`listen_addresses`, data directory and both client/server encodings. The proposed
DDL is executed within its BEGIN/ROLLBACK boundary, with fixtures/tests interposed;
no proposed DDL or fixture transaction is committed. Fixture mutations use synthetic
IDs, parameterized values and reserved `.invalid` email addresses. Expected denials
use savepoints to keep the containing transaction usable.

Input and final harness SHA256:

| Artifact | SHA256 |
| --- | --- |
| Baseline schema UTF8 text | `c58ad990421aaaf86e6b07c1a268ed991ff8d88d9a551678da9fe1a0234a1d05` |
| Unmodified proposed SQL | `3a0352368d496ad59a1e9a3064da4c3d3badd6543aaf4a3c694e3b12ef273326` |
| Final harness | `70d53cac6103bbc9606aba689af7d0497751852d90ed9560a4a81e56a10ade6a` |

### Actual attempts and correction budget

Four executions, with **three harness correction cycles**, were made. The cap is
exhausted; no fourth correction was made. No functional SQL correction was needed
by the cases that reached execution.

1. Initial attempt failed server startup. Fix 1 removed the empty Unix-socket option
   from the Windows `pg_ctl -o` argument, matching the working S16 startup pattern.
2. Server started, but address verification expected `127.0.0.1` while PostgreSQL's
   `inet::text` returned `127.0.0.1/32`. Fix 2 used `host(inet_server_addr())`.
3. Baseline installed and all 157 tables were empty. Synthetic `User` insertion
   failed `23502`: raw SQL must supply Prisma's client-managed `updatedAt`. Fix 3
   supplied that value, improved safe diagnostics, and accepted either restrictive
   guard for a pinned proposal deletion. The observed proposal deletion denial was
   `23514` from the acceptance guard during cascading deletion.
4. The final attempt reached the certified-revision DELETE test. PostgreSQL rejected
   deletion with **`23001` (`restrict_violation`)**, while this test expected `23503`.
   The harness stopped with exit **1**. This is an overly narrow test expectation;
   deletion was not permitted. The earlier note's SQLSTATE list is therefore not
   exhaustive: include `23001` for observed RESTRICT behavior on this server.

Final failure evidence:

```text
PASS baseline lacks provenance; 157 tables empty; loopback/data-directory/UTF8 verified
PASS all 7 functions / 6 triggers installed; pre-DDL legacy NULL preserved
...
PASS duplicate certificate rejected [23505]
PASS own cluster stopped; postmaster absent; guarded resolved directory removed
FAIL S17 local rehearsal
phase: revision with certificate cannot be deleted
revision with certificate cannot be deleted: expected 23503, received 23001
```

All four attempts confirmed their own temporary directory was removed; running
servers were stopped first. The final behavior transaction executed `ROLLBACK` in
`finally`. Recursive cleanup checks realpath, exact temporary parent, unique prefix,
non-symlink directory and absent `postmaster.pid` before removal. Passwords were
never logged. `node --check` and `git diff --check` passed.

### Proven by actual PostgreSQL execution

- Baseline contains 157 empty tables and no provenance column before rehearsal.
  Seven functions and six triggers install successfully; all six trigger functions
  execute in reached cases. Adding the column preserves a pre-DDL legacy row with NULL.
- Repeating the one-shot DDL in the same transaction fails `42701` without masking drift.
- Same-collaboration accepted proposal with both correct parties binds successfully,
  including two revisions sharing one proposal. Cross-collaboration, absent proposal,
  missing party, incorrect workspace/professional/decision actor and nonaccepted proposal
  bindings fail `23514`.
- NULL-to-ID, ID-to-NULL and ID-to-other-ID fail. Pinned revision payload, ID, parent,
  revision number, creation identity/time and save receipt mutations fail. No-op and
  status/submit/decision field updates succeed. This tests the SQL allowlist, **not**
  a domain state machine or caller authorization.
- Pinned proposal content, identity, acceptance decision evidence and receipts cannot
  change; status-only transitions succeed. Acceptance mutation/deletion and moves into
  or out of the pinned proposal fail; duplicate party fails `23505`.
- Closure identity/reparenting and collaboration workspace/professional/conversation
  changes fail. Current revision, version, current accepted scope and lifecycle changes
  remain allowed as designed.
- Certificate insertion rejects nonaccepted revisions, missing revisions, mismatched
  parent/proposal/revision/content fields, wrong issuer and nonprivate default. Exact
  UTF8 source copy succeeds privately. Certificate mutation/reassignment fails; exact
  no-op succeeds; duplicate certificate fails `23505`. Deleting its revision is also
  rejected, with `23001` rather than the test's expected `23503`.

### Not yet verified / next bounded continuation

The harness is deliberately reported **failing**, not as a completed gate. The next
authorized correction should update the restrictive-delete expectations for the
actual PostgreSQL SQLSTATE, then rerun from a fresh cluster. Review both revision and
closure DELETE assertions; do not loosen provenance guard assertions indiscriminately.

Because the final execution stopped at the revision DELETE assertion, these existing
harness sections were **not reached**: closure DELETE rejection, full legacy NULL
certificate compatibility, real-reference ordered cleanup, protection after deleting
only one of two bindings, independent post-rollback row/catalog readback, READ COMMITTED
guard rejection, and failure injection after certificate insertion. They are code,
not evidence. The wrong-isolation requirement remains an explicit blocker.

The independent reader is intentionally scheduled after rollback. It can check zero
rows and restoration of the baseline catalog, but cannot prove a committed ordered
cleanup under installed guards: both guards and fixtures are rolled back. No separate
session can exercise this uncommitted DDL's SSI behavior. Cross-session race orders,
`40001`/`40P01` full retries with stable operation keys, application authorization,
service-level replay/idempotency, and retained-data operational rollback remain pending.

This rehearsal cannot authorize deploying a new Prisma client before the remote column
exists. Implicit scalar reads can select `acceptedProposalId` even with the writer flag
off; preserve the ordering in the parent's `s17-writer-integration-gate.md`.

Exact files changed by this follow-up:

- Added `scripts/test-s17-provenance-local.mjs`.
- Appended this section to `docs/work-documented/proposals/s17-accepted-proposal-provenance-notes.md`.

`s17-accepted-proposal-provenance.proposed.sql` and `prisma/schema.prisma` are unchanged.
The parent's new `docs/work-documented/proposals/s17-writer-integration-gate.md` was
read but not modified. No main runtime/source files were changed. No commit was made.

## Resumed checkpoint — 2026-11-20

Corrected only certified revision/closure DELETE expectations to the observed RESTRICT SQLSTATE 23001, retaining the foreign-key diagnostic check. The rollback-only harness now exits 0: **105 real PostgreSQL checks**, `output/s17-provenance-restart-1.log`. Previously unreached wrong-isolation, ordered teardown, independent catalog/row readback and injected transaction failure now pass. No proposed DDL/fixtures committed by this harness; its own server and directory were removed. Cross-session evidence is separate in `s17-provenance-races-local-notes.md` (34 checks).

Runtime work remains isolated in this branch: optional expectedAcceptedProposalId preserves the existing omitted/legacy private path and old operation fingerprints; supplied identities bind only after current-scope and both-party checks under the parent lock. Bound submit/ACCEPT compare exact identity; historical DTOs expose their own acceptedScope, not today's scope. Legacy NULL stays NULL and is not eligible for future provenance-backed sharing.

Real service tests on the generated schema passed stale-save/stale-submit rejection, replay of A after B acceptance, explicit B revision retaining A history and private certificate copied from B. Full S16 visibility/scope/reference regression passed (`output/s17-combined-service.log`). Separately, `node scripts/test-s17-bound-service-local.mjs --confirm=local-s17-bound-service-only` passed 28 runtime checks and four bootstrap checks with all six SQL guards installed in its own disposable loopback database. Concurrent ACCEPT produced one certificate after serialization retry; ordered SERIALIZABLE cleanup and independent readback confirmed zero fixture rows across 157 tables. This closes the service/trigger integration gap, not the authenticated hosted gate.

Chromium against actual editor code with synthetic HTTP responses passed preservation of text and A on 409/refresh, explicit review before choosing B, stable key/payload on ambiguous retry, and 1440/390/320 no overflow (`scripts/test-s17-provenance-editor.mjs`). Mobile screenshot inspected; this is component behavior/layout evidence with simplified base styles, not an authenticated hosted UX gate. TypeScript, focused ESLint, route authorization adapters and closure contracts passed.

Dependencies/client generation are confined to this worktree's own node_modules. No shared client generation, production/staging DDL or hosted deployment performed.

Authenticated local integration subsequently passed first attempt: `node --import tsx scripts/lib/s15-local-rehearsal.ts --confirm=local-s15-only --s16-controls --s17-provenance`. Run `91dbab1c-0dfc-4016-a529-41450280159e`; log `output/playwright/s17-provenance/authenticated-gate-cycle1.log`. All six guards active, real user sessions, UI proposal binding, two closure revisions, historical DTO, protected references, correction/resubmit, private certificate, cancellation/replay and tenant isolation passed. Ordered cleanup independently verified and PostgreSQL stopped. 36 captures at 1440/375/320; parent inspected the professional reference mobile screenshot. This does not upgrade `uxPass:false` to comprehensive visual approval. The receipt commit is the pre-change base HEAD; the reviewed source candidate must be fixed by the subsequent commit. Sharing and hosted validation remain pending.
