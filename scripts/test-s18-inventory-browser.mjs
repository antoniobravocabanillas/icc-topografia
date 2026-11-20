import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch();
try {
  for (const width of [1440, 375, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.setDefaultTimeout(15000);
    const writes = []; let conflict = true;
    await page.route("**/api/v1/share-collections/**", route => {
      const req = route.request(); writes.push({ method: req.method(), body: req.postDataJSON(), path: new URL(req.url()).pathname });
      return route.fulfill({ status: conflict ? 409 : 200, json: conflict ? { error: {} } : { data: req.url().endsWith("/grants") ? { version: 4 } : { revoked: true } } });
    });
    await page.goto("http://localhost:3190/s18-inventory");
    await page.evaluate(() => document.fonts.ready);
    const item = page.getByRole("article", { name: "Control geométrico · Viaducto sur" });
    await expect(item.getByText("Vencido", { exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Privacidad y cuenta" }).getByRole("link", { name: "Documentos privados" })).toHaveAttribute("href", "/portal/documentos");
    await expect(page.getByRole("link", { name: "Ver mi plan" })).toHaveAttribute("href", "/portal/membresia");
    await page.getByRole("searchbox").fill("consultoria");
    await expect(page.getByRole("article")).toHaveCount(1);
    await page.getByRole("searchbox").fill("sin resultados");
    await expect(page.getByText("No hay coincidencias")).toBeVisible();
    await page.getByRole("button", { name: "Limpiar búsqueda" }).click();
    await item.getByRole("button", { name: "Revocar acceso", exact: true }).click();
    await expect(item.getByText(/no recupera las copias/)).toBeVisible();
    assert.equal(writes.length, 0);
    await item.getByRole("button", { name: "Conservar acceso" }).click();
    assert.equal(writes.length, 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `output/s18-inventory-${width}.png`, fullPage: true });
    await item.getByRole("button", { name: "Revocar acceso", exact: true }).click();
    await item.getByRole("button", { name: "Confirmar revocación" }).click();
    await expect(page.getByRole("region", { name: "Accesos que has compartido", exact: true }).getByRole("alert")).toContainText("otra sesión");
    await expect(item.getByRole("button", { name: "Revocar acceso", exact: true })).toBeEnabled();
    conflict = false;
    await item.getByRole("button", { name: "Revocar acceso", exact: true }).click();
    await item.getByRole("button", { name: "Confirmar revocación" }).click();
    await expect(page.getByRole("status")).toContainText("Acceso revocado");
    await expect(item.getByRole("button", { name: "Revocar acceso", exact: true })).toHaveCount(0);
    assert.deepEqual(writes[1].body, { expectedVersion: 3, grantId: "grant-fixture", reason: "Revocado por el titular" });
    await item.getByRole("button", { name: "Retirar publicación" }).click();
    await item.getByRole("button", { name: "Confirmar revocación" }).click();
    await expect(page.getByRole("status")).toContainText("Publicación retirada");
    assert.equal(writes[2].body.expectedVersion, 4);
    assert.ok(writes.every(write => write.method === "DELETE"));
    await page.goto("http://localhost:3190/s18-inventory?empty=1");
    await expect(page.getByText("Tus selecciones siguen bajo tu control")).toBeVisible();
    await page.close();
  }
  console.log("PASS S18 inventory: navigation/search/empty, confirm/cancel, conflict without false success, version continuity, desktop/mobile.");
} finally { await browser.close(); }
