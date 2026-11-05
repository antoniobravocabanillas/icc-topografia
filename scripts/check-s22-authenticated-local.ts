import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, open, readdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { verifyWorkspaceAdministration } from "./test-workspace-administration-authenticated";

async function main() {
  const database = new URL(process.env.DATABASE_URL || "");
  assert.equal(database.hostname, "127.0.0.1");
  assert.equal(database.username, "terraqo_s22_test");
  assert.equal(process.env.TERRAQO_LOCAL_S22_TEST, "synthetic-only");
  for (const file of await readdir(process.cwd())) assert.ok(!/^\.env(?:\.(?:local|development|production|test)(?:\.local)?)?$/.test(file), "Refusing automatic env-file loading");
  const db = new PrismaClient();
  const probe = net.createServer();
  await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const out = path.resolve("output/s22/authenticated"); await mkdir(out, { recursive: true });
  const log = await open(path.join(out, "next-local.log"), "w");
  // Pass only OS/runtime inputs and disposable credentials, never provider keys or production URLs.
  const env: NodeJS.ProcessEnv = { NODE_ENV: "development" };
  for (const [key, value] of Object.entries(process.env)) if (/^(path|systemroot|windir|temp|tmp|userprofile|appdata|localappdata|comspec|pathext|programfiles|programfiles\(x86\)|programdata)$/i.test(key)) env[key] = value;
  Object.assign(env, { NODE_ENV: "development", DATABASE_URL: database.toString(), DIRECT_URL: database.toString(), AUTH_SECRET: randomBytes(32).toString("hex"), AUTH_TRUST_HOST: "true", AUTH_URL: base, NEXT_PUBLIC_SITE_URL: base, TERRAQO_WORKSPACE_INVITATIONS_V1: "true", NEXT_TELEMETRY_DISABLED: "1" });
  Object.assign(env, { TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "false", TERRAQO_LOCAL_S22_TEST: "synthetic-only" });
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: process.cwd(), env, windowsHide: true, stdio: ["ignore", log.fd, log.fd] });
  try {
    let ready = false;
    for (let i = 0; i < 90; i++) {
      if (server.exitCode !== null) throw new Error("Next.js exited before readiness; inspect local log.");
      try { const response = await fetch(`${base}/api/auth/csrf`, { signal: AbortSignal.timeout(10000) }); if (response.ok) { ready = true; break; } } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert.ok(ready, "Local Next.js did not become ready");
    await verifyWorkspaceAdministration(db, base, env);
  } finally {
    if (server.pid && server.exitCode === null) await new Promise<void>(resolve => execFile("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }, () => resolve()));
    await log.close(); await db.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Local authenticated test failed"); process.exitCode = 1; });
