import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch();
try {
  for (const width of [1440, 375, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    page.setDefaultTimeout(15000);
    const writes = [];
    await page.route("**/api/v1/share-collections", route => {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, json: { data: {} } });
    });
    await page.goto("http://localhost:3190/compartir");
    await page.getByRole("checkbox").first().check();
    const preview = page.getByRole("article", { name: "Contenido que se compartirá" });
    await expect(preview).not.toContainText("Título reservado");
    await page.getByRole("checkbox", { name: "Descripción", exact: true }).check();
    await expect(preview).toContainText("Descripción autorizada");
    await page.getByRole("checkbox", { name: "Herramientas", exact: true }).check();
    await expect(preview).toContainText("Estación total");
    await page.getByRole("checkbox", { name: "Herramientas", exact: true }).uncheck();
    await expect(preview).not.toContainText("Estación total");
    await page.getByRole("checkbox", { name: "Fecha", exact: true }).check();
    await expect(preview).toContainText(/1 nov\.? 2026/);
    await expect(preview).toContainText("Archivos excluidos");
    await page.getByRole("checkbox", { name: "Incluir archivos normalizados" }).check();
    await expect(preview).toContainText("2 archivos incluidos");
    await page.getByLabel("Nombre de la selección").fill("Selección de prueba");
    assert.equal(writes.length, 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `output/sharing-preview-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Crear selección privada" }).click();
    await expect(page.getByRole("status")).toContainText("Aún no se compartió con nadie");
    assert.deepEqual(writes[0].items, [{ revisionId: "synthetic-revision", allowedFields: ["summary", "occurredAt"], includeMedia: true }]);
    await page.close();
  }
  console.log("PASS S06 preview: 1440/375/320; excluded fields, values, Peru date, media opt-in, no implicit writes, exact payload.");
} finally { await browser.close(); }
