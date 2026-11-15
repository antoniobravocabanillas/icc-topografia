import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";

const origin = process.env.ARCHIVE_FIXTURE_ORIGIN || "http://localhost:3190";
await mkdir("output/playwright", { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of [1440, 375, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (/hydration|hydrated/i.test(message.text())) errors.push(message.text()); });
    await page.route("**/fonts/satoshi/*.woff2", async route => {
      const name = new URL(route.request().url()).pathname.split("/").pop();
      await route.fulfill({ contentType: "font/woff2", body: await readFile(new URL(`../public/fonts/satoshi/${name}`, import.meta.url)) });
    });
    await page.route("**/brand/terraqo-3/logo-horizontal-dark-transparent.svg", async route => route.fulfill({ contentType: "image/svg+xml", body: await readFile(new URL("../public/brand/terraqo-3/logo-horizontal-dark-transparent.svg", import.meta.url)) }));
    await page.route("**/api/public/cv/fixture/worklogs/fixture-*", async route => route.fulfill({ contentType: "image/webp", body: await readFile(new URL("fixtures/public-archive/media/nivelacion.webp", import.meta.url)) }));
    const response = await page.goto(`${origin}/s11-mapping`);
    assert.equal(response.status(), 200);
    const html = await response.text();
    assert.equal(html.includes("SECRET_"), false, "Sensitive fields must be absent from HTML and serialized RSC props");
    await expect(page.getByRole("heading", { name: "Control de niveles autorizado", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Autor de prueba", exact: true })).toBeVisible();
    await expect(page.getByText(/Trabajo: 27 OCT 2026/)).toBeVisible();
    await expect(page.getByText(/Registrado el 28 de octubre de 2026/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Galería de evidencias" })).toHaveCount(1);
    await page.getByRole("button", { name: "Ver evidencia 2", exact: true }).click();
    await expect(page.getByRole("button", { name: "Ver evidencia 2", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: "Galería de evidencias" }).getByRole("img", { name: "Control de niveles autorizado, evidencia 2", exact: true })).toBeVisible();
    await expect(page.getByText("Contribución", { exact: true })).toBeVisible();
    await expect(page.getByText("Contexto", { exact: true })).toBeVisible();
    await expect(page.getByText("Resultado declarado", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Compartir registro" }).click();
    await expect(page.getByRole("button", { name: "Enlace copiado" })).toBeVisible();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${origin}/cv/fixture/evidencias/mapping`);
    await page.getByRole("tab", { name: "Respaldo", exact: true }).click();
    await expect(page.getByText("Validador público", { exact: true })).toBeVisible();
    await expect(page.getByText("No disponible para este respaldo heredado", { exact: true })).toHaveCount(2);
    await page.getByRole("tab", { name: "Respaldo", exact: true }).press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Historial", exact: true })).toBeFocused();
    await expect(page.getByRole("heading", { name: "Historial público", exact: true })).toBeVisible();
    await expect(page.getByText(/Registro creado el 28 de octubre de 2026/)).toBeVisible();
    await page.getByRole("tab", { name: "Historial", exact: true }).press("Home");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({ path: `output/playwright/s11-detail-${width}.png`, fullPage: true });
    if (width === 320) {
      await page.addStyleTag({ content: "html { font-size: 200%; }" });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Large text must reflow");
    }
    await page.goto(`${origin}/cv/fixture/evidencias#offpage`);
    await expect(page).toHaveURL(`${origin}/cv/fixture/evidencias/offpage`);
    await expect(page.getByRole("heading", { name: "Levantamiento de campo — prueba", exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS S11 ${width}px: minimized serialized DTO, author/dates, single gallery, legacy endorsement labels, keyboard tabs, canonical sharing and legacy anchor.`);
  }
} finally { await browser.close(); }
