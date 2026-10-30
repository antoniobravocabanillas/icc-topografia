import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { open, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

type BaselineManifest = {
  format: string;
  containsApplicationRows: boolean;
  schema: string;
  historicalMigrations: string[];
  rolloutMigrations: string[];
};

const execFileAsync = promisify(execFile);
const confirmation = "rehearse-pre-b1-baseline";
const postgresBin = "C:\\Program Files\\PostgreSQL\\18\\bin";

async function run(
  executable: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeout?: number },
) {
  const result = await execFileAsync(executable, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: options.timeout ?? 120_000,
    windowsHide: true,
  });
  return result.stdout.trim();
}

async function reserveLoopbackPort() {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string", "No se pudo reservar un puerto local.");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForExit(child: ChildProcess, timeoutMs: number) {
  if (child.exitCode !== null) return;
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("PostgreSQL no termino dentro del plazo.")), timeoutMs)),
  ]);
}

async function waitUntilReady(
  pgIsReady: string,
  port: number,
  cwd: string,
  processHandle: ChildProcess,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    assert.equal(processHandle.exitCode, null, "PostgreSQL termino antes de quedar listo.");
    try {
      await run(pgIsReady, ["-h", "127.0.0.1", "-p", String(port), "-d", "postgres"], {
        cwd,
        timeout: 2_000,
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("PostgreSQL no quedo listo dentro del plazo.");
}

async function main() {
  assert.equal(
    process.env.PLATFORM_STAGING_REHEARSAL_CONFIRM,
    confirmation,
    `Define PLATFORM_STAGING_REHEARSAL_CONFIRM=${confirmation}.`,
  );

  const root = process.cwd();
  const output = path.join(root, "output", "platform-staging-baseline");
  const sqlPath = path.join(output, "pre-b1-baseline.sql");
  const manifest = JSON.parse(
    await readFile(path.join(output, "manifest.json"), "utf8"),
  ) as BaselineManifest;
  assert.equal(manifest.format, "terraqo-platform-staging-baseline/v1");
  assert.equal(manifest.containsApplicationRows, false);
  assert.equal(manifest.schema, "icc");
  assert.equal(manifest.historicalMigrations.length, 36);
  assert.equal(manifest.rolloutMigrations.length, 7);

  const temporary = await mkdtemp(path.join(os.tmpdir(), "terraqo-staging-rehearsal-v2-"));
  const dataDirectory = path.join(temporary, "postgres-data");
  const passwordFile = path.join(temporary, "postgres-password.txt");
  const logPath = path.join(temporary, "postgres.log");
  const password = randomBytes(24).toString("hex");
  const databaseUser = "terraqo_rehearsal";
  const databaseName = "postgres";
  const port = await reserveLoopbackPort();
  const databaseUrl = `postgresql://${databaseUser}:${password}@127.0.0.1:${port}/${databaseName}?schema=icc`;
  const commandEnv = { ...process.env, DATABASE_URL: databaseUrl, PGPASSWORD: password };
  const initdb = path.join(postgresBin, "initdb.exe");
  const postgresExecutable = path.join(postgresBin, "postgres.exe");
  const pgCtl = path.join(postgresBin, "pg_ctl.exe");
  const pgIsReady = path.join(postgresBin, "pg_isready.exe");
  const psql = path.join(postgresBin, "psql.exe");
  const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
  let postgres: ChildProcess | null = null;
  let logHandle: Awaited<ReturnType<typeof open>> | null = null;
  let report: Record<string, unknown> | null = null;
  let executionError: unknown;

  try {
    await writeFile(passwordFile, password, { encoding: "utf8", flag: "wx" });
    // Windows can default to WIN1252. Match the application's UTF-8 data,
    // including names, Unicode evidence and emoji, on every rehearsal host.
    await run(initdb, ["-D", dataDirectory, "-U", databaseUser, "-A", "scram-sha-256", "--pwfile", passwordFile, "--encoding=UTF8", "--no-sync"], { cwd: root });
    logHandle = await open(logPath, "a");
    postgres = spawn(
      postgresExecutable,
      ["-D", dataDirectory, "-h", "127.0.0.1", "-p", String(port)],
      { cwd: root, env: commandEnv, stdio: ["ignore", logHandle.fd, logHandle.fd], windowsHide: true },
    );
    await waitUntilReady(pgIsReady, port, root, postgres);

    await run(psql, ["-h", "127.0.0.1", "-p", String(port), "-U", databaseUser, "-d", databaseName, "-v", "ON_ERROR_STOP=1", "--single-transaction", "-f", sqlPath], { cwd: root, env: commandEnv });

    for (const [index, migration] of manifest.historicalMigrations.entries()) {
      await run(process.execPath, [prismaCli, "migrate", "resolve", "--applied", migration, "--schema", "prisma/schema.prisma"], { cwd: root, env: commandEnv });
      if ((index + 1) % 6 === 0) process.stdout.write(`Resolved historical migrations: ${index + 1}/36\n`);
    }

    await run(process.execPath, [prismaCli, "migrate", "deploy", "--schema", "prisma/schema.prisma"], { cwd: root, env: commandEnv, timeout: 180_000 });
    const migrationStatus = await run(process.execPath, [prismaCli, "migrate", "status", "--schema", "prisma/schema.prisma"], { cwd: root, env: commandEnv });
    assert.match(migrationStatus, /Database schema is up to date!/);

    const query = (sql: string) => run(psql, [
      "-h", "127.0.0.1", "-p", String(port), "-U", databaseUser, "-d", databaseName,
      "-At", "-v", "ON_ERROR_STOP=1", "-c", sql,
    ], { cwd: root, env: commandEnv });
    const ledger = await query(`SELECT count(*) || ':' || count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) || ':' || count(*) FILTER (WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL) FROM icc._prisma_migrations;`);
    assert.equal(ledger, "43:43:0", "El ledger Prisma no quedo completo y limpio.");
    const keyObjects = await query(`SELECT count(*) FROM information_schema.tables WHERE table_schema = 'icc' AND table_name IN ('TerraqoWorkCase','TerraqoShareCollection','TerraqoAccessGrant','TerraqoWorkNeed','TerraqoEvaluationDossier','TerraqoAnalysisJob');`);
    assert.equal(keyObjects, "6", "Faltan objetos clave de B1-B5.");
    const indexState = await query(`SELECT i.indisvalid::text || ':' || i.indisready::text FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'icc' AND c.relname = 'Worklog_search_vector_gin_idx';`);
    assert.equal(indexState, "true:true", "El indice full-text no quedo valido y listo.");
    const applicationRows = await query(`DO $$ DECLARE item record; has_row boolean; BEGIN FOR item IN SELECT tablename FROM pg_tables WHERE schemaname = 'icc' AND tablename <> '_prisma_migrations' LOOP EXECUTE format('SELECT EXISTS (SELECT 1 FROM icc.%I LIMIT 1)', item.tablename) INTO has_row; IF has_row THEN RAISE EXCEPTION 'application table % contains rows', item.tablename; END IF; END LOOP; END $$; SELECT '0';`);
    assert.match(applicationRows, /(?:^|\n)0$/, "El ensayo contiene filas de aplicacion.");
    const drift = await run(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "scripts/check-b5-schema-drift.ts"], {
      cwd: root,
      env: { ...commandEnv, B5_GATE_DATABASE_URL: databaseUrl, B5_GATE_EXPECTED_DATABASE: databaseName },
    });
    assert.match(drift, /B5 schema drift gate: OK/);

    report = {
      mode: "local-disposable-rehearsal-v2",
      postgres: "18",
      historicalMigrationsResolved: 36,
      rolloutMigrationsApplied: 7,
      ledger: { total: 43, complete: 43, incomplete: 0 },
      keyObjects: 6,
      fullTextIndex: "valid-ready",
      applicationRows: 0,
      schemaDrift: "two-intentional-full-text-artifacts",
    };
  } catch (error) {
    executionError = error;
  } finally {
    if (postgres?.exitCode === null) {
      try {
        await run(pgCtl, ["-D", dataDirectory, "-m", "fast", "-w", "stop"], { cwd: root, timeout: 30_000 });
        await waitForExit(postgres, 10_000);
      } catch (stopError) {
        postgres.kill();
        if (!executionError) executionError = stopError;
      }
    }
    await logHandle?.close();
    if (!executionError) {
      assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
      assert.ok(path.basename(temporary).startsWith("terraqo-staging-rehearsal-v2-"));
      await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    } else {
      console.error(`El ensayo se preservo para diagnostico en ${temporary}.`);
    }
  }

  if (executionError) throw executionError;
  console.log(JSON.stringify({ ...report, cleanedUp: true }));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Platform staging rehearsal failed.";
  console.error(message.replace(/postgresql:\/\/[^\s]+/gi, "postgresql://[redacted]"));
  process.exitCode = 1;
});
