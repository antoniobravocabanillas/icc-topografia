import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, open, unlink } from "node:fs/promises";
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
  await run(process.execPath, [cli, "migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script", "--output", baseSql]);
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
  console.log(await run(process.execPath, ["--import", "tsx", "scripts/test-workspace-membership-postgres.ts"]));
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
