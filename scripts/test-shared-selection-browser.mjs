import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const origin = "http://localhost:3190";
const browser = await chromium.launch();
try {
  for (const width of [1440, 375, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (/hydrated|hydration/i.test(message.text())) errors.push(message.text()); });
    await page.route("**/fixture-*.svg*", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#254256"/><text x="60" y="100" font-size="32" fill="white">Imagen de prueba</text></svg>' }));
    await page.goto(`${origin}/selecciones/public`);
    await expect(page.getByRole("heading", { name: "Selección de prueba", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver detalle", exact: true })).toHaveCount(2);
    await expect(page.getByText(/^27 oct\.? 2026$/)).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `output/selection-list-${width}.png`, fullPage: true });
    await page.getByRole("link", { name: "Ver detalle", exact: true }).first().click();
    await expect(page).toHaveURL(/registro=1$/);
    await expect(page.getByRole("heading", { name: "Control de niveles", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Descargar imagen autorizada" })).toHaveCount(0);
    await page.getByRole("button", { name: "Ver imagen 2", exact: true }).click();
    await expect(page.getByRole("img", { name: "Evidencia autorizada 2" })).toHaveAttribute("src", "/fixture-2.svg");
    await expect(page.getByRole("heading", { name: "Responsabilidades", exact: true })).toBeVisible();
    await expect(page.locator("dialog")).toHaveCount(0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `output/selection-detail-${width}.png`, fullPage: true });
    await page.getByRole("link", { name: "Siguiente", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Registro compartido 2", exact: true })).toBeVisible();
    await expect(page.getByText("No se incluyeron otros campos en esta selección.")).toBeVisible();
    await expect(page.getByText("Control de niveles", { exact: true })).toHaveCount(0);
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Control de niveles", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Volver a la selección", exact: true }).click();
    await expect(page).toHaveURL(/\/selecciones\/public$/);
    await page.goto(`${origin}/selecciones/private?registro=1`);
    await expect(page.getByRole("link", { name: "Descargar imagen autorizada" })).toHaveAttribute("href", "/fixture-1.svg?download=1");
    await expect(page.getByText("Vigente hasta", { exact: true })).toBeVisible();
    for (const value of ["0", "99", "-1", "1.5", "1&registro=2"]) {
      const response = await page.goto(`${origin}/selecciones/public?registro=${value}`);
      assert.equal(response.status(), 404);
      await expect(page.getByText("Control de niveles", { exact: true })).toHaveCount(0);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("PASS: selection list/detail/back, inline gallery, withheld fields, permission-derived downloads, Lima date, invalid record 404, 1440/375/320 widths.");
} finally { await browser.close(); }
