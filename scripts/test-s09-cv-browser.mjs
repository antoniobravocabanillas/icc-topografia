import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const base = "http://127.0.0.1:3199/cv/fixture";
const browser = await chromium.launch();
const results = [];
const media = await readFile(new URL("./fixtures/public-archive/media/nivelacion.webp", import.meta.url));
async function open(scenario, width) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/public/cv/fixture/worklogs/*", route => scenario === "broken" ? route.fulfill({ status: 404 }) : route.fulfill({ contentType: "image/webp", body: media }));
  await page.route("**/avatar.webp", route => route.fulfill({ contentType: "image/webp", body: media }));
  await page.goto(`${base}?scenario=${scenario}`);
  await expect(page.getByTestId("s09-profile")).toBeVisible();
  return { page, errors };
}
async function fits(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "horizontal overflow");
}
try {
  for (const width of [1440, 375, 320]) {
    const { page, errors } = await open("", width);
    await expect(page.getByRole("heading", { name: "Ana Bravo", exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: "Ana Bravo", exact: true })).toHaveText("AB");
    await expect(page.getByRole("link", { name: "Bitácoras", exact: true })).toHaveAttribute("href", "/cv/fixture/evidencias");
    await expect(page.getByTestId("s09-contact")).toHaveAccessibleName("Contactar");
    await expect(page.getByTestId("s09-contact")).toHaveAttribute("href", "/cv/fixture/contacto");
    await expect(page.getByTestId("s09-contact")).toHaveAttribute("data-context-href", "/cv/fixture");
    await expect(page.getByTestId("s09-work-status-work-1")).toHaveText("Declarado");
    await expect(page.getByTestId("s09-work-status-work-2")).toHaveText("Confirmado");
    await expect(page.getByTestId("s09-work-work-1").getByRole("link", { name: "Ver bitácora", exact: true })).toHaveAttribute("href", "/cv/fixture/evidencias/work-1");
    await expect(page.getByRole("link", { name: "Descargar CV" })).toHaveAttribute("href", "/api/terraqo/cv/fixture/pdf");
    await expect(page.getByTestId("s09-availability")).toContainText("Sin declaración fechada");
    await expect(page.getByTestId("s09-availability")).not.toContainText("Disponible para proyectos");
    await expect(page.getByTestId("s09-profile")).not.toContainText("CANARY");
    await expect(page.getByTestId("s09-profile")).not.toContainText("documentos");
    assert(await page.getByRole("img", { name: "Control de niveles en campo", exact: true }).evaluate(img => img.complete && img.naturalWidth > 0));
    await fits(page);
    await page.screenshot({ path: `output/s09-ui-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    results.push(`PASS ${width}: identity, initials, photos, record states, canonical links, contact context, PDF, privacy, no overflow/JS errors`);
    await page.close();
  }
  for (const scenario of ["empty", "no-image", "broken", "photo", "dated", "unavailable", "no-contact", "long"]) {
    const { page, errors } = await open(scenario, 320);
    if (scenario === "empty") {
      await expect(page.getByTestId("s09-empty")).toContainText("todavía no ha compartido trabajos públicos");
      await expect(page.locator('[data-testid^="s09-work-work-"]')).toHaveCount(0);
      await expect(page.getByTestId("s09-contact")).toBeVisible();
      await expect(page.getByTestId("s09-profile")).not.toContainText(/\d+ documentos|\d+ evidencias|\d+ registros/);
      await page.screenshot({ path: "output/s09-empty-320.png", fullPage: true });
    }
    if (scenario === "no-image" || scenario === "broken") await expect(page.getByText("Sin imagen pública", { exact: true })).toHaveCount(2);
    if (scenario === "broken") await expect(page.getByRole("img", { name: "Ana Bravo", exact: true })).toHaveText("AB");
    if (scenario === "photo") assert(await page.getByRole("img", { name: "Ana Bravo", exact: true }).locator("img").evaluate(img => img.complete && img.naturalWidth > 0));
    if (scenario === "dated") await expect(page.getByTestId("s09-availability").locator("time")).toHaveAttribute("datetime", "2026-11-10T15:00:00.000Z");
    if (scenario === "unavailable") await expect(page.getByTestId("s09-availability")).toContainText("No disponible");
    if (scenario === "no-contact") await expect(page.getByTestId("s09-contact")).toHaveCount(0);
    if (scenario === "long") {
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await page.screenshot({ path: "output/s09-large-text-320.png", fullPage: true });
    }
    await fits(page); assert.deepEqual(errors, []); results.push(`PASS ${scenario}`); await page.close();
  }
  const { page } = await open("", 375);
  await page.keyboard.press("Tab");
  assert(await page.evaluate(() => document.activeElement?.tagName === "A"));
  await page.getByTestId("s09-contact").focus();
  assert(await page.getByTestId("s09-contact").evaluate(a => getComputedStyle(a).outlineStyle !== "none"));
  await page.getByRole("link", { name: "Respaldo", exact: true }).click();
  await expect(page).toHaveURL(/#respaldo$/);
  await page.close(); results.push("PASS keyboard focus and in-page Respaldo navigation");
  await writeFile("output/s09-ui-results.txt", results.join("\n") + "\n");
  console.log(results.join("\n"));
} finally { await browser.close(); }
