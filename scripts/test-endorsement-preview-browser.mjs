import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch();
try {
  for (const width of [1440, 375, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    page.setDefaultTimeout(15000);
    const writes = [];
    await page.route("**/api/v1/endorsement-requests**", route => {
      writes.push({ method: route.request().method(), body: route.request().postDataJSON() });
      return route.fulfill({ status: 200, json: { data: {} } });
    });
    await page.goto("http://localhost:3190/respaldo-preview");
    await expect(page.getByRole("button", { name: "Enviar borrador", exact: true })).toBeDisabled();
    await page.getByRole("combobox", { name: "Versión de evidencia" }).selectOption("revision-one");
    await page.getByLabel("Correo del revisor").fill("one@example.com");
    await page.getByLabel("Relación profesional").fill("Supervisor");
    await page.getByLabel("Vigencia").fill("2030-01-01T10:00");
    const scope = page.getByRole("checkbox", { name: "Descripción", exact: true });
    await scope.focus(); await scope.press("Space");
    const preview = page.getByRole("region", { name: "Contenido que revisará el destinatario" });
    await expect(preview).toContainText("Descripción solicitada");
    await expect(preview).not.toContainText("Título reservado");
    await expect(page.getByRole("button", { name: "Guardar borrador", exact: true })).toBeEnabled();
    await page.getByRole("checkbox", { name: /Guardar como borrador/ }).check();
    const send = page.getByRole("button", { name: "Crear y enviar" });
    await expect(send).toBeDisabled();
    await page.getByRole("checkbox", { name: /Confirmo enviar a/ }).check();
    await expect(send).toBeEnabled();
    await page.getByLabel("Correo del revisor").fill("two@example.com");
    await expect(send).toBeDisabled();
    await page.getByRole("checkbox", { name: /Confirmo enviar a/ }).check();
    assert.equal(writes.length, 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `output/endorsement-preview-${width}.png`, fullPage: true });
    await send.click();
    await expect(page.getByRole("status")).toContainText("Solicitud enviada");
    assert.equal(writes[0].body.reviewerEmail, "two@example.com");
    assert.deepEqual(writes[0].body.requestedScope, ["summary"]);
    assert.equal(writes[0].body.sendNow, true);
    await page.getByRole("checkbox", { name: /Confirmo enviar este borrador/ }).check();
    await page.getByRole("button", { name: "Enviar borrador", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("alcance y la versión quedaron fijados");
    assert.deepEqual(writes[1], { method: "PATCH", body: { expectedVersion: 1 } });
    await page.close();
  }
  console.log("PASS S07: responsive scoped preview, explicit recipient consent, edited-recipient invalidation, draft send consent and exact payloads.");
} finally { await browser.close(); }
