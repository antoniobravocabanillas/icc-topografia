import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch();
try {
  for (const width of [1440, 375, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    page.setDefaultTimeout(15000);
    const writes = [];
    let fail = true;
    await page.route("**/api/v1/endorsement-requests/*/decisions", route => {
      writes.push({ body: route.request().postDataJSON(), key: route.request().headers()["idempotency-key"] });
      return route.fulfill({ status: fail ? 503 : 200, json: fail ? { error: { message: "Reintenta; tus respuestas se conservan." } } : { data: {} } });
    });
    await page.goto("http://localhost:3190/revision-preview");
    const send = page.getByRole("button", { name: "Registrar revisión de 2 aspectos" });
    await expect(send).toBeDisabled();
    assert.equal(await page.locator('input[type="radio"]:checked').count(), 0);
    const description = page.getByRole("group", { name: "Descripción", exact: true });
    const outcome = page.getByRole("group", { name: "Resultado", exact: true });
    await description.getByRole("radio", { name: "Confirmar", exact: true }).check();
    await description.getByLabel("Comentario (opcional)").fill("Presencié el trabajo.");
    await outcome.getByRole("radio", { name: "Solicitar aclaración" }).check();
    await expect(send).toBeDisabled();
    await outcome.getByLabel("Aclaración necesaria").fill("   ");
    await expect(send).toBeDisabled();
    await outcome.getByLabel("Aclaración necesaria").fill("Indica la tolerancia.");
    await expect(send).toBeEnabled();
    await expect(page.getByLabel("Resumen de respuestas")).toContainText("Resultado: Solicitar aclaración");
    assert.equal(writes.length, 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `output/endorsement-review-${width}.png`, fullPage: true });
    await send.click();
    await expect(page.getByRole("status")).toContainText("Reintenta");
    await expect(description.getByLabel("Comentario (opcional)")).toHaveValue("Presencié el trabajo.");
    fail = false;
    await send.click();
    await expect(page.getByRole("status")).toContainText("Revisión registrada");
    assert.equal(writes[0].key, writes[1].key);
    assert.deepEqual(writes[1].body.responses, [{ field: "summary", decision: "CONFIRMED", comment: "Presencié el trabajo." }, { field: "outcome", decision: "CHANGES_REQUESTED", comment: "Indica la tolerancia." }]);
    await expect(page.getByRole("button", { name: "Revisión registrada" })).toBeDisabled();
    await page.getByRole("button", { name: "Actualizar versión de prueba" }).click();
    await expect(send).toBeDisabled();
    assert.equal(await page.locator('input[type="radio"]:checked').count(), 0);
    await page.close();
  }
  console.log("PASS S08: no default answers, required clarification, optional confirmation comment, response summary, identical retry key, completion lock, version reset, responsive widths.");
} finally { await browser.close(); }
