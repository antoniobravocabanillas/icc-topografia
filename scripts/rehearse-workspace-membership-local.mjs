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
  await run(path.join(bin, "psql.exe"), [...psqlArgs, "--single-transaction", "-f", "prisma/migrations/20261104000100_workspace_invitations/migration.sql"]);
  console.log(await run(process.execPath, ["--import", "tsx", "scripts/test-workspace-membership-postgres.ts"]));
  console.log(await run(process.execPath, ["--import", "tsx", "scripts/test-workspace-invitations-postgres.ts"]));
  console.log(await run(process.execPath, ["--import", "tsx", "scripts/test-workspace-member-management-postgres.ts"]));
  if (process.argv.includes("--http-e2e")) console.log(await run(process.execPath, ["--import", "tsx", "scripts/check-s22-authenticated-local.ts"], 600000));
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
