import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch();
try {
  for (const width of [1440, 375, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    const requests = [];
    let status = 503;
    await page.route("**/api/terraqo/professional-documents/**", async route => {
      requests.push({ url: route.request().url(), body: route.request().postData() });
      await route.fulfill({ status, json: status === 200 ? { data: { id: "cv-current" } } : { error: "Respuesta de prueba: no confirmada" } });
    });
    await page.goto("http://localhost:3190/s18-documents");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByText("CV profesional actualizado.docx", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Previsualizar", exact: true })).toHaveCount(0);
    await page.getByText("Versiones anteriores del CV", { exact: true }).click();
    await expect(page.getByRole("link", { name: "Descargar versión anterior" })).toHaveCount(1);
    await expect(page.locator('a[href*="cv-retired"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Nueva versión", exact: true }).first().click();
    await expect(page.locator('input[name="file"]')).toHaveAttribute("accept", ".pdf,.docx");
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    assert.equal(requests.length, 0);
    await page.getByRole("button", { name: "Nueva versión", exact: true }).first().click();
    await page.locator('input[name="file"]').setInputFiles({ name: "CV.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\n") });
    for (let i = 0; i < 2; i++) {
      await page.getByRole("button", { name: "Guardar nueva versión", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "no confirmada" })).toBeVisible();
    }
    const operationKey = body => body.match(/name="operationKey"\r\n\r\n([^\r]+)/)?.[1];
    assert.ok(operationKey(requests[0].body));
    assert.equal(operationKey(requests[0].body), operationKey(requests[1].body));
    assert.ok(requests.every(request => request.url.endsWith("/cv-current/replacement")));
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.getByRole("button", { name: "Retirar documento", exact: true }).first().click();
    status = 200;
    await page.getByRole("button", { name: "Confirmar retiro", exact: true }).click();
    await expect(page.getByRole("button", { name: "Subir CV", exact: true })).toBeVisible();
    await expect(page.locator('a[href$="/cv-current"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reemplazar CV", exact: true })).toHaveCount(0);
    assert.ok(requests.at(-1).url.endsWith("/cv-current/withdraw"));
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll("main *")].filter(element => element.getBoundingClientRect().right > innerWidth + 1).map(element => element.tagName)), []);
    await page.close();
  }
  console.log("PASS S18 CV browser 1440/375/320: history privacy, DOCX no false preview, inline cancellation, stable multipart retry key, withdrawal without predecessor resurrection, no horizontal clipping. API responses are synthetic.");
} finally { await browser.close(); }
