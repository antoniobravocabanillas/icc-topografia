import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import axe from "axe-core";
import { isolateStagingDotenv } from "./lib/staging-dotenv-isolation";

const root = process.cwd();
const origin = "http://127.0.0.1:3218";
const output = resolve(root, "output/playwright/account-access-gate");
const next = resolve(root, "node_modules/next/dist/bin/next");
const results: object[] = [];

async function audit(page: Page, state: string) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const browserAxe = (window as unknown as { axe: typeof axe }).axe;
    const result = await browserAxe.run(".tq-access-panel", {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    });
    return result.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map(n => n.target) }));
  });
  results.push({ state, violations });
  assert.deepEqual(violations, [], `Accessibility violations: ${state}`);
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    clippedButtons: Array.from(document.querySelectorAll<HTMLElement>('.tq-access-card-face[aria-hidden="false"] button'))
      .filter(el => el.scrollHeight > el.clientHeight + 2).map(el => el.textContent),
    unnamedFields: Array.from(document.querySelectorAll<HTMLInputElement>('.tq-access-card-face[aria-hidden="false"] input, .tq-access-card-face[aria-hidden="false"] select'))
      .filter(el => !el.labels?.length && !el.getAttribute("aria-label")).map(el => el.name),
  }));
  assert.deepEqual(layout, { overflow: false, clippedButtons: [], unnamedFields: [] }, `Layout/labels: ${state}`);
  if ((page.viewportSize()?.width ?? 1440) <= 767) {
    const links = await page.locator(".tq-footer-links a").evaluateAll(elements => elements.map(el => {
      const bounds = el.getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom, height: bounds.height };
    }));
    for (let index = 0; index < links.length; index++) {
      assert.ok(links[index].height >= 44, `Footer touch target: ${state}`);
      if (index) assert.ok(links[index].top >= links[index - 1].bottom - 1, `Footer links must remain separate: ${state}`);
    }
  }
}

async function switchMode(page: Page, mode: "register" | "login", reduced: boolean) {
  const visible = page.locator('.tq-access-card-face[aria-hidden="false"]');
  await visible.getByRole("button", { name: mode === "register" ? /Regístrate/ : "Iniciar sesión", exact: mode === "login" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(expected => document.querySelector(".tq-access-panel")?.getAttribute("data-mode") === expected, mode);
  await page.waitForFunction(() => document.activeElement?.hasAttribute("data-access-heading"));
  // The authored flip lasts 460 ms; geometry and snapshots must use its end state.
  await page.waitForTimeout(reduced ? 50 : 500);
  assert.equal(await page.evaluate(() => document.activeElement?.closest('[aria-hidden="true"]') !== null), false);
  if (reduced) {
    assert.equal(await page.locator(".tq-access-rotor").evaluate(el => getComputedStyle(el).transform), "none");
  }
}

async function main() {
  // Refuse other dotenv entry points rather than accidentally loading a real
  // destination. No DB is needed: loopback port 1 is a deliberately dead fixture.
  for (const name of [".env.production", ".env.production.local"]) {
    assert.equal(existsSync(resolve(root, name)), false, `Move ${name} out of this exclusive checkout before the local gate.`);
  }
  mkdirSync(output, { recursive: true });
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production" };
  for (const key of ["PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, {
    NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", AUTH_TRUST_HOST: "true",
    AUTH_SECRET: randomBytes(48).toString("hex"), TERRAQO_OAUTH_ENABLED: "false",
    DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:1/no_database?connect_timeout=1",
    DIRECT_URL: "postgresql://fixture:fixture@127.0.0.1:1/no_database?connect_timeout=1",
    NEXT_PUBLIC_SITE_URL: origin, NEXT_PUBLIC_PORTAL_URL: origin,
    NEXT_PUBLIC_ADMIN_URL: origin, NEXT_PUBLIC_API_URL: origin,
  });
  const restore = isolateStagingDotenv(root);
  let server: ChildProcess | undefined;
  let closed: Promise<void> | undefined;
  let browser: Browser | undefined;
  let log = "";
  const collect = (chunk: Buffer) => { log = (log + chunk.toString()).slice(-5_000_000); };
  try {
    if (process.argv.includes("--build")) {
      const build = spawn(process.execPath, [next, "build"], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      build.stdout?.on("data", collect);
      build.stderr?.on("data", collect);
      const code = await new Promise<number | null>((done, reject) => { build.once("error", reject); build.once("close", done); });
      assert.equal(code, 0, "Isolated Next.js build failed; see server.log.");
    }
    assert.ok(existsSync(resolve(root, ".next/BUILD_ID")), "Build first, or pass --build.");
    server = spawn(process.execPath, [next, "start", "-H", "127.0.0.1", "-p", "3218"], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    closed = new Promise<void>(done => server!.once("close", () => done()));
    server.stdout?.on("data", collect);
    server.stderr?.on("data", collect);
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      assert.equal(server.exitCode, null, "Local server exited before readiness.");
      try { ready = (await fetch(`${origin}/cuenta`, { signal: AbortSignal.timeout(1500) })).ok; } catch {}
      if (ready) break;
      await new Promise(done => setTimeout(done, 500));
    }
    assert.ok(ready, "Local account surface unavailable.");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    let mutations = 0;
    // Block outbound browser traffic and all writes, including server actions.
    // Empty-form validation and passkey validation below must make no requests.
    await context.route("**/*", route => {
      if (route.request().method() !== "GET") { mutations++; return route.abort(); }
      return new URL(route.request().url()).origin === origin ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    for (const motion of ["reduce", "no-preference"] as const) {
      await page.emulateMedia({ reducedMotion: motion });
      for (const width of [1440, 640, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${origin}/cuenta`);
        await page.locator(".tq-access-panel").waitFor();
        assert.equal(await page.locator("header").count(), 1);
        assert.equal(await page.locator("footer").count(), 1);
        await audit(page, `${motion}-${width}-login`);
        await switchMode(page, "register", motion === "reduce");
        const form = page.locator("#terraqo-register-panel");
        await audit(page, `${motion}-${width}-professional`);
        await page.keyboard.press("Tab");
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-pressed")), "true");
        await form.getByLabel("Nombre y apellido", { exact: true }).fill("Lucía Prueba");
        await form.getByRole("button", { name: /Empresa/ }).click();
        assert.equal(await form.getByRole("button", { name: /Empresa/ }).getAttribute("aria-pressed"), "true");
        await audit(page, `${motion}-${width}-company`);
        await form.getByRole("button", { name: /Profesional/ }).click();
        await form.getByLabel("Tipo de identificación", { exact: true }).selectOption("OTHER");
        await audit(page, `${motion}-${width}-other-document`);
        await form.getByLabel("Tipo de identificación", { exact: true }).selectOption("DNI");
        await form.getByRole("button", { name: "Crear cuenta", exact: true }).click();
        assert.equal(await page.evaluate(() => (document.activeElement as HTMLInputElement)?.name), "email");
        await form.locator('[data-access-heading]').focus();
        if ([1440, 390, 320].includes(width)) {
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
          await page.screenshot({ path: resolve(output, `${motion}-${width}-register.png`), fullPage: true });
        }
        await switchMode(page, "login", motion === "reduce");
        await page.keyboard.press("Tab");
        assert.equal(await page.evaluate(() => document.activeElement?.closest("#terraqo-login-panel") !== null), true);
        await switchMode(page, "register", motion === "reduce");
        assert.equal(await form.getByLabel("Nombre y apellido", { exact: true }).inputValue(), "Lucía Prueba");
        await switchMode(page, "login", motion === "reduce");
        if ([1440, 390].includes(width)) {
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
          await page.screenshot({ path: resolve(output, `${motion}-${width}-login.png`), fullPage: true });
        }
      }
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 640, height: 900 });
    await page.goto(`${origin}/cuenta`);
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await audit(page, "text-size-200-login");
    await switchMode(page, "register", true);
    await audit(page, "text-size-200-register");
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({ path: resolve(output, "text-size-200-register.png"), fullPage: true });
    await switchMode(page, "login", true);
    await page.getByRole("button", { name: "Entrar con huella, rostro o PIN" }).click();
    assert.match(await page.locator("#terraqo-login-panel").getByRole("alert").innerText(), /Escribe tu correo/);
    assert.equal(mutations, 0, "The local gate attempted an HTTP mutation.");
    assert.deepEqual(errors, [], "Browser runtime errors.");
  } finally {
    await browser?.close();
    server?.kill();
    await closed;
    restore();
    writeFileSync(resolve(output, "server.log"), log);
    writeFileSync(resolve(output, "report.json"), JSON.stringify(results, null, 2));
  }
  console.log(`PASS: ${results.length} account accessibility states; keyboard, reduced motion, 200% text, labels and native validation. No HTTP writes or DB fixtures. Environment restored.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
