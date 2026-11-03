import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const origin = process.env.ARCHIVE_FIXTURE_ORIGIN || "http://localhost:3190";
const browser = await chromium.launch();
try {
  for (const width of [1440, 375, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (/hydrated|hydration/i.test(message.text())) errors.push(message.text()); });
    await page.route("**/api/public/cv/fixture/worklogs/fixture-*", route => route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#254256"/><path d="M0 500L300 180L800 450V600H0" fill="#365e73"/><text x="50" y="90" fill="white" font-size="30">Evidencia sintética</text></svg>',
    }));
    await page.goto(`${origin}/cv/fixture`);
    await expect(page.getByRole("heading", { name: "Perfil de prueba", exact: true })).toBeVisible();
    await expect(page.locator("#trabajos article")).toHaveCount(2);
    await expect(page.getByText("Tu nivel de confianza", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Bitácoras", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Antes de colaborar" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Descargar CV", exact: true })).toHaveAttribute("href", "/api/terraqo/cv/fixture/pdf");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `output/public-cv-${width}.png`, fullPage: false });
    await page.getByRole("navigation", { name: "Explorar el CV" }).getByRole("link", { name: "Respaldo" }).click();
    await expect(page).toHaveURL(/#respaldo$/);
    await expect(page.getByRole("heading", { name: "Trayectoria y respaldo" })).toBeInViewport();
    await page.getByRole("link", { name: "Ver trabajo", exact: true }).first().click();
    await expect(page).toHaveURL(/\/evidencias\/work-1$/);
    await expect(page.getByRole("heading", { name: "Levantamiento de campo — prueba" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Perfil de prueba", exact: true })).toBeVisible();
    await page.getByRole("navigation", { name: "Explorar el CV" }).getByRole("link", { name: "Bitácoras" }).click();
    await expect(page).toHaveURL(/\/evidencias$/);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("PASS: CV showcase desktop/mobile, public detail, archive, backup anchor, PDF URL, no overflow or runtime exceptions.");
} finally { await browser.close(); }
