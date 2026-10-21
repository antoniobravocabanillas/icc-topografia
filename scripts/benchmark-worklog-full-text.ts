import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const REQUIRED_RUNS = 30;
const DEFAULT_P95_BUDGET_MS = 500;
const VOLUMES = [10, 1_000, 100_000] as const;
const QUERIES = [
  { label: "one-word", value: "levantamiento" },
  { label: "two-words", value: "control calidad" },
  {
    label: "four-words",
    value: "levantamiento topografico control calidad",
  },
] as const;
const SHAPES = ["page", "count"] as const;

type ExplainPlan = {
  "Node Type"?: string;
  "Index Name"?: string;
  "Actual Rows"?: number;
  "Shared Hit Blocks"?: number;
  "Shared Read Blocks"?: number;
  Plans?: ExplainPlan[];
};

type ExplainDocument = {
  Plan?: ExplainPlan;
  "Planning Time"?: number;
  "Execution Time"?: number;
};

type ExplainRow = Record<string, unknown>;

function requireBenchmarkUrl() {
  const raw = process.env.B1_BENCHMARK_DATABASE_URL?.trim();
  if (!raw) {
    throw new Error(
      "Define B1_BENCHMARK_DATABASE_URL. El script nunca usa DATABASE_URL como fallback.",
    );
  }

  const url = new URL(raw);
  if (!url.protocol.startsWith("postgres")) {
    throw new Error("B1_BENCHMARK_DATABASE_URL debe apuntar a PostgreSQL.");
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const expected = process.env.B1_BENCHMARK_CONFIRM_DATABASE?.trim();
  if (!database || expected !== database) {
    throw new Error(
      "B1_BENCHMARK_CONFIRM_DATABASE debe coincidir exactamente con la base objetivo.",
    );
  }

  const localHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (!localHost && process.env.B1_BENCHMARK_ALLOW_REMOTE !== "true") {
    throw new Error(
      "El destino es remoto. Define B1_BENCHMARK_ALLOW_REMOTE=true solo para una copia aislada de staging.",
    );
  }

  return { raw, database, host: url.hostname, localHost };
}

function percentile(values: number[], percentileValue: number) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1),
  );
  return Number((sorted[index] || 0).toFixed(3));
}

function collectPlanStats(plan?: ExplainPlan) {
  const indexNames = new Set<string>();

  function visit(node?: ExplainPlan) {
    if (!node) return;
    if (node["Index Name"]) indexNames.add(node["Index Name"]);
    for (const child of node.Plans || []) visit(child);
  }

  visit(plan);
  return {
    indexNames: [...indexNames].sort(),
    actualRows: Number(plan?.["Actual Rows"] || 0),
    sharedHitBlocks: Number(plan?.["Shared Hit Blocks"] || 0),
    sharedReadBlocks: Number(plan?.["Shared Read Blocks"] || 0),
  };
}

function parseExplain(row: ExplainRow) {
  const value = row["QUERY PLAN"] ?? row["query plan"] ?? Object.values(row)[0];
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  const document = (Array.isArray(parsed) ? parsed[0] : parsed) as ExplainDocument;
  if (!document?.Plan) throw new Error("PostgreSQL no devolvio un plan EXPLAIN JSON valido.");
  return document;
}

async function main() {
  const target = requireBenchmarkUrl();
  const runs = Number(process.env.B1_BENCHMARK_RUNS || REQUIRED_RUNS);
  if (!Number.isInteger(runs) || runs < REQUIRED_RUNS) {
    throw new Error(`B1_BENCHMARK_RUNS debe ser un entero >= ${REQUIRED_RUNS}.`);
  }
  const p95BudgetMs = Number(
    process.env.B1_BENCHMARK_P95_BUDGET_MS || DEFAULT_P95_BUDGET_MS,
  );
  if (!Number.isFinite(p95BudgetMs) || p95BudgetMs <= 0) {
    throw new Error("B1_BENCHMARK_P95_BUDGET_MS debe ser un numero positivo.");
  }

  const suffix = `${process.pid}_${Date.now()}`;
  const schema = `terraqo_b1_benchmark_${suffix}`;
  const table = `"${schema}"."worklog_entry"`;
  const prisma = new PrismaClient({ datasources: { db: { url: target.raw } } });
  const startedAt = new Date();
  const results: Array<Record<string, unknown>> = [];
  let databaseIdentity: { database: string; user: string } | null = null;

  try {
    const identity = await prisma.$queryRawUnsafe<
      Array<{ database: string; user: string }>
    >('SELECT current_database() AS "database", current_user AS "user"');
    databaseIdentity = identity[0] || null;
    if (databaseIdentity?.database !== target.database) {
      throw new Error("La identidad de PostgreSQL no coincide con la base confirmada.");
    }

    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE ${table} (
        "id" text PRIMARY KEY,
        "professionalProfileId" text NOT NULL,
        "occurredAt" timestamptz NOT NULL,
        "visibility" text NOT NULL,
        "evidenceStatus" text NOT NULL,
        "title" text NOT NULL,
        "summary" text NOT NULL,
        "outcome" text,
        "searchVector" tsvector GENERATED ALWAYS AS (
          to_tsvector(
            'spanish'::regconfig,
            coalesce("title", '') || ' ' ||
            coalesce("summary", '') || ' ' ||
            coalesce("outcome", '')
          )
        ) STORED
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX "worklog_profile_occurred_id_desc_idx"
      ON ${table} ("professionalProfileId", "occurredAt" DESC, "id" DESC)
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX "worklog_search_vector_gin_idx"
      ON ${table} USING GIN ("searchVector")
    `);

    for (const volume of VOLUMES) {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${table}`);
      await prisma.$executeRawUnsafe(`
        INSERT INTO ${table} (
          "id", "professionalProfileId", "occurredAt", "visibility",
          "evidenceStatus", "title", "summary", "outcome"
        )
        SELECT
          'worklog-' || series::text,
          'profile-' || (series % 5)::text,
          timestamptz '2026-01-01 12:00:00+00' + (series % 300) * interval '1 day',
          CASE WHEN series % 7 = 0 THEN 'PRIVATE' ELSE 'PUBLIC' END,
          CASE WHEN series % 6 = 0 THEN 'SUPPORTED' ELSE 'DECLARED' END,
          CASE series % 4
            WHEN 0 THEN 'Levantamiento topografico y control de calidad'
            WHEN 1 THEN 'Control de calidad de obra'
            WHEN 2 THEN 'Inspeccion tecnica de campo'
            ELSE 'Reporte de seguridad operacional'
          END,
          CASE series % 4
            WHEN 0 THEN 'Levantamiento topografico con control de calidad documentado'
            WHEN 1 THEN 'Verificacion de niveles y control de calidad'
            WHEN 2 THEN 'Registro de avances ejecutados en campo'
            ELSE 'Inspeccion preventiva y reporte de seguridad'
          END,
          CASE WHEN series % 3 = 0
            THEN 'Resultado conforme al alcance tecnico'
            ELSE NULL
          END
        FROM generate_series(1, ${volume}) AS series
      `);
      await prisma.$executeRawUnsafe(`ANALYZE ${table}`);

      for (const query of QUERIES) {
        for (const shape of SHAPES) {
        const measurements: Array<{
          executionMs: number;
          planningMs: number;
          indexNames: string[];
          actualRows: number;
          sharedHitBlocks: number;
          sharedReadBlocks: number;
        }> = [];

        for (let iteration = 0; iteration < runs + 3; iteration += 1) {
          const projection =
            shape === "page"
              ? 'SELECT "id", "occurredAt"'
              : "SELECT COUNT(*)::bigint AS count";
          const ordering =
            shape === "page"
              ? 'ORDER BY "occurredAt" DESC, "id" DESC LIMIT 21'
              : "";
          const rows = await prisma.$queryRawUnsafe<ExplainRow[]>(
            `
              EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
              ${projection}
              FROM ${table}
              WHERE "professionalProfileId" = $1
                AND "searchVector" @@ websearch_to_tsquery('spanish'::regconfig, $2)
                AND "occurredAt" >= $3
                AND "occurredAt" < $4
                AND "evidenceStatus" = $5
                AND "visibility" = $6
              ${ordering}
            `,
            "profile-0",
            query.value,
            new Date("2026-01-01T00:00:00.000Z"),
            new Date("2027-01-01T00:00:00.000Z"),
            "DECLARED",
            "PUBLIC",
          );
          if (iteration < 3) continue;
          const explain = parseExplain(rows[0] || {});
          measurements.push({
            executionMs: Number(explain["Execution Time"] || 0),
            planningMs: Number(explain["Planning Time"] || 0),
            ...collectPlanStats(explain.Plan),
          });
        }

        const executionTimes = measurements.map((item) => item.executionMs);
        const planningTimes = measurements.map((item) => item.planningMs);
        const indexNames = [
          ...new Set(measurements.flatMap((item) => item.indexNames)),
        ].sort();
        results.push({
          volume,
          query: query.label,
          shape,
          terms: query.value.split(" ").length,
          runs,
          executionMs: {
            p50: percentile(executionTimes, 0.5),
            p95: percentile(executionTimes, 0.95),
            p99: percentile(executionTimes, 0.99),
          },
          planningMs: {
            p50: percentile(planningTimes, 0.5),
            p95: percentile(planningTimes, 0.95),
            p99: percentile(planningTimes, 0.99),
          },
          indexNames,
          ginIndexUsed: indexNames.includes("worklog_search_vector_gin_idx"),
          returnedRows: Math.max(...measurements.map((item) => item.actualRows)),
          sharedHitBlocks: Math.max(
            ...measurements.map((item) => item.sharedHitBlocks),
          ),
          sharedReadBlocks: Math.max(
            ...measurements.map((item) => item.sharedReadBlocks),
          ),
        });
        }
      }
    }

    const scaleResults = results.filter((result) => result.volume === 100_000);
    const ginObservedAtScale = scaleResults.some(
      (result) => result.ginIndexUsed === true,
    );
    const emptyPageQueryAtScale = scaleResults.some(
      (result) =>
        result.shape === "page" && Number(result.returnedRows) === 0,
    );
    const overBudgetAtScale = scaleResults.some(
      (result) =>
        Number((result.executionMs as { p95: number }).p95) > p95BudgetMs,
    );
    const gatePassed =
      ginObservedAtScale && !emptyPageQueryAtScale && !overBudgetAtScale;
    const report = {
      benchmark: "terraqo-worklog-full-text-b1",
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      target: {
        host: target.localHost ? target.host : "remote-staging",
        database: databaseIdentity?.database,
        user: databaseIdentity?.user,
      },
      fixture: { volumes: VOLUMES, synthetic: true, schema },
      results,
      gate: {
        passed: gatePassed,
        p95BudgetMs,
        ginObservedAtScale,
        emptyPageQueryAtScale,
        overBudgetAtScale,
        reason: gatePassed
          ? "Los planes de 100.000 registros devolvieron resultados dentro del presupuesto y PostgreSQL uso el GIN cuando fue selectivo."
          : "Revisar selectividad, resultados, presupuesto p95 y uso del GIN en los planes de 100.000 registros.",
      },
    };
    const outputDirectory = path.resolve("output", "benchmarks");
    await mkdir(outputDirectory, { recursive: true });
    const outputPath = path.join(
      outputDirectory,
      `b1-worklog-full-text-${startedAt.toISOString().replace(/[:.]/g, "-")}.json`,
    );
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Benchmark guardado en ${outputPath}`);
    console.table(
      results.map((result) => ({
        volume: result.volume,
        query: result.query,
        shape: result.shape,
        p95Ms: (result.executionMs as { p95: number }).p95,
        gin: result.ginIndexUsed,
      })),
    );
    if (!gatePassed) process.exitCode = 1;
  } finally {
    if (process.env.B1_BENCHMARK_KEEP_SCHEMA !== "true") {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
