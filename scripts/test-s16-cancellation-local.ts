import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function main() {
  assert.ok(process.argv.includes("--confirm=local-s16-only"));
  const root = process.cwd();
  const local = await mkdtemp(path.join(os.tmpdir(), "terraqo-s16-cancellation-"));
  const data = path.join(local, "pg");
  const probe = createServer();
  await new Promise<void>((resolve, reject) => probe.on("error", reject).listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  const secret = randomBytes(24).toString("hex");
  const database = "s16_cancellation_test";
  const url = `postgresql://${database}:${secret}@127.0.0.1:${port}/${database}?schema=icc&connection_limit=8`;
  // Inherit OS essentials only. No app credentials, remote URLs or provider flags.
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test", DATABASE_URL: url, DIRECT_URL: url,
    S16_TEST_DATABASE: database, S16_TEST_SYNTHETIC: "confirmed",
    TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "false",
  };
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(path|systemroot|windir|temp|tmp|home|userprofile|appdata|localappdata|comspec|pathext|programfiles.*|programdata)$/i.test(key)) env[key] = value;
  }
  const bin = process.env.PG_BIN || (process.platform === "win32" ? "C:/Program Files/PostgreSQL/18/bin" : "");
  const pg = (name: string, args: string[]) => exec(path.join(bin, name), args, {
    env: { ...env, PGPASSWORD: secret }, windowsHide: true, timeout: 60_000,
  });
  let started = false;
  try {
    const pw = path.join(local, "pw");
    await writeFile(pw, secret, { mode: 0o600 });
    await pg("initdb", ["-D", data, "-U", database, "-A", "scram-sha-256", "--pwfile", pw, "--encoding=UTF8", "--no-sync"]);
    await rm(pw);
    const boot = spawnSync(path.join(bin, "pg_ctl"), ["-D", data, "-l", path.join(local, "pg.log"),
      "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"], { env, stdio: "ignore", windowsHide: true, timeout: 60_000 });
    // Record startup before asserting so a partially successful start is stopped too.
    started = boot.status === 0 || await access(path.join(data, "postmaster.pid")).then(() => true, () => false);
    assert.equal(boot.status, 0, "S16 isolated PostgreSQL failed to start");
    await pg("createdb", ["-h", "127.0.0.1", "-p", String(port), "-U", database, database]);
    await exec(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate", "--schema", "prisma/schema.prisma"], {
      cwd: root, env, windowsHide: true, timeout: 60_000,
    });
    for (const script of ["test-s16-cancellation-postgres.ts"]) {
      const result = await exec(process.execPath, ["--import", "tsx", `scripts/${script}`], {
        cwd: root, env, windowsHide: true, timeout: 60_000,
      });
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
    }
  } finally {
    // Delete only this mkdtemp cluster after its own postmaster is confirmed stopped.
    if (started) await pg("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
    assert.equal(path.dirname(path.resolve(local)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(local).startsWith("terraqo-s16-cancellation-"));
    await rm(local, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    await assert.rejects(access(local), { code: "ENOENT" });
    console.log("PASS S16 cancellation isolated cluster stopped and removed");
  }
}

main().catch((error: unknown) => {
  const diagnostic = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
  // Child test output is synthetic; never print execFile's command/env (contains credentials).
  if (diagnostic.stdout) process.stderr.write(diagnostic.stdout);
  if (diagnostic.stderr) process.stderr.write(diagnostic.stderr);
  console.error("S16 local failed", { code: diagnostic.code, syscall: diagnostic.syscall });
  process.exitCode = 1;
});
