# S17 bounded cross-session SQL concurrency rehearsal

Executed 2026-11-20 in `icc-topografia-s17-provenance`. **This SQL concurrency
slice passed; S17 service integration is not certified by this result.**

## Scope and authorization

The parent authorized committing draft DDL only inside a newly initialized,
owned disposable loopback PostgreSQL cluster so independent sessions could see
the guards. This supersedes the draft SQL's historical rollback-only rehearsal
scope for this harness only. The proposed SQL file itself is unchanged.

Owned additions:

- `scripts/test-s17-provenance-races-local.mjs`
- This note.

Evidence is in ignored local output `output/s17-provenance-races-1.log` (exit 0).
No remote/staging database, migration directory, dependency installation, shared
generation, application implementation, deployment or Git commit was performed.
Concurrent changes made by the parent in runtime/UI/validation/S16 test files
were left untouched.

The parent's `scripts/test-s17-provenance-local.mjs` remains byte-for-byte as read,
including both corrected `23001` expectations. Its existing
`output/s17-provenance-restart-1.log` reports 105 checks; that suite was read, not
rerun or rewritten. Earlier notes describing its RESTRICT expectation failure
are historical and do not describe the parent's corrected run.

## Reproduction and isolation

```powershell
node --check scripts/test-s17-provenance-races-local.mjs
node scripts/test-s17-provenance-races-local.mjs --confirm=local-s17-races-only
```

Optional overrides are `--dependencies=<existing local checkout>` and
`--pg-bin=<existing PostgreSQL bin directory>`. Defaults are sibling
`../icc-topografia-s22-evaluator` and `C:/Program Files/PostgreSQL/18/bin`.
Actual versions: Node `v24.15.0`, `pg 8.20.0`, Prisma CLI `6.19.3`, PostgreSQL
`18.4 on x86_64-windows, compiled by msvc-19.44.35226, 64-bit`.

The standalone bootstrap pattern is reused from the parent's harness. That
script auto-runs and exports no bootstrap library; the existing S15 rehearsal
also auto-runs and initializes an application. Neither is imported or changed.
Only bootstrap/safety plumbing is reused, not the 105-case behavioral suite.

The baseline schema comes from fixed Git object
`f0b34c58c54bd92a9af09d66dc9e199cf43354af:prisma/schema.prisma`, rather than the
current worktree schema. The existing Prisma CLI produces SQL with offline
`migrate diff --from-empty --to-schema-datamodel <temporary file> --script` in
the temporary directory. It neither applies migrations nor generates a client.

Each run creates a fresh `terraqo-s17-races-*` directory under the resolved OS
temporary directory, initializes UTF8/SCRAM with a random password, and binds
only `127.0.0.1` on a dynamically selected port. No external database URL or
repository environment is loaded. Inherited PG variables are removed, child
environments are allowlisted, and every connection verifies database, role,
server address/port, exact owned data directory, listeners and encodings before
entering the session set. Baseline and draft DDL are installed only there; the
draft body is explicitly committed in a transaction. An independent connection
verifies six committed triggers and zero rows before fixture work.

## Deterministic schedule and assertions

For each case, fixtures are committed before opening two distinct backend
sessions. Both execute `BEGIN ISOLATION LEVEL SERIALIZABLE`, assert the effective
isolation, and acquire equal snapshots before either racing write. No extra
domain reads are added to the participants to manufacture a dependency cycle.
The real trigger/FK queries produce the predicate dependencies.

The first statement completes while its transaction stays open. The observer
requires actual `SIReadLock` entries for that backend. The second statement then
runs concurrently. The observer polls actual `pg_stat_activity`,
`pg_blocking_pids` and ungranted `pg_locks` until either that statement settles or
a lock held by the first session is attributable. Only then does the harness
attempt the first commit, await the second statement, and attempt the second
commit. There are no guessed sleeps. The observation deadline is 4 seconds,
before the 8-second lock timeout and 15-second statement timeout. Timeouts,
deadlocks and ordinary constraint errors are not accepted as SSI success.

Both **statement/commit schedules** are exercised: binding first and mutation
first. Exactly one transaction must commit, and the other must return `40001`.
A fresh independent connection verifies the expected entire fixture state,
exact binding ID/key/fingerprint and original versus edited source fields, plus
a cross-table query rejects any invalid surviving binding. This includes
payload changes that might otherwise leave the structural joins valid.

| Mutation raced against first binding | Binding first | Mutation first | Observed barrier |
| --- | --- | --- | --- |
| Proposal scope edit | COMMIT / 40001 | COMMIT / 40001 | Second statement settled while first transaction open |
| Professional acceptance actor edit | COMMIT / 40001 | COMMIT / 40001 | Second statement settled while first transaction open |
| Professional acceptance deletion | COMMIT / 40001 | COMMIT / 40001 | Second statement settled while first transaction open |
| Closure collaboration reparent | COMMIT / 40001 | COMMIT / 40001 | Attributable `transactionid` lock in both schedules |
| Collaboration professional party reparent | COMMIT / 40001 | COMMIT / 40001 | Second statement settled while first transaction open |

Each cell lists the first and second transaction results. The alternate closure
parent has no existing closure, preventing an unrelated unique constraint from
masking the intended race. Workspace/conversation reparent variants are not
additional concurrent cases in this bounded slice.

Each losing transaction is retried from a fresh `BEGIN SERIALIZABLE`, using the
same synthetic IDs, operation key and fingerprint. Nine retries reject `23514`.
When the proposal payload edit wins, a fresh binding retry legitimately commits
against the edited proposal: SQL does not check what scope the editor originally
displayed. Both before and after retry, independent reads assert the correct
state and at most one exact binding. **This SQL retry is not service idempotency,
authorization, replay reconciliation or stale-editor protection.** No certificates
are created here, so no concurrent certificate-uniqueness claim is made.

## Reference FK and committed cleanup

A separate real `TerraqoClosureReference` insertion races with deletion of its
`TerraqoWorklogRevision` source. The observer requires an actual lock wait on the
inserting transaction before releasing it. In the executed run, the pending
source deletion returned `23001`; a fresh SERIALIZABLE deletion also returned
`23001`. Independent reads confirmed the source and reference both survived.
The harness permits `40001` or `23001` for the overlapping deletion, but strictly
requires `23001` for the fresh attempt. This is a reference FK test, not one of
the ten SSI cases, and its errors cannot mask a failed provenance race.

All eleven fixture sets receive committed, ID-scoped SERIALIZABLE cleanup:
certificates if present, clear current revision pointers, reference children,
closure revisions, closures, acceptances, proposals, collaborations, conversations,
worklog revisions/entries/profiles, workspaces, users. No triggers are disabled.
Each cleanup first checks zero rows in the transaction and then commits; a new
connection independently checks all **157 tables are empty**, while all six
guards remain installed. The reference case proves child-before-source teardown.

Finally all harness sessions close, the owned server is stopped with `pg_ctl`,
and absence of `postmaster.pid` is required. Before recursive removal the harness
checks non-symlink, realpath equality, exact temporary parent and unique owned
prefix. It then verifies the directory no longer exists. This also ran on the
successful attempt; committed draft DDL and fixtures do not remain on disk.

## Exact evidence and correction budget

One execution; **zero post-execution correction cycles** (maximum three allowed).
No SQL changes were necessary. `node --check` and `git diff --check` passed.

Representative exact output:

```text
RACE closure-reparent/binding-first snapshot=785:785: SIReadLock=13 barrier=lock first=COMMIT second=40001
RACE closure-reparent/mutation-first snapshot=790:790: SIReadLock=4 barrier=lock first=COMMIT second=40001
FK reference-insert/source-delete=23001
PASS reference FK: observed lock; source survives concurrent delete; fresh delete rejected 23001
PASS reference child before source: independent zero readback across 157 tables; committed guards remain installed
PASS own cluster stopped; postmaster absent; guarded resolved directory removed
RESULT 34 checks passed; 10 SSI orders; draft DDL/fixtures committed ONLY in removed owned loopback cluster
```

SHA256 of the executed artifacts:

| Artifact | SHA256 |
| --- | --- |
| Baseline schema UTF8 text | `c58ad990421aaaf86e6b07c1a268ed991ff8d88d9a551678da9fe1a0234a1d05` |
| Unchanged proposed SQL | `3a0352368d496ad59a1e9a3064da4c3d3badd6543aaf4a3c694e3b12ef273326` |
| New race harness | `ae82598c7fd4586f6adbd33820cedb5d065912def09c4ed5f0c1225f3e5cc05e` |
| Race log | `48f0dd3ada178b287e4a37d1b828c6b02ab7ac12adedb5c4b8c5fb3edbfd2b73` |
| Preserved parent harness, before and after | `3dd586e70279562828f3c3a8d7ae85412f122e45bb0d02dbd973cb39663482ac` |

## Remaining gates

This bounded SQL concurrency gate has no remaining execution blocker. It does
not establish service actor/tenant authorization, stale accepted-scope/editor
preconditions, identical/conflicting replay, ambiguous-response handling,
application retry behavior or business-operation idempotency. Those require the
writer/DTO/editor integration and service tests specified in
`s17-writer-integration-gate.md`.

Old/new generated-client compatibility, legacy writer rollout, retained-data
operational rollback, full certificate/service race coverage and any reviewed
migration/promotion remain separate gates. No authorization to perform those
remote or deployment actions is implied by this local result.
