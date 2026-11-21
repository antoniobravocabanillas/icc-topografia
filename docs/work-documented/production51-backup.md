# Production51 snapshot backup

Read-only capture completed using `scripts/backup-platform-production51.mjs --confirm=read-only-production-backup` against exact serving commit `285b20ad45f79e80e0410967f399f561f0a64781`. Production was not migrated or redeployed.

Private artifact: `C:/Users/Binv/.terraqo-private/platform51-oxB6Kq/database.dump`; SHA256 `071a86f4fb37a846fb74467bfc933399fbdafff369882e13192ebb59b47646ef`, 1,081,555 bytes. The directory has explicit current-user and SYSTEM access. The receipt pointer under `output/release-readback/production51-backup.json` is gitignored. Catalog and full historical ledger are private alongside the archive; no row data or credentials belong in repository documentation.

The exporter uses a TLS-verified, read-only repeatable-read transaction and `pg_export_snapshot()`. Full-database custom `pg_dump` imports that snapshot; ownership and ACL commands are retained. Cluster role attributes/memberships are recorded without password hashes. Both the ledger and security catalog were checked again after capture, and the deployed source remained identical. The archive command exited successfully with empty stderr. Source database: PostgreSQL17.2, 44 active migrations, 45 historical ledger rows, no unfinished migration.

Boundary: a consistent archive is not a restored/rehearsed release. The source includes provider extension `prisma_postgres`0.4.0, unavailable in the installed local PostgreSQL18. A local `icc`-only restore must identify omitted provider dependencies and version differences; it cannot claim full provider disaster recovery. External blob contents are not in a PostgreSQL dump. Runtime credentials currently identify `prisma_migration`; the catalog also contains `prisma_application`. Do not invent runtime credential switching or apply Supabase role changes to this provider. A supported runtime/owner separation and exact migration/rollback rehearsal remain required.

Snapshot synchronization follows the PostgreSQL17 [pg_dump reference](https://www.postgresql.org/docs/17/app-pgdump.html) and [snapshot export documentation](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-SNAPSHOT-SYNCHRONIZATION).
