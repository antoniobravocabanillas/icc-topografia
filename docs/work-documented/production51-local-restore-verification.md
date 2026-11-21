# Production51 local application-schema restore verification

**Passed for the selected `icc` schema only. Not a complete database restore, hosted acceptance, authorization plan, or production-ready result.** No migration or release SQL was applied, and no operator guard was removed. No remote database, provider API, credential discovery, dotenv loader, or deployment was used.

Run from this checkout on Windows:

```powershell
node --test scripts/test-restore-platform-production51-local.mjs
node scripts/restore-platform-production51-local.mjs C:/Users/Binv/.terraqo-private/platform51-oxB6Kq --confirm=local-application-restore-only
node node_modules/eslint/bin/eslint.js scripts/restore-platform-production51-local.mjs scripts/test-restore-platform-production51-local.mjs --max-warnings=0
```

The input directory, archive SHA256 `071a86f4fb37a846fb74467bfc933399fbdafff369882e13192ebb59b47646ef`, catalog SHA256 `a2b423c65960d4b153d575d47f153ffa992f51af1bb362849c8a8fcc99b29f4d`, site/source identity, snapshot/ownership flags, six-hour freshness, and 44/45 ledger baseline are pinned. There is no endpoint, alternate digest, restore-target, or migration option. The backup and its parent-owned producer remain untouched. Expired inputs fail closed; this script does not refresh them.

Successful execution finished at **2026-11-21 02:06:09 UTC** using **PostgreSQL 18.4**, exclusively from `C:/Program Files/PostgreSQL/18/bin`. Its private receipt is:

`C:/Users/Binv/.terraqo-private/restore-platform51-Lgi53j/receipt.json`

The receipt records 1,380 selected archive entries, equality of every captured field in all **45 historical ledger records / 44 active migrations**, and matching application catalog projections:

| Catalog projection | Matched count |
| --- | ---: |
| Schema ownership / ACL | 1 |
| Relations, ownership / ACL / RLS flags | 796 |
| Types, ownership / ACL | 496 |
| Triggers, enabled state and definitions | 1,328 |
| Application functions | 0 |
| Column ACL, default ACL, policies | 0 each |

The 796 relations comprise 153 tables, 642 indexes and one sequence. The receipt contains row counts and SHA256 snapshots for **all 153 tables**, including the complete migration ledger, plus sequence metadata/state. Only hashes and metadata are retained; no customer rows, ledger logs, function bodies, passwords, or subprocess diagnostics appear in stdout or the receipt. Source catalog OIDs resolve to role/schema/relation names; generated foreign-key trigger OID suffixes normalize without discarding their event, function, enabled state or definition. Empty function/security catalogs are checked as empty, not presented as evidence of executed application guards.

Restoration uses an explicit `pg_restore --use-list` selection and `--single-transaction --exit-on-error`, retaining owners and ACLs. A full archive TOC is necessary: `pg_restore --schema=icc --list` omits the `SCHEMA` entry itself. The selected list includes `CREATE SCHEMA` and only application entries; provider extensions and `public`/`ppg` objects are excluded. This successful schema restore did not encounter an unsupported provider dependency. There is no fake extension, substituted provider function or retry with discarded owners/ACLs.

The temporary directory has a protected Windows ACL permitting only the current user and SYSTEM. Real archive copies, database files, passwords and PostgreSQL logs are created only underneath it. Child environments contain explicit OS plumbing and local settings, with no inherited executable search path, provider secrets, connection URLs, proxy, Node injection, PG service or passfile discovery. The server binds only `127.0.0.1` on an ephemeral port, authenticates with a fresh SCRAM secret, and checks its actual database/user/address/port/data directory/version and tracked PID.

Required source roles are reconstructed from the pinned catalog. `prisma_application` and `prisma_migration` are local `NOLOGIN` roles without passwords or elevated attributes; the application role's captured timeout setting and its two `pg_read_all_data` / `pg_write_all_data` memberships, including grantor and ADMIN/INHERIT/SET options, match. PostgreSQL records superuser membership grants against its bootstrap role. Single-user initialization, before any listener, therefore disables `postgres` LOGIN and erases its temporary initialization password, creating a separate random local administrator. PG18 requires bootstrap `postgres` to retain SUPERUSER; it remains `NOLOGIN` with no password. This explicit local exception is not a hosted privilege assertion.

The parent's verified provider documentation states that Prisma Postgres credentials have full access without role/table/schema scoping, and custom roles are unsupported. **Catalog presence of `prisma_application` does not establish a selectable hosted login or a scoped runtime credential.** These local roles support catalog restoration only. The parent's production-readiness/provider blocker and S18 hosted acceptance remain independent of this result. Provider reference supplied and verified by the parent: [Connecting to Prisma Postgres](https://www.prisma.io/docs/postgres/database/connecting-to-your-database).

Before stopping/removing anything, cleanup verifies the owned directory ancestry, every descendant for junction/symlink redirection, tracked child process, `postmaster.pid`, executable path and command line. It stops only that cluster, waits for process exit, confirms PID-file disappearance, then validates paths again before recursively removing the owned `work` directory. Any ownership or shutdown uncertainty retains data and marks failure. The successful run has both `ownedClusterStopped=true` and `ownedDataRemoved=true`. Independent final inspection found **zero PostgreSQL processes for these restore directories** and only `receipt.json` in each owned run directory. Earlier failed attempts retain small sanitized failure receipts and the same stop/removal evidence; no copied data or logs remain.

Focused validation: **8/8 tests passed**, focused ESLint passed, and `git diff --check` passed. Tests cover invalid paths/flags and no startup side effects, archive/catalog tampering before startup, stale/wrong manifest identity, child-environment isolation, schema-only TOC selection, OID normalization without hiding security drift, complete historical-ledger field changes, junction/cleanup rejection and sanitized error categories. The final successful restore also exercised actual initialization, membership reconstruction, archive execution, comparisons, snapshots and cleanup. Following the parent's bounded-correction instruction, no additional database rehearsal was started after success.

Remaining limitations are material:

- The source is **PG17.2** with proprietary **`prisma_postgres` 0.4.0**. The local cluster has only `plpgsql`; provider behavior, full database restore, `ppg`/`public`, database ownership/ACL/settings and extension objects are unverified.
- The source database uses `en_US.utf8`; the disposable Windows cluster is initialized with `--locale=C`. Successful restore and catalog equality do not prove source collation/order/index behavior or same-version recovery.
- The source backup captured ledger timestamps through the `pg` driver's JavaScript `Date` serialization. All captured fields match, including historical IDs/checksums/logs/steps/timestamps, but timestamp comparison is limited to that source snapshot's millisecond precision.
- The catalog contains the listed security metadata and trigger definitions, not exhaustive column/constraint definitions or function bodies. Ownership/ACL/RLS equality does not establish effective hosted authorization or application compatibility.
- Table hashes describe the restored local baseline, not an independently measured source-row comparison. Future local rehearsal must use the documented serializer: SHA256 over `psql COPY` text output of `to_jsonb(row)::text`, sorted under `COLLATE "C"`, UTC, COPY escaping and LF delimiters, including duplicates. Use the same PG/tool/platform serialization and verify the pinned archive/catalog/manifest first.
- No migration replay, rollback/failure-injection test of pending migrations, runtime authorization test, live-provider check, deployment or readiness approval is included. Existing production guards remain authoritative.
