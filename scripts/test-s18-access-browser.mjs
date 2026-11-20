import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch();
try {
  for (const width of [1440, 375, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    await page.route("**/*", r => new URL(r.request().url()).hostname === "localhost" ? r.continue() : r.abort());
    await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
    await page.goto("http://localhost:3190/s18-access");
    const active = page.getByRole("region", { name: "active", exact: true });
    await expect(active.getByText("Vigente", { exact: true })).toBeVisible();
    await expect(active.getByText(/Ver selección · Descargar archivos autorizados/)).toBeVisible();
    await expect(active.getByText(/hora de Perú/)).toBeVisible();
    await expect(page.getByRole("region", { name: "expired", exact: true }).getByText("Vencido", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "revoked", exact: true }).getByText("Revocado", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "invalid", exact: true }).getByText("No disponible", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar enlace privado", exact: true })).toHaveCount(1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `output/s18-access-${width}.png`, fullPage: true });
    await page.clock.fastForward(61_000);
    await expect(active.getByText("Vencido", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar enlace privado", exact: true })).toHaveCount(0);
    await page.close();
  }
  console.log("PASS S18 access: permissions, Peru time, revoked/expired/invalid states, live expiry, 1440/375/320.");
} finally { await browser.close(); }
