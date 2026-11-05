import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, open, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import net from "node:net";
import os from "node:os";
import path from "node:path";

assert.ok(process.argv.includes("--confirm=local-s22-only"));
const execute = promisify(execFile),
  root = process.cwd();
const directory = await mkdtemp(path.join(os.tmpdir(), "terraqo-s22-local-"));
assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
const bin = "C:/Program Files/PostgreSQL/18/bin";
const server = net.createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const password = randomBytes(24).toString("hex"),
  passwordFile = path.join(directory, "password.txt"),
  data = path.join(directory, "data");
const url = `postgresql://terraqo_s22_test:${password}@127.0.0.1:${port}/postgres?schema=icc&connection_limit=8`;
const env = {
  ...process.env,
  DATABASE_URL: url,
  DIRECT_URL: url,
  PGPASSWORD: password,
  PGOPTIONS: "-c search_path=icc",
  TERRAQO_WORKSPACE_PUBLICATION_V1: "true",
  TERRAQO_LOCAL_S22_TEST: "synthetic-only",
};
async function run(file, args, timeout = 120000) {
  return (
    await execute(file, args, {
      cwd: root,
      env,
      windowsHide: true,
      timeout,
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
    "terraqo_s22_test",
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
  const cli = path.join(root, "node_modules/prisma/build/index.js");
  const baseSql = path.join(directory, "schema.sql");
  // Rehearse the committed additive SQL against the schema before invitations.
  const currentSchema = await readFile(path.join(root, "prisma/schema.prisma"), "utf8");
  assert.ok(currentSchema.includes("model TerraqoWorkspaceInvitation {"));
  const baseline = currentSchema
    .replace(/model TerraqoWorkspaceInvitation \{[\s\S]*?\n\}/, "")
    .replace(/^.*TerraqoWorkspaceInvitation\[\].*\r?\n/gm, "");
  const baselinePath = path.join(directory, "before.prisma");
  await writeFile(baselinePath, baseline);
  await run(process.execPath, [cli, "migrate", "diff", "--from-empty", "--to-schema-datamodel", baselinePath, "--script", "--output", baseSql]);
  const psqlArgs = [
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "terraqo_s22_test",
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
  if (process.argv.includes("--staging-artifact")) {
    const audit = JSON.parse(await readFile("docs/work-documented/s22-staging-ledger-2026-11-04.json", "utf8"));
    await run(process.execPath, ["--import", "tsx", "scripts/prepare-s22-staging-migration.ts", "docs/work-documented/s22-staging-ledger-2026-11-04.json"]);
    // All roles, grants and ledger rows below exist only inside this fresh local cluster.
    const rows = audit.ledger.map((row, index) => {
      assert.match(row.migration_name, /^[a-z0-9_]+$/);
      assert.match(row.checksum, /^[a-f0-9]{64}$/);
      return `('local-${index}','${row.checksum}',now(),'${row.migration_name}',now(),1)`;
    }).join(",");
    const setup = path.join(directory, "staging-role-fixture.sql");
    await writeFile(setup, `
      CREATE ROLE postgres; CREATE ROLE terraqo_staging_migrator; CREATE ROLE terraqo_staging_runtime;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE icc._prisma_migrations (id text primary key, checksum text not null, finished_at timestamptz, migration_name text not null, started_at timestamptz, applied_steps_count integer, rolled_back_at timestamptz);
      INSERT INTO icc._prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES ${rows};
      GRANT USAGE,CREATE ON SCHEMA icc TO terraqo_staging_migrator;
      GRANT ALL ON ALL TABLES IN SCHEMA icc TO terraqo_staging_migrator;
      GRANT USAGE ON SCHEMA icc TO terraqo_staging_runtime;
      ALTER DEFAULT PRIVILEGES FOR ROLE terraqo_staging_migrator IN SCHEMA icc GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO terraqo_staging_runtime;
      INSERT INTO icc._prisma_migrations (id,checksum,migration_name,started_at) VALUES ('local-unfinished','fixture','fixture_unfinished',now());
    `);
    await run(path.join(bin, "psql.exe"), [...psqlArgs, "--single-transaction", "-f", setup]);
    const artifactArgs = [...psqlArgs, "-f", "output/s22/staging-migration.sql"];
    await assert.rejects(run(path.join(bin, "psql.exe"), artifactArgs), "Unfinished migration must reject artifact");
    const absent = await run(path.join(bin, "psql.exe"), [...psqlArgs, "-At", "-c", `SELECT to_regclass('icc."TerraqoWorkspaceInvitation"') IS NULL`]);
    assert.equal(absent.trim(), "t", "Failed artifact must roll back table creation");
    await run(path.join(bin, "psql.exe"), [...psqlArgs, "-c", "DELETE FROM icc._prisma_migrations WHERE id='local-unfinished'"]);
    await run(path.join(bin, "psql.exe"), artifactArgs);
    await assert.rejects(run(path.join(bin, "psql.exe"), artifactArgs), "Already applied artifact must reject replay");
    const applied = await run(path.join(bin, "psql.exe"), [...psqlArgs, "-At", "-c", "SELECT count(*) FROM icc._prisma_migrations WHERE migration_name='20261104000100_workspace_invitations' AND finished_at IS NOT NULL"]);
    assert.equal(applied.trim(), "1");
    console.log("PASS local staging SQL artifact: role/default-grant checks, unfinished-ledger rejection, rollback, application and duplicate rejection. No remote DDL.");
  } else {
    await run(path.join(bin, "psql.exe"), [...psqlArgs, "--single-transaction", "-f", "prisma/migrations/20261104000100_workspace_invitations/migration.sql"]);
  }
  if (process.argv.includes("--ordinary-access-only")) {
    env.NODE_ENV = "development";
    env.NETLIFY = "false";
    console.log(await run(process.execPath, ["--import", "tsx", "scripts/test-s22-ordinary-access-postgres.ts"]));
  } else {
    console.log(await run(process.execPath, ["--import", "tsx", "scripts/test-workspace-membership-postgres.ts"]));
    console.log(await run(process.execPath, ["--import", "tsx", "scripts/test-workspace-invitations-postgres.ts"]));
    console.log(await run(process.execPath, ["--import", "tsx", "scripts/test-workspace-member-management-postgres.ts"]));
    console.log(await run(process.execPath, ["--import", "tsx", "scripts/test-s22-dossier-authority-postgres.ts"]));
    if (process.argv.includes("--http-e2e")) console.log(await run(process.execPath, ["--import", "tsx", "scripts/check-s22-authenticated-local.ts"], 600000));
  }
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
