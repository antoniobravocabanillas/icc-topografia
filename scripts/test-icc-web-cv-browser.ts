import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { prisma } from "../lib/prisma";

// Standalone browser verifier, not a production route or a test-account bypass.
// Credentials remain in memory. The browser's portal requests go exclusively
// to this owned Next process; no production page is modified or intercepted.
const origin = "https://portal.terraqoglobal.com", local = "http://127.0.0.1:3876";
const path = "/cuenta/publicacion-cv?workspaceSlug=icc-topografia";
let phase = "setup";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  assert.ok(process.env.AUTH_SECRET);
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({ where: {
    slug: "icc-topografia", active: true, deletedAt: null, companies: { some: { document: "20616116313", deletedAt: null } },
  }, select: { id: true } });
  if (process.argv.includes("--cleanup-aborted")) {
    const abandoned = await prisma.user.findMany({ where: { name: "Fixture privado CV browser", email: { endsWith: "@example.test" },
      createdAt: { gte: new Date("2026-10-07T17:04:08.101Z") }, terraqoProfessionalProfile: { username: { startsWith: "cv-browser-" } },
      terraqoMemberships: { some: { workspaceId: workspace.id, role: "PROFESSIONAL" } } }, select: { id: true } });
    for (const { id } of abandoned) {
      await prisma.verificationToken.deleteMany({ where: { identifier: `web-cv-session:${id}` } });
      await prisma.activityLog.deleteMany({ where: { actorId: id, terraqoWorkspaceId: workspace.id, entityType: "CvPublication" } });
      await prisma.user.delete({ where: { id } });
    }
    console.log(`CLEANUP ${abandoned.length} exclusively owned aborted browser fixtures, with grants revoked first.`); return;
  }
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3876"], {
    env: { ...process.env, NODE_ENV: "production", AUTH_TRUST_HOST: "true", AUTH_URL: origin,
      NEXTAUTH_URL: origin, TERRAQO_WEB_CV_PUBLICATION_ENABLED: "true" }, stdio: "ignore", windowsHide: true,
  });
  let browser: Browser | undefined;
  const ownUsers: string[] = [];
  try {
    browser = await chromium.launch({ headless: true });
    for (let attempt = 0; attempt < 60; attempt++) {
      try { if ((await fetch(local + "/api/health")).ok) break; } catch { /* owned process warming */ }
      if (attempt === 59) throw Error("owned server unavailable");
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    await mkdir("output/playwright/web-cv-authenticated", { recursive: true });
    for (const viewport of [{ width: 390, height: 844 }, { width: 1024, height: 900 }]) {
      phase = `fixture-${viewport.width}`;
      const password = randomBytes(24).toString("hex"), email = `${randomUUID()}@example.test`;
      const user = await prisma.user.create({ data: {
        email, name: "Fixture privado CV browser", role: "CUSTOMER", emailVerified: new Date(), passwordHash: await bcrypt.hash(password, 12),
        terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } },
        terraqoProfessionalProfile: { create: { username: `cv-browser-${randomBytes(5).toString("hex")}`, liveCvEnabled: false,
          experiences: { create: { title: "Entrada propia privada", visibility: "PRIVATE" } } } },
      }, select: { id: true, terraqoProfessionalProfile: { select: { id: true } } } });
      ownUsers.push(user.id);
      const profileId = user.terraqoProfessionalProfile!.id;
      const count = () => prisma.terraqoCvPublicationOperation.count({ where: { professionalProfileId: profileId } });
      const current = () => prisma.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: profileId }, select: {
        liveCvEnabled: true, experiences: { select: { visibility: true } },
      } });
      const context = await browser.newContext({ viewport });
      let failPost = false; const bodies: string[] = []; let gets = 0;
      await context.route(origin + "/**", async route => {
        try {
        const request = route.request(), url = new URL(request.url());
        if (url.pathname === "/api/terraqo/cv-publication") {
          if (request.method() === "POST") {
            bodies.push(request.postData()!);
            if (failPost) { await route.abort("connectionfailed"); return; }
          } else gets++;
        }
        const started = Date.now();
        const response = await route.fetch({ url: local + url.pathname + url.search,
          headers: { ...request.headers(), host: new URL(origin).host }, maxRedirects: 0 });
        if (url.pathname === "/api/auth/session" || url.pathname === "/api/terraqo/cv-publication" || url.pathname === "/cuenta/publicacion-cv")
          console.log(JSON.stringify({ phase, route: url.pathname, method: request.method(), status: response.status() }));
        if (url.pathname === "/api/auth/session") {
          const value = await response.json();
          console.log(JSON.stringify({ phase, sessionOwnerMatches: value?.user?.id === user.id,
            contentType: response.headers()["content-type"], durationMs: Date.now() - started }));
        }
        const deliveredHeaders = { ...response.headers() };
        // APIResponse.body() is decoded. Forwarding its compression/length
        // headers would make Chromium decode the already-decoded body again.
        delete deliveredHeaders["content-encoding"]; delete deliveredHeaders["content-length"];
        await route.fulfill({ response, headers: deliveredHeaders, body: await response.body() });
        } catch {
          // Playwright errors can include complete request headers. Never let
          // a rejected interception promise print cookies or interrupt cleanup.
          await route.abort("failed").catch(() => undefined);
        }
      });
      try {
        await login(context, email, password);
        assert.equal(await prisma.verificationToken.count({ where: { identifier: `web-cv-session:${user.id}` } }), 1);
        const page = await context.newPage();
        page.on("pageerror", error => console.log(JSON.stringify({ phase, browserErrorType: error.name,
          illegalInvocation: error.message.includes("Illegal invocation") })));
        page.on("requestfailed", request => console.log(JSON.stringify({ phase, failedRoute: new URL(request.url()).pathname,
          failure: request.failure()?.errorText?.replace(/[^A-Z_a-z0-9:]/g, "").slice(0, 80) })));
        phase = `consent-cancel-${viewport.width}`;
        await page.goto(origin + "/api/health");
        await page.goto(origin + path + `&document=${randomUUID()}`);
        if (await page.getByRole("button", { name: "Comprobar sesión", exact: true }).isVisible())
          await page.getByRole("button", { name: "Comprobar sesión", exact: true }).click();
        await page.getByText("CV sin publicar", { exact: true }).waitFor();
        assert.equal(await page.getByRole("button", { name: "Revisar publicación", exact: true }).isDisabled(), true);
        await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "Revisar publicación", exact: true }).click();
        await page.getByRole("button", { name: "Cancelar", exact: true }).click();
        assert.equal(await page.getByRole("checkbox").isChecked(), false); assert.equal(await count(), 0);
        await page.screenshot({ path: `output/playwright/web-cv-authenticated/withdrawn-${viewport.width}.png`, fullPage: true });
        phase = `uncertain-reconcile-${viewport.width}`;
        await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "Revisar publicación", exact: true }).click();
        failPost = true;
        await page.getByRole("button", { name: "Confirmar publicación", exact: true }).click();
        phase = `uncertain-alert-${viewport.width}`;
        await page.getByText("La solicitud puede haberse recibido.", { exact: true }).waitFor();
        const before = gets;
        phase = `uncertain-query-${viewport.width}`;
        await Promise.all([page.waitForResponse(response => new URL(response.url()).pathname === "/api/terraqo/cv-publication" &&
          new URL(response.url()).searchParams.has("operationKey")), page.getByRole("button", { name: "Consultar recibo", exact: true }).click()]);
        await page.getByRole("button", { name: "Reenviar misma solicitud", exact: true }).waitFor({ state: "visible" });
        await waitEnabled(page, "Reenviar misma solicitud");
        assert.ok(gets > before); assert.equal(bodies.length, 1); assert.equal(await count(), 0);
        await page.screenshot({ path: `output/playwright/web-cv-authenticated/uncertain-${viewport.width}.png`, fullPage: true });
        phase = `back-cancel-${viewport.width}`;
        const pendingUrl = page.url();
        page.once("dialog", dialog => { assert.equal(dialog.type(), "beforeunload"); void dialog.dismiss(); });
        await page.evaluate(() => history.back());
        await page.getByText("La solicitud puede haberse recibido.", { exact: true }).waitFor();
        assert.equal(page.url(), pendingUrl); assert.equal(bodies.length, 1);
        page.once("dialog", dialog => { assert.equal(dialog.type(), "confirm"); void dialog.dismiss(); });
        await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
        await page.getByText("La solicitud puede haberse recibido.", { exact: true }).waitFor();
        failPost = false;
        await page.getByRole("button", { name: "Reenviar misma solicitud", exact: true }).click();
        await page.getByText("CV publicado", { exact: true }).waitFor();
        assert.equal(bodies.length, 2); assert.equal(bodies[0], bodies[1]); assert.equal(await count(), 1);
        assert.equal((await current()).experiences[0].visibility, "PRIVATE");
        phase = `withdraw-${viewport.width}`;
        await page.getByRole("button", { name: "Retirar publicación", exact: true }).click();
        await page.getByRole("button", { name: "Confirmar retiro", exact: true }).click();
        await page.getByText("CV sin publicar", { exact: true }).waitFor();
        assert.equal(await count(), 2); assert.equal((await current()).liveCvEnabled, false);
        assert.equal((await current()).experiences[0].visibility, "PRIVATE");
        const historical = await page.evaluate(async ({ key, owner }) => {
          const response = await fetch(`/api/terraqo/cv-publication?workspaceSlug=icc-topografia&operationKey=${key}`, {
            headers: { "x-terraqo-cv-owner": owner }, cache: "no-store", redirect: "error" });
          return (await response.json()).data;
        }, { key: JSON.parse(bodies[0]).operationKey as string, owner: user.id });
        assert.equal(historical.current.published, false); assert.equal(historical.receipt.published, true); assert.equal(await count(), 2);
        assert.equal(await prisma.activityLog.count({ where: { actorId: user.id, entityType: "CvPublication" } }), 2);
        await page.screenshot({ path: `output/playwright/web-cv-authenticated/retired-${viewport.width}.png`, fullPage: true });
        phase = `back-forward-${viewport.width}`;
        await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "Revisar publicación", exact: true }).click();
        failPost = true;
        await page.getByRole("button", { name: "Confirmar publicación", exact: true }).click();
        await page.getByText("La solicitud puede haberse recibido.", { exact: true }).waitFor();
        await waitEnabled(page, "Consultar recibo");
        assert.equal(bodies.length, 4); assert.equal(await count(), 2);
        page.once("dialog", dialog => { assert.equal(dialog.type(), "beforeunload"); void dialog.accept(); });
        await page.goBack({ waitUntil: "commit" });
        await page.waitForURL(origin + "/api/health");
        failPost = false;
        await page.goForward({ waitUntil: "domcontentloaded" });
        await page.getByText("CV sin publicar", { exact: true }).waitFor();
        assert.equal(await page.getByText("La solicitud puede haberse recibido.", { exact: true }).count(), 0);
        assert.equal(bodies.length, 4); assert.equal(await count(), 2);
        phase = `changed-account-${viewport.width}`;
        const secondPassword = randomBytes(24).toString("hex"), secondEmail = `${randomUUID()}@example.test`;
        const second = await prisma.user.create({ data: {
          email: secondEmail, name: "Fixture privado CV browser", role: "CUSTOMER", emailVerified: new Date(), passwordHash: await bcrypt.hash(secondPassword, 12),
          terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } },
          terraqoProfessionalProfile: { create: { username: `cv-browser-${randomBytes(5).toString("hex")}`, liveCvEnabled: false } },
        }, select: { id: true } });
        ownUsers.push(second.id);
        await login(context, secondEmail, secondPassword);
        await page.evaluate(fakeOwner => {
          const channel = new BroadcastChannel("next-auth"); channel.postMessage({ event: "session", data: { user: { id: fakeOwner } } }); channel.close();
        }, user.id);
        await page.getByText(/Tu sesión cambió\. Vuelve a iniciar sesión/).waitFor();
        assert.equal(await page.getByRole("checkbox").count(), 0); assert.equal(bodies.length, 4); assert.equal(await count(), 2);
        const mismatchedStatus = await page.evaluate(async owner => (await fetch("/api/terraqo/cv-publication?workspaceSlug=icc-topografia", {
          headers: { "x-terraqo-cv-owner": owner }, cache: "no-store", redirect: "error" })).status, user.id);
        assert.equal(mismatchedStatus, 401);
        phase = `logout-${viewport.width}`;
        await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
        await page.waitForURL(origin + "/cuenta");
        assert.equal(await prisma.verificationToken.count({ where: { identifier: `web-cv-session:${second.id}` } }), 0);
        assert.equal(await prisma.verificationToken.count({ where: { identifier: `web-cv-session:${user.id}` } }), 1);
        await page.goBack({ waitUntil: "domcontentloaded" });
        await page.waitForURL(url => url.origin === origin && url.pathname === "/cuenta");
        assert.equal(bodies.length, 4); assert.equal(await count(), 2);
      } catch (error) {
        const page = context.pages()[0];
        if (page) await page.screenshot({ path: `output/playwright/web-cv-authenticated/failure-${viewport.width}.png`, fullPage: true }).catch(() => undefined);
        console.error(JSON.stringify({ phase, errorType: error instanceof Error ? error.name : "unknown",
          strictLocator: error instanceof Error && error.message.includes("strict mode violation") }));
        throw error;
      } finally { await context.unrouteAll({ behavior: "ignoreErrors" }); await context.close(); }
    }
    console.log("PASS local production Next/Auth.js/browser + real SQL in both sizes: consent/cancel, uncertain GET-null, identical resend/single operation, withdrawal/history/PRIVATE, native back/forward, changed cookie owner despite spoofed broadcast, exact logout and no replay after return. Captures require visual review.");
  } finally {
    await browser?.close().catch(() => undefined); server.kill();
    for (const id of ownUsers) {
      await prisma.activityLog.deleteMany({ where: { actorId: id, terraqoWorkspaceId: workspace.id, entityType: "CvPublication" } });
      await prisma.verificationToken.deleteMany({ where: { identifier: `web-cv-session:${id}` } });
      await prisma.user.delete({ where: { id } });
    }
    console.log("CLEANUP own browser/users/profiles/memberships/operations/audits/grants and local Next process.");
  }
}
async function waitEnabled(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  for (let attempt = 0; attempt < 1000; attempt++) {
    if (!(await button.isDisabled())) return;
    await page.waitForTimeout(30);
  }
  throw Error("Control did not settle.");
}
async function login(context: BrowserContext, email: string, password: string) {
  const jar = new Map<string, string>();
  const send = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(local + path, { ...init, redirect: "manual", headers: {
      host: new URL(origin).host, origin, cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "), ...init.headers,
    } });
    for (const item of response.headers.getSetCookie()) {
      const pair = item.split(";", 1)[0], index = pair.indexOf("=");
      if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  };
  const csrf = await (await send("/api/auth/csrf")).json();
  const response = await send("/api/auth/callback/credentials", { method: "POST", headers: {
    "content-type": "application/x-www-form-urlencoded", "x-auth-return-redirect": "1",
  }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, callbackUrl: origin + path }) });
  assert.equal(response.status, 200); await response.body?.cancel();
  assert.ok([...jar.keys()].some(key => key.startsWith("__Secure-authjs.session-token")));
  await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: origin, secure: true, httpOnly: true, sameSite: "Lax" as const })));
  jar.clear();
}
main().catch(() => { console.error(`Web CV browser failed at ${phase}; private diagnostics suppressed.`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
