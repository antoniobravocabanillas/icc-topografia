import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const sourceCommit = "e6ff153694dc01ab8a2b5848556fa6839626b2af";
const confirmation = "generate-pre-b1-baseline";
const forbiddenB1Tables = [
  "TerraqoWorkCase",
  "TerraqoShareCollection",
  "TerraqoAccessGrant",
  "TerraqoWorkNeed",
  "TerraqoEvaluationDossier",
  "TerraqoAnalysisJob",
] as const;

async function main() {
  assert.equal(
    process.env.PLATFORM_STAGING_BASELINE_CONFIRM,
    confirmation,
    `Define PLATFORM_STAGING_BASELINE_CONFIRM=${confirmation}.`,
  );

  const root = process.cwd();
  const temporary = await mkdtemp(path.join(os.tmpdir(), "terraqo-platform-baseline-"));
  const output = path.join(root, "output", "platform-staging-baseline");
  const schemaPath = path.join(temporary, "schema.prisma");
  const sqlPath = path.join(output, "pre-b1-baseline.sql");
  const manifestPath = path.join(output, "manifest.json");

  try {
    const schema = execFileSync(
      "git",
      ["show", `${sourceCommit}:prisma/schema.prisma`],
      { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    );
    await writeFile(schemaPath, schema, { encoding: "utf8", flag: "wx" });

    const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
    const sql = execFileSync(
      process.execPath,
      [prismaCli, "migrate", "diff", "--from-empty", "--to-schema-datamodel", schemaPath, "--script"],
      { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );

    assert.match(sql, /CREATE SCHEMA IF NOT EXISTS "icc";/, "El baseline no crea el esquema icc.");
    assert.doesNotMatch(
      sql,
      /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|COPY|GRANT|REVOKE)\b/im,
      "El baseline contiene DML o permisos.",
    );
    assert.doesNotMatch(sql, /_prisma_migrations/, "El baseline no debe fabricar el ledger Prisma.");
    for (const table of forbiddenB1Tables) {
      assert.ok(!sql.includes(`"${table}"`), `El baseline pre-B1 contiene ${table}.`);
    }

    const names = (await readdir(path.join(root, "prisma", "migrations"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const historicalMigrations = names.filter((name) => name < "20261016113000_worklog_archive_cursor_index");
    const rolloutMigrations = names.filter((name) => name >= "20261016113000_worklog_archive_cursor_index");
    assert.equal(historicalMigrations.length, 36, "El corte pre-B1 debe contener 36 migraciones historicas.");
    assert.equal(rolloutMigrations.length, 7, "El rollout B1-B5 debe contener siete migraciones.");

    await mkdir(output, { recursive: true });
    await writeFile(sqlPath, sql, "utf8");
    const persisted = await readFile(sqlPath);
    const manifest = {
      format: "terraqo-platform-staging-baseline/v1",
      sourceCommit,
      containsApplicationRows: false,
      schema: "icc",
      historicalMigrations,
      rolloutMigrations,
      sqlBytes: persisted.byteLength,
      sqlSha256: createHash("sha256").update(persisted).digest("hex"),
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({
      sourceCommit,
      historicalMigrations: historicalMigrations.length,
      rolloutMigrations: rolloutMigrations.length,
      sqlBytes: manifest.sqlBytes,
      sqlSha256: manifest.sqlSha256,
      containsApplicationRows: false,
    }));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Platform baseline generation failed.");
  process.exitCode = 1;
});
