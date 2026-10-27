import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFile(join(root, path), "utf8");

async function main() {
  const expectedMigrationOrder = [
    "20261016113000_worklog_archive_cursor_index",
    "20261016143000_worklog_full_text_search",
    "20261016183000_worklog_revisions_work_cases",
    "20261017120000_scoped_sharing_endorsements",
    "20261017230000_discovery_needs",
    "20261018153000_evidence_analysis_jobs",
    "20261020143000_share_item_media_snapshot",
  ];
  const migrations = (await readdir(join(root, "prisma", "migrations"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  let previous = -1;
  for (const migration of expectedMigrationOrder) {
    const index = migrations.indexOf(migration);
    assert.notEqual(index, -1, `Falta la migración requerida ${migration}.`);
    assert.ok(index > previous, `${migration} no respeta el orden expand-only B1–B5.`);
    previous = index;
    const sql = await read(`prisma/migrations/${migration}/migration.sql`);
    assert.ok(sql.trim().length > 0, `${migration} no contiene SQL.`);
    assert.doesNotMatch(sql, /CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY/i, `${migration} no puede usar CONCURRENTLY dentro de migrate deploy.`);
  }

  const [analysisSql, discoverySql, mediaSnapshotSql, envExample, worker, netlifyConfig, packageJson, driftGate] = await Promise.all([
    read("prisma/migrations/20261018153000_evidence_analysis_jobs/migration.sql"),
    read("prisma/migrations/20261017230000_discovery_needs/migration.sql"),
    read("prisma/migrations/20261020143000_share_item_media_snapshot/migration.sql"),
    read(".env.example"),
    read("netlify/functions/evidence-analysis-background.mts"),
    read("netlify.toml"),
    read("package.json"),
    read("scripts/check-b5-schema-drift.ts"),
  ]);

  assert.doesNotMatch(analysisSql, /REFERENCES\s+"public"\."User"/i, "T18 no puede apuntar a public.User.");
  assert.match(analysisSql, /REFERENCES\s+"icc"\."User"\("id"\)/i, "La FK del creador T18 debe apuntar a icc.User.");
  assert.match(discoverySql, /CREATE TABLE icc\."TerraqoEvaluationDossier"/, "T18 depende del dossier creado por B4.");
  assert.match(analysisSql, /"TerraqoEvaluationSourceAccessKind"/, "T18 debe reutilizar el enum de acceso de B4.");
  assert.match(mediaSnapshotSql, /ADD COLUMN "mediaIds" TEXT\[\] NOT NULL DEFAULT ARRAY\[\]::TEXT\[\]/, "B3 debe congelar el conjunto exacto de medios sin bloquear filas existentes.");
  assert.doesNotMatch(mediaSnapshotSql, /DROP\s+(?:TABLE|COLUMN)|TRUNCATE/i, "El snapshot de medios debe ser expand-only.");

  for (const flag of [
    "TERRAQO_WORKLOG_FTS_V1",
    "TERRAQO_WORK_CASES_V1",
    "TERRAQO_SCOPED_SHARING_V1",
    "TERRAQO_SCOPED_ENDORSEMENTS_V1",
    "TERRAQO_DISCOVERY_NEEDS_V1",
    "TERRAQO_CONTEXTUAL_MESSAGING_V1",
    "TERRAQO_COLLABORATION_V1",
    "TERRAQO_CLOSURE_V1",
    "TERRAQO_EVIDENCE_ANALYSIS_V1",
  ]) {
    assert.match(envExample, new RegExp(`^${flag}=false$`, "m"), `${flag} debe permanecer apagado por defecto.`);
  }
  assert.match(envExample, /^TERRAQO_B5_PILOT_WORKSPACE_IDS=""/m, "La plantilla no debe admitir workspaces al piloto por defecto.");
  assert.match(envExample, /^TERRAQO_EVIDENCE_ANALYSIS_PROVIDER="off"/m, "La plantilla no debe invocar un proveedor por defecto.");
  assert.match(envExample, /^EVIDENCE_ANALYSIS_DISPATCH_SECRET=""/m, "La plantilla solo debe declarar, no incluir, el secreto del worker.");

  assert.match(worker, /timingSafeEqual/, "El worker debe comparar el secreto en tiempo constante.");
  assert.match(worker, /background:\s*true/, "El análisis debe ejecutarse como función background.");
  const workerCode = worker.replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(workerCode, /\bmemory\s*:/, "El plan Starter no admite memoria personalizada en la función.");
  assert.doesNotMatch(netlifyConfig, /\[functions\."?evidence-analysis-background"?\][\s\S]*?\bmemory\s*=/i, "Netlify no debe asignar memoria personalizada al worker B5.");
  assert.match(packageJson, /"check:b5-rollout"/, "El preflight debe permanecer invocable desde npm.");
  assert.match(packageJson, /"check:b5-schema-drift"/, "El gate de drift B5 debe permanecer invocable desde npm.");
  assert.match(driftGate, /timeout:\s*120_000/, "El gate de drift debe terminar de forma acotada ante un pooler incompatible.");
  assert.match(driftGate, /killSignal:\s*"SIGTERM"/, "El gate de drift debe cerrar el introspector al agotar su presupuesto.");

  console.log("B5 rollout preflight: OK (solo lectura; no se conectó a ninguna base ni proveedor)." );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
