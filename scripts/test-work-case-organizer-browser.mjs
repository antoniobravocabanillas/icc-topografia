import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch();
try {
  for (const width of [1440, 375, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    const writes = [];
    let reject = true;
    await page.route("**/fixture-*.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#254256"/><text x="60" y="100" fill="white" font-size="32">Registro de prueba</text></svg>' }));
    await page.route("**/api/v1/work-cases**", route => {
      writes.push({ method: route.request().method(), body: route.request().postDataJSON() });
      if (reject) return route.fulfill({ status: 409, json: { error: { message: "El registro cambió. Revisa la selección." } } });
      return route.fulfill({ status: 200, json: { data: {} } });
    });
    await page.goto("http://localhost:3190/organizar");
    await expect(page.getByRole("heading", { name: "Organizar un trabajo", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar agrupación" })).toBeDisabled();
    await page.getByRole("checkbox", { name: "Seleccionar Control de niveles" }).check();
    await expect(page.getByRole("checkbox", { name: "Seleccionar Trabajo de otra empresa" })).toBeDisabled();
    await expect(page.getByRole("combobox", { name: "Fase de Control de niveles" })).toHaveValue("");
    await page.getByRole("button", { name: "Mantener separados" }).click();
    assert.equal(writes.length, 0);
    await expect(page.getByRole("checkbox", { name: "Seleccionar Trabajo de otra empresa" })).toBeEnabled();
    await page.getByRole("checkbox", { name: "Seleccionar Control de niveles" }).check();
    await page.getByRole("checkbox", { name: "Seleccionar Replanteo de ejes" }).check();
    await page.getByRole("combobox", { name: "Fase de Replanteo de ejes" }).selectOption("RESULT");
    await page.getByRole("textbox", { name: "Nombre del trabajo" }).fill("Control sector B");
    await page.getByRole("textbox", { name: "Descripción (opcional)" }).fill("Descripción conservada ante un conflicto.");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `output/work-case-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Confirmar agrupación" }).click();
    await expect(page.getByRole("status")).toContainText("El registro cambió");
    await expect(page.getByRole("textbox", { name: "Nombre del trabajo" })).toHaveValue("Control sector B");
    assert.deepEqual(writes[0].body.records, [{ worklogId: "one" }, { worklogId: "two", phase: "RESULT" }]);
    assert.equal(writes[0].body.workspaceId, "company-a");
    reject = false;
    await page.getByRole("button", { name: "Confirmar agrupación" }).click();
    await expect(page.getByRole("status")).toContainText("Trabajo creado");
    await page.getByRole("button", { name: "Desvincular Registro vinculado" }).click();
    await expect(page.getByRole("status")).toContainText("no fue eliminado");
    assert.deepEqual(writes.at(-1), { method: "DELETE", body: { worklogId: "linked", expectedVersion: 7 } });
    await page.getByRole("textbox", { name: "Buscar bitácoras para agrupar" }).fill("inexistente");
    await expect(page.getByText("No hay coincidencias. Prueba otro título.")).toBeVisible();
    await page.close();
  }
  console.log("PASS: organizer 1440/375/320, explicit selection, optional phase, context boundaries, no-write cancel, conflict recovery and versioned unlink.");
} finally { await browser.close(); }
