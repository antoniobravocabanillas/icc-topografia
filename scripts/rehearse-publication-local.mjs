import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, open, unlink, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import net from "node:net";
import os from "node:os";
import path from "node:path";

assert.ok(process.argv.includes("--confirm=local-s24-only"));
const execute = promisify(execFile),
  root = process.cwd();
const directory = await mkdtemp(path.join(os.tmpdir(), "terraqo-s24-local-"));
assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
const bin = "C:/Program Files/PostgreSQL/18/bin";
const server = net.createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const password = randomBytes(24).toString("hex"),
  passwordFile = path.join(directory, "password.txt"),
  data = path.join(directory, "data");
const url = `postgresql://terraqo_s24_test:${password}@127.0.0.1:${port}/postgres?schema=icc&connection_limit=8`;
const env = {
  ...process.env,
  DATABASE_URL: url,
  DIRECT_URL: url,
  PGPASSWORD: password,
  PGOPTIONS: "-c search_path=icc",
  TERRAQO_WORKSPACE_PUBLICATION_V1: "true",
  TERRAQO_SCOPED_SHARING_V1: "true",
  S24_BLOB_DIRECTORY: path.join(directory, "s24-blobs"),
  NODE_ENV: "test",
  TERRAQO_LOCAL_S24_TEST: "synthetic-only",
};
async function run(file, args) {
  return (
    await execute(file, args, {
      cwd: root,
      env,
      windowsHide: true,
      timeout: 120000,
      maxBuffer: 32 * 1024 * 1024,
    })
  ).stdout;
}
let child, log;
try {
  await writeFile(passwordFile, password, { flag: "wx" });
  await run(path.join(bin, "initdb.exe"), [
    "-D",
    data,
    "-U",
    "terraqo_s24_test",
    "-A",
    "scram-sha-256",
    "--pwfile",
    passwordFile,
    "--encoding=UTF8",
    "--no-sync",
  ]);
  log = await open(path.join(directory, "postgres.log"), "a");
  child = spawn(
    path.join(bin, "postgres.exe"),
    ["-D", data, "-h", "127.0.0.1", "-p", String(port)],
    { env, windowsHide: true, stdio: ["ignore", log.fd, log.fd] },
  );
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      await run(path.join(bin, "pg_isready.exe"), [
        "-h",
        "127.0.0.1",
        "-p",
        String(port),
      ]);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  assert.ok(ready, "Disposable local database did not start");
  const baseline = path.join(directory, "baseline.prisma");
  await writeFile(
    baseline,
    await run("git", [
      "show",
      "c623ec8e70d27c04babc3cb0ac6c594b00bc4cfc:prisma/schema.prisma",
    ]),
  );
  const cli = path.join(root, "node_modules/prisma/build/index.js");
  const baseSql = path.join(directory, "baseline.sql"),
    migration = path.join(directory, "s24.sql");
  await run(process.execPath, [
    cli,
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema-datamodel",
    baseline,
    "--script",
    "--output",
    baseSql,
  ]);
  const afterS24 = path.join(directory, "after-s24.prisma");
  await writeFile(afterS24, await run("git", ["show", "ce911d5a5a28baccbbee4aea45092aef5c17e9e4:prisma/schema.prisma"]));
  await run(process.execPath, [
    cli,
    "migrate",
    "diff",
    "--from-schema-datamodel",
    baseline,
    "--to-schema-datamodel",
    afterS24,
    "--script",
    "--output",
    migration,
  ]);
  const artifact = path.join(root, "prisma/migrations/20261101000100_enterprise_publication_review/migration.sql");
  const normalize = text => text.replaceAll('"icc".', '').replaceAll('\r\n', '\n').trim();
  assert.equal(normalize(await readFile(artifact, "utf8")), normalize(await readFile(migration, "utf8")), "Migration artifact must match datamodel diff");
  const psqlArgs = [
    "-X",
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "terraqo_s24_test",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ];
  await run(path.join(bin, "psql.exe"), [
    ...psqlArgs,
    "--single-transaction",
    "-f",
    baseSql,
  ]);
  await run(path.join(bin, "psql.exe"), [
    ...psqlArgs,
    "-c",
    `INSERT INTO icc."User" (id,email,"updatedAt") VALUES ('migration-sentinel','sentinel@s24.invalid',NOW())`,
  ]);
  await run(path.join(bin, "psql.exe"), [
    ...psqlArgs,
    "--single-transaction",
    "-f",
    artifact,
  ]);
  for (const migrationName of [
    "20261102000100_selection_access_requests", "20261104000100_workspace_invitations",
    "20261104000200_customer_attention_followup", "20261104000300_workspace_evaluators",
  ]) {
    await run(path.join(bin, "psql.exe"), [...psqlArgs, "-f", path.join(root, "prisma/migrations", migrationName, "migration.sql")]);
  }
  await mkdir(env.S24_BLOB_DIRECTORY);
  await mkdir("output", { recursive: true });
  const expanded = JSON.parse((await run(process.execPath, ["--import", "tsx", "scripts/test-s24-acceptance-postgres.ts"])).trim());
  assert.equal(expanded.localOnly, true);
  assert.equal(expanded.cleanup, "matched");
  console.log(JSON.stringify(expanded));
  console.log(
    await run(process.execPath, [
      "--import",
      "tsx",
      "scripts/test-publication-postgres.ts",
    ]),
  );
  await writeFile(
    "output/publication-local-rehearsal.json",
    JSON.stringify(
      {
        passed: true,
        database: "disposable-loopback-postgresql18",
        schemaMigration: true,
        syntheticOnly: true,
        productionWrites: false,
        stagingWrites: false,
        concurrency: true,
        expandedS24: expanded,
        sourceBaseline: "c623ec8e70d27c04babc3cb0ac6c594b00bc4cfc",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    String(error.message).replaceAll(password, "[redacted]").slice(0, 3500),
  );
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    try {
      await run(path.join(bin, "pg_ctl.exe"), [
        "-D",
        data,
        "-m",
        "fast",
        "-w",
        "stop",
      ]);
    } catch {
      child.kill();
    }
  }
  await log?.close();
  await unlink(passwordFile).catch(() => {});
  console.log(
    "Local cluster stopped; synthetic-only directory retained. No remote database connections.",
  );
}
