import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const gateUrl = process.env.B5_GATE_DATABASE_URL?.trim();
const expectedDatabase = process.env.B5_GATE_EXPECTED_DATABASE?.trim();

assert.ok(gateUrl, "Define B5_GATE_DATABASE_URL con la base aislada que se va a leer.");
assert.ok(expectedDatabase, "Define B5_GATE_EXPECTED_DATABASE para confirmar el destino por nombre.");

const parsed = new URL(gateUrl);
assert.match(parsed.protocol, /^postgres(?:ql)?:$/, "El gate B5 solo admite PostgreSQL.");

const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
assert.equal(databaseName, expectedDatabase, "La base de B5_GATE_DATABASE_URL no coincide con B5_GATE_EXPECTED_DATABASE.");

const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
if (!localHosts.has(parsed.hostname)) {
  assert.equal(
    process.env.B5_GATE_ALLOW_REMOTE_READONLY,
    "true",
    "Un host remoto requiere B5_GATE_ALLOW_REMOTE_READONLY=true; migrate diff será solo lectura.",
  );
}

const root = process.cwd();
const prismaCli = join(root, "node_modules", "prisma", "build", "index.js");
const result = spawnSync(
  process.execPath,
  [
    prismaCli,
    "migrate",
    "diff",
    "--from-schema-datasource",
    "prisma/schema.prisma",
    "--to-schema-datamodel",
    "prisma/schema.prisma",
    "--script",
  ],
  {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: gateUrl },
    shell: false,
  },
);

assert.equal(result.status, 0, `Prisma migrate diff falló: ${result.stderr || "sin detalle"}`);

const statements = result.stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => /^(?:ALTER|CREATE|DROP|TRUNCATE|INSERT|UPDATE|DELETE|GRANT|REVOKE)\s/i.test(line));

assert.deepEqual(
  statements,
  [
    'DROP INDEX "Worklog_search_vector_gin_idx";',
    'ALTER TABLE "TerraqoWorklogEntry" ALTER COLUMN "searchVector" DROP DEFAULT;',
  ],
  "Se detectó drift fuera de los dos artefactos full-text intencionales. Detén el rollout y revisa el SQL.",
);

console.log(
  `B5 schema drift gate: OK (${parsed.hostname}/${databaseName}; solo los 2 artefactos full-text esperados).`,
);
