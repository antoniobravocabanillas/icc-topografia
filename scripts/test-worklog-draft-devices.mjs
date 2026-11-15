import assert from "node:assert/strict";
import { execFile, spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cp, mkdir, mkdtemp, open, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { createServer as httpServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { BlobsServer } from "@netlify/blobs/server";

// Own the disposable PG cluster, Next build directory and local provider for this run.
const exec = promisify(execFile);
const root = process.cwd();
const temp = await mkdtemp(path.join(os.tmpdir(), "terraqo-draft-devices-"));
assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
const bin = process.env.PG_BIN || "C:/Program Files/PostgreSQL/18/bin";
const pg = (name) => path.join(bin, name + (process.platform === "win32" ? ".exe" : ""));
const app = path.join(temp, "app"),
  data = path.join(temp, "pg");
async function freePort() {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}
const pgPort = await freePort(),
  port = await freePort();
const origin = "http://127.0.0.1:" + port;
const secret = randomBytes(24).toString("hex");
const database = "postgresql://terraqo_s22_test:" + secret + "@127.0.0.1:" + pgPort + "/postgres?schema=icc";
const env = {
  DATABASE_URL: database,
  DIRECT_URL: database,
  AUTH_SECRET: randomBytes(32).toString("hex"),
  AUTH_URL: origin,
  AUTH_TRUST_HOST: "true",
  NEXT_PUBLIC_SITE_URL: origin,
  NEXT_TELEMETRY_DISABLED: "1",
  TERRAQO_LOCAL_S22_TEST: "synthetic-only",
  TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "false",
  TERRAQO_WORKSPACE_INVITATIONS_V1: "true",
};
for (const [k, v] of Object.entries(process.env)) {
  if (
    /^(path|systemroot|windir|temp|tmp|userprofile|appdata|localappdata|comspec|pathext|programfiles.*|programdata|home|playwright_browsers_path)$/i.test(
      k,
    )
  )
    env[k] = v;
}
const log = await open(path.join(temp, "server.log"), "w");
const localBlobs = new BlobsServer({ directory: path.join(temp, "blobs"), token: secret });
// The SDK's emulator returns an ETag on PUT but omits it on GET. Relay its actual
// write ETag on reads; the emulator still performs every conditional write to disk.
const etags = new Map();
let queue = Promise.resolve();
let blobOrigin;
const relay = httpServer((req, res) => {
  queue = queue
    .then(async () => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const headers = new Headers();
      for (const name of ["authorization", "if-match", "if-none-match", "content-type"]) {
        if (req.headers[name]) headers.set(name, req.headers[name]);
      }
      const result = await fetch(blobOrigin + req.url, {
        method: req.method,
        headers,
        body: req.method === "PUT" ? Buffer.concat(chunks) : undefined,
      });
      if (req.method === "PUT" && result.ok) etags.set(req.url, result.headers.get("etag"));
      const tag = req.method === "GET" ? etags.get(req.url) : result.headers.get("etag");
      if (result.ok && tag) res.setHeader("etag", tag);
      res.writeHead(result.status);
      res.end(Buffer.from(await result.arrayBuffer()));
    })
    .catch(() => {
      res.destroy();
    });
});
let next,
  pgStarted = false,
  blobsStarted = false;
try {
  const pw = path.join(temp, "pw");
  await writeFile(pw, secret, { mode: 0o600 });
  await exec(
    pg("initdb"),
    [
      "-D",
      data,
      "-U",
      "terraqo_s22_test",
      "-A",
      "scram-sha-256",
      "--pwfile",
      pw,
      "--encoding=UTF8",
      "--no-sync",
    ],
    { env },
  );
  await rm(pw);
  const started = spawnSync(
    pg("pg_ctl"),
    ["-D", data, "-l", path.join(temp, "postgres.log"), "-o", "-h 127.0.0.1 -p " + pgPort, "-w", "start"],
    { env, windowsHide: true, stdio: "ignore", timeout: 45000 },
  );
  assert.equal(started.status, 0, "PostgreSQL local no arrancó.");
  pgStarted = true;
  const cli = path.join(root, "node_modules/prisma/build/index.js");
  await exec(process.execPath, [cli, "db", "push", "--skip-generate", "--schema", "prisma/schema.prisma"], {
    env,
  });
  const address = await localBlobs.start();
  blobsStarted = true;
  blobOrigin = "http://127.0.0.1:" + address.port;
  await new Promise((resolve) => relay.listen(0, "127.0.0.1", resolve));
  const edgeURL = "http://127.0.0.1:" + relay.address().port;
  env.NETLIFY_BLOBS_CONTEXT = Buffer.from(
    JSON.stringify({ siteID: "worklog-draft-test", token: secret, edgeURL, uncachedEdgeURL: edgeURL }),
  ).toString("base64");
  await mkdir(app);
  for (const file of [
    "app",
    "components",
    "lib",
    "types",
    "auth.ts",
    "middleware.ts",
    "tsconfig.json",
    "next.config.ts",
    "package.json",
    "tailwind.config.ts",
    "postcss.config.js",
    "emails",
    "services",
  ]) {
    await cp(path.join(root, file), path.join(app, file), { recursive: true });
  }
  await symlink(
    path.join(root, "node_modules"),
    path.join(app, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await symlink(
    path.join(root, "public"),
    path.join(app, "public"),
    process.platform === "win32" ? "junction" : "dir",
  );
  next = spawn(
    process.execPath,
    [
      path.join(root, "node_modules/next/dist/bin/next"),
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { cwd: app, env, windowsHide: true, stdio: ["ignore", log.fd, log.fd] },
  );
  for (let i = 0; i < 90; i++) {
    if (next.exitCode !== null) throw Error("Next terminó durante el arranque.");
    try {
      if ((await fetch(origin + "/api/auth/csrf", { signal: AbortSignal.timeout(15000) })).ok) break;
    } catch {}
    if (i === 89) throw Error("Next no respondió.");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const result = await exec(
    process.execPath,
    ["--import", "tsx", "scripts/verify-worklog-draft-conflict.ts", origin],
    { env, windowsHide: true, timeout: 300000 },
  );
  console.log(result.stdout.trim());
} finally {
  try {
    if (next?.pid && next.exitCode === null) {
      if (process.platform === "win32")
        await exec("taskkill", ["/PID", String(next.pid), "/T", "/F"], { windowsHide: true });
      else next.kill("SIGTERM");
    }
  } finally {
    try {
      if (relay.listening) await new Promise((resolve) => relay.close(resolve));
      if (blobsStarted) await localBlobs.stop();
      if (pgStarted) await exec(pg("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { env });
    } finally {
      await log.close();
      await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
}
