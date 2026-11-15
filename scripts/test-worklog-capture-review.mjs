import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch();
try {
  for (const width of [1280, 375, 320]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    const writes = [];
    let uploads = 0;
    await page.route("**/api/terraqo/worklog", async (route) => {
      writes.push(route.request().postDataJSON());
      await route.fulfill({ json: { data: { id: "test-record" } } });
    });
    await page.route("**/test-record/evidence", async (route) => {
      uploads++;
      await route.fulfill(
        uploads === 1
          ? { status: 503, json: {} }
          : { json: { data: { media: [{ id: "ok" }] } } },
      );
    });
    await page.goto("http://127.0.0.1:3218/captura");
    const form = page.locator("#registrar-trabajo");
    await form.getByLabel(/Guardar un borrador/).check();
    await ctx.setOffline(true);
    await form
      .locator("input[type=file][multiple]")
      .setInputFiles("scripts/fixtures/public-archive/media/nivelacion.webp");
    await form
      .locator("input[capture]")
      .setInputFiles("scripts/fixtures/public-archive/media/replanteo.webp");
    await form.locator("[name=title]").fill("Control de nivelación");
    await form
      .locator("[name=summary]")
      .fill("Se revisaron los niveles y se comprobó la cota del eje.");
    await expect(
      form.getByText(/Guardado en este dispositivo ·/),
    ).toBeVisible();
    await ctx.setOffline(false);
    await page.reload();
    await expect(
      form
        .getByText(/Borrador recuperado|Guardado en este dispositivo/)
        .first(),
    ).toBeVisible();
    await expect(form.locator("[name=title]")).toHaveValue(
      "Control de nivelación",
    );
    await expect(form.getByRole("button", { name: /Quitar foto/ })).toHaveCount(
      2,
    );
    await form.getByRole("button", { name: "Continuar", exact: true }).click();
    await form.getByRole("button", { name: "Ver foto 2" }).click();
    await expect(
      form.getByRole("button", { name: "Ver foto 2" }),
    ).toHaveAttribute("aria-pressed", "true");
    await form
      .locator("[name=outcome]")
      .fill("La cota coincide con el plano de control.");
    await mkdir("output/s03", { recursive: true });
    await form.screenshot({ path: `output/s03/revision-${width}.png` });
    await form.getByRole("button", { name: "Revisar visibilidad" }).click();
    await expect(form.locator("[name=visibility]")).toHaveValue("PRIVATE");
    assert.equal(writes.length, 0);
    await form.getByRole("button", { name: "Volver" }).click();
    await expect(form.locator("[name=outcome]")).toHaveValue(
      "La cota coincide con el plano de control.",
    );
    await form.getByRole("button", { name: "Revisar visibilidad" }).click();
    await form.getByRole("button", { name: "Guardar en mi bitácora" }).click();
    await form
      .getByRole("button", { name: "Reintentar fotos pendientes" })
      .click();
    await expect(
      form.getByRole("heading", { name: "Registrar trabajo" }),
    ).toBeVisible();
    assert.equal(writes.length, 1);
    assert.equal(uploads, 3);
    assert.equal(writes[0].visibility, "PRIVATE");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await ctx.close();
    console.log(
      "PASS offline capture, restored gallery, explicit visibility and retry",
      width,
    );
  }
} finally {
  await browser.close();
}
