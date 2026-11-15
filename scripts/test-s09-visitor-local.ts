import assert from "node:assert/strict";
import { spawn, spawnSync, execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, open, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";
import { s24BlobFixtures } from "./lib/s24-blob-fixtures.mjs";
import { assertWorkspaceAdministrationTestTarget } from "./lib/workspace-administration-test-target";

const exec = promisify(execFile);
async function port() {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => probe.on("error", reject).listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  assert.ok(address && typeof address === "object");
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return address.port;
}

async function exerciseLocal() {
  const origin = process.env.AUTH_URL!;
  assert.equal(assertWorkspaceAdministrationTestTarget(process.env, origin), "local");
  const db = new PrismaClient();
  try {
    assert.deepEqual(await db.$queryRaw`SELECT current_user AS role, current_database() AS database`,
      [{ role: "terraqo_s22_test", database: "postgres" }]);
    const { exerciseVisitor } = await import("./lib/s09-visitor-scenario");
    const run = await exerciseVisitor(db, origin, phase => console.log("S09 local", phase));
    console.log("S09 local verified fixture cleanup", run);
  } finally { await db.$disconnect(); }
}

async function rehearse() {
  const root = process.cwd();
  const local = await mkdtemp(path.join(os.tmpdir(), "terraqo-s09-"));
  const app = path.join(local, "app"), data = path.join(local, "pg");
  const pgPort = await port(), webPort = await port();
  const host = "http://127.0.0.1:" + webPort, secret = randomBytes(24).toString("hex");
  const url = "postgresql://terraqo_s22_test:" + secret + "@127.0.0.1:" + pgPort + "/postgres?schema=icc";
  const run = randomUUID();
  const env: NodeJS.ProcessEnv = { NODE_ENV: "development", DATABASE_URL: url, DIRECT_URL: url, AUTH_URL: host, AUTH_TRUST_HOST: "true",
    NEXT_PUBLIC_SITE_URL: host, NEXT_PUBLIC_PORTAL_URL: host, NEXT_TELEMETRY_DISABLED: "1", AUTH_SECRET: randomBytes(32).toString("hex"),
    TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "false", TERRAQO_LOCAL_S22_TEST: "synthetic-only", TERRAQO_WORKSPACE_INVITATIONS_V1: "true",
    TERRAQO_WORKSPACE_PUBLICATION_V1: "true", TERRAQO_WORK_CASES_V1: "true", TERRAQO_SCOPED_SHARING_V1: "true",
    PLATFORM_STAGING_S24_BLOB_RUN: run };
  for (const [key, value] of Object.entries(process.env))
    if (/^(path|systemroot|windir|temp|tmp|home|userprofile|appdata|localappdata|comspec|pathext|programfiles.*|programdata|playwright_browsers_path)$/i.test(key)) env[key] = value;
  const bin = process.env.PG_BIN || (process.platform === "win32" ? "C:/Program Files/PostgreSQL/18/bin" : "");
  const pg = (name: string, args: string[]) => exec(path.join(bin, name), args, { env, windowsHide: true, timeout: 60000 });
  const log = await open(path.join(local, "server.log"), "w");
  let next: ReturnType<typeof spawn> | undefined, started = false;
  try {
    const pw = path.join(local, "pw");
    await writeFile(pw, secret, { mode: 0o600 });
    await pg("initdb", ["-D", data, "-U", "terraqo_s22_test", "-A", "scram-sha-256", "--pwfile", pw, "--encoding=UTF8", "--no-sync"]);
    await rm(pw);
    // A detached Windows postmaster must not inherit execFile's output pipes.
    const boot = spawnSync(path.join(bin, "pg_ctl"), ["-D", data, "-l", path.join(local, "pg.log"),
      "-o", "-h 127.0.0.1 -p " + pgPort, "-w", "start"], { env, stdio: "ignore", windowsHide: true, timeout: 60000 });
    assert.equal(boot.status, 0, "Loopback PostgreSQL failed to start");
    started = true;
    await exec(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate", "--schema", "prisma/schema.prisma"], { cwd: root, env, windowsHide: true });
    await mkdir(app);
    for (const name of ["app","lib","components","types","services","emails","auth.ts","middleware.ts","next.config.ts",
      "tsconfig.json","package.json","tailwind.config.ts","postcss.config.js"])
      await cp(path.join(root, name), path.join(app, name), { recursive: true });
    for (const name of ["node_modules", "public"])
      await symlink(path.join(root, name), path.join(app, name), process.platform === "win32" ? "junction" : "dir");
    next = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(webPort)],
      { cwd: app, env, stdio: ["ignore", log.fd, log.fd], windowsHide: true });
    for (let i = 0; i < 90; i++) {
      assert.equal(next.exitCode, null);
      try { if ((await fetch(host + "/api/auth/csrf", { signal: AbortSignal.timeout(15000) })).ok) break; } catch { /* cold start */ }
      assert.ok(i < 89, "Loopback app did not start");
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    // Next cleans its development directory on startup. Stage local bytes after readiness.
    for (const blob of s24BlobFixtures(run).flat()) {
      const file = path.join(app, ".next/local-media/terraqo-worklog-evidence", blob.key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, blob.bytes, { flag: "wx" });
    }
    const test = spawn(process.execPath, ["--import", "tsx", "scripts/test-s09-visitor-local.ts", "--loopback"],
      { cwd: root, env, stdio: "inherit", windowsHide: true });
    const code = await new Promise<number | null>((resolve, reject) => test.on("error", reject).once("exit", resolve));
    assert.equal(code, 0, "Loopback S09 journey failed");
  } finally {
    try {
      if (next?.pid && next.exitCode === null && next.signalCode === null) {
        if (process.platform === "win32") {
          // taskkill can return 255 while Node is still delivering the process exit event.
          const exited = new Promise<void>(resolve => next!.once("exit", () => resolve()));
          try { await exec("taskkill", ["/PID", String(next.pid), "/T", "/F"], { windowsHide: true }); }
          catch (error) {
            let deadline: NodeJS.Timeout | undefined;
            try {
              await Promise.race([exited, new Promise<never>((_, reject) => {
                deadline = setTimeout(() => reject(error), 8000);
              })]);
            } finally { clearTimeout(deadline); }
          }
          await exited;
        }
        else next.kill("SIGTERM");
      }
    } finally {
      if (started) await pg("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
      await log.close();
      assert.equal(path.dirname(local), path.resolve(os.tmpdir()));
      await rm(local, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
  console.log("PASS S09 local PostgreSQL, Next.js, Chromium and fixture cleanup");
}

(process.argv[2] === "--loopback" ? exerciseLocal() : rehearse()).catch(error => {
  // Local diagnostics show assertion locations without including credentials or response bodies.
  const location = error instanceof Error ? error.stack?.split("\n").filter(line => /\bat .*s0[69]-/.test(line)).slice(0, 3) : [];
  const diagnostic = error as NodeJS.ErrnoException & { actual?: unknown; expected?: unknown; cmd?: string };
  console.error("S09 local rejected", { location, code: diagnostic.code, syscall: diagnostic.syscall,
    command: diagnostic.cmd?.split(" ")[0]?.split(/[\\/]/).pop(),
    actual: typeof diagnostic.actual === "number" ? diagnostic.actual : undefined,
    expected: typeof diagnostic.expected === "number" ? diagnostic.expected : undefined });
  process.exitCode = 1;
});
