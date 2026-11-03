import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch();
try {
  for (const width of [1440, 375, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    page.setDefaultTimeout(15000);
    const writes = [];
    await page.route("**/api/v1/share-collections/**", route => {
      writes.push({ url: route.request().url(), method: route.request().method(), body: route.request().postDataJSON() });
      return route.fulfill({ status: 200, json: { data: {} } });
    });
    await page.goto("http://localhost:3190/revocar-preview");
    await page.getByRole("button", { name: "Revocar acceso", exact: true }).click();
    await expect(page.getByText(/Esto no recupera las copias/)).toBeVisible();
    assert.equal(writes.length, 0);
    await page.getByRole("button", { name: "Conservar acceso" }).click();
    assert.equal(writes.length, 0);
    await page.getByRole("button", { name: "Revocar acceso", exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `output/sharing-revocation-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Confirmar revocación" }).click();
    await expect(page.getByRole("status")).toContainText("Acceso revocado");
    assert.deepEqual(writes[0].body, { grantId: "grant-fixture", expectedVersion: 3, reason: "Revocado por el titular" });
    await page.getByRole("button", { name: "Revocar publicación", exact: true }).click();
    assert.equal(writes.length, 1);
    await page.getByRole("button", { name: "Confirmar revocación" }).click();
    await expect(page.getByRole("status")).toContainText("dejó de admitir nuevas lecturas");
    assert.equal(writes[1].method, "DELETE");
    assert.ok(writes[1].url.endsWith("/projection"));
    assert.deepEqual(writes[1].body, { expectedVersion: 3 });
    await page.close();
  }
  console.log("PASS S18: inline confirm, cancel without writes, private/public revoke with exact version, responsive widths.");
} finally { await browser.close(); }
