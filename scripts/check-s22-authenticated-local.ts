import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, open, readdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { chromium, type BrowserContext } from "playwright";

async function main() {
  const database = new URL(process.env.DATABASE_URL || "");
  assert.equal(database.hostname, "127.0.0.1");
  assert.equal(database.username, "terraqo_s22_test");
  assert.equal(process.env.TERRAQO_LOCAL_S22_TEST, "synthetic-only");
  for (const file of await readdir(process.cwd())) assert.ok(!/^\.env(?:\.(?:local|development|production|test)(?:\.local)?)?$/.test(file), "Refusing automatic env-file loading");
  const db = new PrismaClient();
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);
  const workspace = await db.terraqoWorkspace.create({ data: { slug: "s22-browser", name: "S22 · Empresa de prueba" } });
  const owner = await db.user.create({ data: { email: "browser-owner@s22.invalid", name: "Administrador de prueba", role: "ADMIN", passwordHash, emailVerified: new Date() } });
  const recipient = await db.user.create({ data: { email: "browser-recipient@s22.invalid", name: "Profesional de prueba", passwordHash, emailVerified: new Date() } });
  const staff = await db.user.create({ data: { email: "browser-staff@s22.invalid", name: "Miembro de prueba", passwordHash, emailVerified: new Date() } });
  await db.terraqoWorkspaceMember.createMany({ data: [{ workspaceId: workspace.id, userId: owner.id, role: "OWNER" }, { workspaceId: workspace.id, userId: staff.id, role: "MEMBER" }] });
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
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: process.cwd(), env, windowsHide: true, stdio: ["ignore", log.fd, log.fd] });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    let ready = false;
    for (let i = 0; i < 90; i++) {
      if (server.exitCode !== null) throw new Error("Next.js exited before readiness; inspect local log.");
      try { const response = await fetch(`${base}/api/auth/csrf`, { signal: AbortSignal.timeout(10000) }); if (response.ok) { ready = true; break; } } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert.ok(ready, "Local Next.js did not become ready");
    browser = await chromium.launch({ headless: true });
    const browserErrors: string[] = [];
    async function context() {
      const ctx = await browser!.newContext({ baseURL: base, viewport: { width: 1440, height: 1100 } });
      await ctx.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      ctx.on("page", page => {
        page.on("pageerror", error => browserErrors.push(error.message.split("\n")[0].slice(0, 180)));
        page.on("console", message => { if (message.type() === "error") browserErrors.push(message.text().includes("hydrated") ? message.text() : message.text().split("\n")[0].slice(0, 180)); });
      });
      return ctx;
    }
    async function login(ctx: BrowserContext, email: string) {
      const csrf = await (await ctx.request.get("/api/auth/csrf")).json();
      await ctx.request.post("/api/auth/callback/credentials", { headers: { "X-Auth-Return-Redirect": "1", Origin: base }, form: { csrfToken: csrf.csrfToken, email, password, callbackUrl: `${base}/admin/workspace/miembros` } });
      const session = await (await ctx.request.get("/api/auth/session")).json();
      assert.equal(session.user.email, email, "Auth.js must issue a real session");
    }
    const anonymous = await context();
    assert.equal((await anonymous.request.get(`/api/terraqo/workspace-invitations?workspaceId=${workspace.id}`)).status(), 401);
    const admin = await context(); await login(admin, owner.email!);
    const page = await admin.newPage(); page.setDefaultTimeout(60000);
    await page.goto(`${base}/admin/workspace/miembros`, { timeout: 120000 });
    await page.getByRole("heading", { name: "Equipo del workspace" }).waitFor();
    await page.getByRole("button", { name: "Gestionar acceso", exact: true }).click();
    await page.getByLabel("Rol de Miembro de prueba").selectOption("VIEWER");
    const saving = page.waitForResponse(response => response.url().endsWith("/api/terraqo/workspace-members") && response.request().method() === "PATCH");
    await page.getByRole("button", { name: "Confirmar cambio", exact: true }).click();
    const savedResponse = await saving;
    assert.equal(savedResponse.status(), 200, (await savedResponse.json()).error || "Member update must succeed");
    await page.getByText("Acceso actualizado.", { exact: true }).waitFor();
    assert.equal((await db.terraqoWorkspaceMember.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: workspace.id, userId: staff.id } } })).role, "VIEWER");
    await page.getByLabel("Correo electrónico", { exact: true }).fill(recipient.email!);
    await page.getByRole("button", { name: "Crear enlace de invitación" }).click();
    const link = page.getByLabel("Enlace privado"); await link.waitFor();
    const privateLink = await link.inputValue();
    assert.equal(new URL(privateLink).origin, base);
    // Clear the rendered credential before saving evidence screenshots.
    await page.reload(); await page.getByRole("heading", { name: "Equipo del workspace" }).waitFor();
    await page.screenshot({ path: path.join(out, "members-desktop.png"), fullPage: true, caret: "initial" });
    const recipientContext = await context(); await login(recipientContext, recipient.email!);
    const acceptPage = await recipientContext.newPage(); acceptPage.setDefaultTimeout(60000);
    await acceptPage.goto(privateLink, { timeout: 120000 });
    await acceptPage.getByRole("button", { name: "Aceptar invitación", exact: true }).click();
    await acceptPage.getByRole("heading", { name: "Invitación aceptada" }).waitFor();
    assert.equal(new URL(acceptPage.url()).hash, "");
    const accepted = await db.terraqoWorkspaceMember.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: workspace.id, userId: recipient.id } } });
    assert.equal(accepted.role, "VIEWER");
    assert.equal((await recipientContext.request.get(`/api/terraqo/workspace-invitations?workspaceId=${workspace.id}`)).status(), 403);
    await page.reload(); await page.getByRole("heading", { name: "Equipo del workspace" }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(out, "members-mobile.png"), fullPage: true, caret: "initial" });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Mobile must not overflow");
    // A valid session cookie must not preserve revoked workspace authority.
    let pulseRequests = 0;
    page.on("request", request => { if (new URL(request.url()).pathname === "/api/admin/notifications/pulse") pulseRequests++; });
    const lostAccessPulse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/admin/notifications/pulse" && response.status() === 403);
    await db.terraqoWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId: workspace.id, userId: owner.id } }, data: { active: false } });
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await lostAccessPulse;
    await page.waitForTimeout(250); // Let React disable the polling effect after the response.
    const stoppedAt = pulseRequests;
    await page.waitForTimeout(9000); // Exceeds both active and idle polling intervals.
    assert.equal(pulseRequests, stoppedAt, "Polling must stop after membership revocation");
    assert.equal((await admin.request.get("/api/admin/notifications/pulse")).status(), 403, "Notification polling must report lost access rather than a server failure");
    assert.equal((await admin.request.get(`/api/terraqo/workspace-invitations?workspaceId=${workspace.id}`)).status(), 403);
    assert.equal((await admin.request.patch("/api/terraqo/workspace-members", { headers: { Origin: base }, data: { workspaceId: workspace.id, memberId: accepted.id, role: "MEMBER", active: true, expectedUpdatedAt: accepted.updatedAt.toISOString() } })).status(), 403);
    assert.deepEqual(browserErrors.filter(message => !message.includes("status of 403 (Forbidden)")), [], "No hydration/runtime/server errors; only expected access-revocation 403 is allowed");
    console.log("PASS authenticated local Next.js + PostgreSQL + Chromium: real Auth.js credential sessions, anonymous 401, member-role UI persisted, invitation UI and verified recipient acceptance, viewer forbidden, revoked authority rejected with existing cookie, desktop/mobile. Synthetic data only; no external requests allowed in browser.");
  } finally {
    await browser?.close();
    if (server.pid && server.exitCode === null) await new Promise<void>(resolve => execFile("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }, () => resolve()));
    await log.close(); await db.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Local authenticated test failed"); process.exitCode = 1; });
