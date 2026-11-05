import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { chromium, type BrowserContext } from "playwright";
import { assertWorkspaceAdministrationTestTarget } from "./lib/workspace-administration-test-target";

/** Same browser contract runs locally and on the explicitly isolated staging target. */
export async function verifyWorkspaceAdministration(db: PrismaClient, base: string, env: Record<string, string | undefined> = process.env) {
  assertWorkspaceAdministrationTestTarget(env, base);
  const suffix = randomUUID();
  const workspaceId = `s22gate-${suffix}`;
  const otherWorkspaceId = `s22gate-other-${suffix}`;
  const workspaceIds = [workspaceId, otherWorkspaceId];
  const userIds = ["owner", "recipient", "staff"].map(role => `s22gate-${role}-${suffix}`);
  const out = path.resolve("output/s22/authenticated", suffix);
  await mkdir(out, { recursive: true });
  // Persist exact ownership before any write; no credentials enter this manifest.
  await writeFile(path.join(out, "fixtures.json"), JSON.stringify({ workspaceIds, userIds }));
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let phase = "fixtures";
  try {
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);
  const workspace = await db.terraqoWorkspace.create({ data: { id: workspaceId, slug: `s22-browser-${suffix}`, name: "S22 · Empresa de prueba" } });
  await db.terraqoWorkspace.create({ data: { id: otherWorkspaceId, slug: `s22-other-${suffix}`, name: "S22 isolated peer" } });
  const owner = await db.user.create({ data: { id: userIds[0], email: `owner-${suffix}@s22.invalid`, name: "Administrador de prueba", role: "ADMIN", passwordHash, emailVerified: new Date() } });
  const recipient = await db.user.create({ data: { id: userIds[1], email: `recipient-${suffix}@s22.invalid`, name: "Profesional de prueba", passwordHash, emailVerified: new Date() } });
  const staff = await db.user.create({ data: { id: userIds[2], email: `staff-${suffix}@s22.invalid`, name: "Miembro de prueba", passwordHash, emailVerified: new Date() } });
  await db.terraqoWorkspaceMember.createMany({ data: [{ workspaceId: workspace.id, userId: owner.id, role: "OWNER" }, { workspaceId: workspace.id, userId: staff.id, role: "MEMBER" }] });
    phase = "browser-launch";
    browser = await chromium.launch({ headless: true });
    const browserErrors: string[] = [];
    let revokingOwner = false;
    async function context() {
      const ctx = await browser!.newContext({ baseURL: base, viewport: { width: 1440, height: 1100 } });
      await ctx.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      ctx.on("page", page => {
        page.on("pageerror", error => browserErrors.push(error.message.split("\n")[0].slice(0, 180)));
        page.on("console", message => {
          if (message.type() !== "error") return;
          // HTTP/2 has no reason phrase: Netlify emits "403 ()". Match only
          // the intentionally revoked polling resource, never every 403.
          const resource = message.location().url;
          const expectedRevocation = revokingOwner && resource === `${base}/api/admin/notifications/pulse` &&
            /^Failed to load resource: the server responded with a status of 403 \((?:Forbidden)?\)$/.test(message.text());
          if (!expectedRevocation) browserErrors.push(message.text().includes("hydrated") ? message.text() : message.text().split("\n")[0].slice(0, 180));
        });
      });
      return ctx;
    }
    async function login(ctx: BrowserContext, email: string) {
      phase = "credential-session";
      const csrf = await (await ctx.request.get("/api/auth/csrf")).json();
      await ctx.request.post("/api/auth/callback/credentials", { headers: { "X-Auth-Return-Redirect": "1", Origin: base }, form: { csrfToken: csrf.csrfToken, email, password, callbackUrl: `${base}/admin/workspace/miembros` } });
      const session = await (await ctx.request.get("/api/auth/session")).json();
      assert.equal(session.user.email, email, "Auth.js must issue a real session");
    }
    const anonymous = await context();
    assert.equal((await anonymous.request.get(`/api/terraqo/workspace-invitations?workspaceId=${workspace.id}`)).status(), 401);
    const admin = await context(); await login(admin, owner.email!);
    const endpoint = "/api/terraqo/workspace-invitations";
    const post = (ctx: BrowserContext, data: unknown) => ctx.request.post(endpoint, { headers: { Origin: base }, data });
    assert.equal((await admin.request.get(`${endpoint}?workspaceId=${otherWorkspaceId}`)).status(), 403);
    assert.equal((await post(admin, { action: "create", workspaceId: otherWorkspaceId, email: recipient.email, operationKey: randomUUID() })).status(), 403);
    const create = { action: "create", workspaceId, email: staff.email, role: "VIEWER", operationKey: randomUUID() };
    phase = "invitation-api";
    const createdResponse = await post(admin, create);
    assert.equal(createdResponse.status(), 201);
    assert.match(createdResponse.headers()["cache-control"], /no-store/);
    const created = await createdResponse.json();
    const replay = await post(admin, create);
    assert.equal(replay.status(), 200);
    assert.deepEqual(await replay.json(), { id: created.id, token: null, replayed: true });
    const recipientContext = await context(); await login(recipientContext, recipient.email!);
    assert.equal((await post(recipientContext, { action: "accept", token: created.token })).status(), 404);
    assert.equal((await post(admin, { action: "rotate", workspaceId, invitationId: created.id })).status(), 429);
    // Advance only this owned fixture's issuance time; never wait or edit an existing invitation.
    await db.terraqoWorkspaceInvitation.update({ where: { id: created.id }, data: { lastIssuedAt: new Date(Date.now() - 61000) } });
    const rotatedResponse = await post(admin, { action: "rotate", workspaceId, invitationId: created.id });
    assert.equal(rotatedResponse.status(), 200);
    const rotated = await rotatedResponse.json();
    const staffContext = await context(); await login(staffContext, staff.email!);
    assert.equal((await post(staffContext, { action: "accept", token: created.token })).status(), 404);
    const listing = await (await admin.request.get(`${endpoint}?workspaceId=${workspaceId}`)).json();
    for (const item of listing.invitations) for (const key of ["token", "tokenHash", "operationFingerprint", "operationKey"]) assert.ok(!(key in item));
    assert.equal((await post(admin, { action: "cancel", workspaceId, invitationId: created.id })).status(), 200);
    assert.equal((await post(staffContext, { action: "accept", token: rotated.token })).status(), 404);
    const page = await admin.newPage(); page.setDefaultTimeout(60000);
    phase = "member-page";
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
    phase = "invitation-link";
    await page.getByRole("button", { name: "Crear enlace de invitación" }).click();
    const link = page.getByLabel("Enlace privado"); await link.waitFor();
    const privateLink = await link.inputValue();
    assert.equal(new URL(privateLink).origin, base);
    // Clear the rendered credential before saving evidence screenshots.
    await page.reload(); await page.getByRole("heading", { name: "Equipo del workspace" }).waitFor();
    await page.screenshot({ path: path.join(out, "members-desktop.png"), fullPage: true, caret: "initial" });
    const acceptPage = await recipientContext.newPage(); acceptPage.setDefaultTimeout(60000);
    phase = "recipient-acceptance";
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
    phase = "revoked-authority";
    page.on("request", request => { if (new URL(request.url()).pathname === "/api/admin/notifications/pulse") pulseRequests++; });
    const lostAccessPulse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/admin/notifications/pulse" && response.status() === 403);
    revokingOwner = true;
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
    assert.deepEqual(browserErrors, [], "No hydration/runtime/server errors; only expected access-revocation 403 is allowed");
    console.log("PASS authenticated Next.js + PostgreSQL + Chromium: real Auth.js credential sessions, anonymous 401, member-role UI persisted, invitation UI and verified recipient acceptance, viewer forbidden, revoked authority rejected with existing cookie, desktop/mobile. Synthetic data only; no external requests allowed in browser.");
  } catch (error) {
    const location = error instanceof Error ? error.stack?.match(/test-workspace-administration-authenticated\.ts:\d+:\d+/)?.[0] : undefined;
    console.error(JSON.stringify({ s22Step: phase, errorType: error instanceof Error && /^[A-Za-z]+$/.test(error.name) ? error.name : "UnknownError", location }));
    throw error;
  } finally {
    try { await browser?.close(); } finally {
      // Exact random IDs only; never delete by a prefix or an existing customer workspace.
      await db.$transaction(async tx => {
        await tx.activityLog.deleteMany({ where: { actorId: { in: userIds } } });
        await tx.terraqoWorkspaceInvitation.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
        await tx.terraqoWorkspaceMember.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
        await tx.terraqoWorkspace.deleteMany({ where: { id: { in: workspaceIds } } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      });
      assert.equal(await db.terraqoWorkspace.count({ where: { id: { in: workspaceIds } } }), 0);
      assert.equal(await db.user.count({ where: { id: { in: userIds } } }), 0);
      assert.equal(await db.terraqoWorkspaceInvitation.count({ where: { workspaceId: { in: workspaceIds } } }), 0);
      assert.equal(await db.terraqoWorkspaceMember.count({ where: { workspaceId: { in: workspaceIds } } }), 0);
      assert.equal(await db.activityLog.count({ where: { actorId: { in: userIds } } }), 0);
      await writeFile(path.join(out, "cleanup.json"), JSON.stringify({ workspaceIds, userIds, remaining: 0 }));
      console.log("PASS S22 exact-fixture cleanup and zero-row readback.");
    }
  }
}
