import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma";

type MigrationRow = {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  applied_steps_count: number;
};

const confirmation = "read-only-source-ledger";

async function localMigrations() {
  const root = path.resolve("prisma", "migrations");
  const names = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return new Map(await Promise.all(names.map(async (name) => {
    const sql = await readFile(path.join(root, name, "migration.sql"));
    return [name, createHash("sha256").update(sql).digest("hex")] as const;
  })));
}

async function main() {
  assert.equal(
    process.env.TERRAQO_SOURCE_LEDGER_CONFIRM,
    confirmation,
    `Define TERRAQO_SOURCE_LEDGER_CONFIRM=${confirmation} para autorizar esta lectura.`,
  );

  const local = await localMigrations();
  const remote = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15s'");
    const ledgers = await tx.$queryRaw<Array<{ schema_name: string }>>`
      SELECT n.nspname AS schema_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = '_prisma_migrations' AND c.relkind = 'r'
      ORDER BY n.nspname
    `;
    assert.equal(ledgers.length, 1, `Se esperaba un ledger Prisma y se encontraron ${ledgers.length}.`);
    const schema = ledgers[0].schema_name;
    assert.match(schema, /^[A-Za-z_][A-Za-z0-9_]*$/, "El esquema del ledger Prisma no es seguro.");
    const quotedSchema = `"${schema.replaceAll('"', '""')}"`;
    return tx.$queryRawUnsafe<MigrationRow[]>(`
      SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
      FROM ${quotedSchema}."_prisma_migrations"
      ORDER BY migration_name
    `);
  }, { timeout: 20_000 });

  const remoteByName = new Map(remote.map((row) => [row.migration_name, row]));
  const incomplete = remote.filter((row) => !row.finished_at || row.rolled_back_at);
  const resolvedWithoutSteps = remote
    .filter((row) => row.finished_at && !row.rolled_back_at && row.applied_steps_count === 0)
    .map((row) => row.migration_name);
  const checksumMismatches = remote
    .filter((row) => local.has(row.migration_name) && local.get(row.migration_name) !== row.checksum)
    .map((row) => ({
      migration: row.migration_name,
      sourceChecksumPrefix: row.checksum.slice(0, 12),
      candidateChecksumPrefix: local.get(row.migration_name)?.slice(0, 12),
    }));
  const remoteOnly = remote.filter((row) => !local.has(row.migration_name)).map((row) => row.migration_name);
  const pending = [...local.keys()].filter((name) => !remoteByName.has(name));

  console.log(JSON.stringify({
    sourceLedgerRows: remote.length,
    localMigrationFiles: local.size,
    completeApplied: remote.length - incomplete.length,
    incomplete: incomplete.map((row) => ({
      migration: row.migration_name,
      finished: Boolean(row.finished_at),
      rolledBack: Boolean(row.rolled_back_at),
      appliedStepsCount: row.applied_steps_count,
    })),
    resolvedWithoutSteps,
    checksumMismatches,
    remoteOnly,
    pending,
  }, null, 2));

  assert.equal(incomplete.length, 0, "El ledger fuente contiene migraciones incompletas o revertidas.");
  assert.equal(checksumMismatches.length, 0, "El ledger fuente no coincide con los checksums versionados.");
  assert.equal(remoteOnly.length, 0, "El ledger fuente contiene migraciones que no existen en el candidato.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Source migration ledger inspection failed.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
