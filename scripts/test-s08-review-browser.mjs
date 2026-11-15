import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = "http://127.0.0.1:3198/portal/respaldos";
const browser = await chromium.launch();
const results = [];
async function open(scenario = "", width = 1440, id = "review-one") {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  const writes = [], errors = [], media = [];
  let mode = 200;
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (request.url().includes("/evidence/")) media.push(request.url()); });
  await page.route("**/api/v1/endorsement-requests/**/decisions", async route => {
    writes.push({ body: route.request().postDataJSON(), key: await route.request().headerValue("Idempotency-Key") });
    if (mode === "abort") return route.abort();
    await new Promise(resolve => setTimeout(resolve, 150));
    return route.fulfill({ status: mode, json: mode === 200 ? { data: {} } : { error: { message: "Error de prueba. Reintenta." } } });
  });
  await page.goto(`${base}?solicitud=${id}&scenario=${scenario}`);
  return { page, writes, errors, media, fail: value => { mode = value; } };
}
async function answer(page) {
  for (const field of ["contributionRole", "outcome"]) await page.getByTestId(`s08-aspect-${field}`).getByRole("radio", { name: "Confirmar", exact: true }).check();
}
try {
  for (const width of [1440, 375, 320]) {
    const { page, writes, errors, media, fail } = await open("newer", width);
    await expect(page.getByRole("heading", { name: "Revisar solicitud de respaldo", exact: true })).toBeVisible();
    await expect(page.locator("input:checked")).toHaveCount(0);
    await expect(page.getByTestId("s08-submit")).toBeDisabled();
    await expect(page.getByTestId("s08-newer-revision")).toBeVisible();
    await expect(page.getByTestId("s08-review")).not.toContainText("NO MOSTRAR");
    await expect(page.getByTestId("s08-review")).not.toContainText("Otra persona");
    await page.getByText("Ver versión solicitada", { exact: true }).click();
    await expect(page.getByTestId("s08-evidence")).toContainText("fixed-revision-hash-001");
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow ${width}`);
    await page.screenshot({ path: `output/s08-ui-${width}.png`, fullPage: true });
    // Keyboard selection and mandatory clarification; no default answer.
    const first = page.getByTestId("s08-aspect-contributionRole");
    await first.getByRole("radio", { name: "Confirmar", exact: true }).focus();
    await page.keyboard.press("Space");
    await page.getByTestId("s08-aspect-outcome").getByRole("radio", { name: "Solicitar aclaración" }).check();
    await expect(page.getByTestId("s08-submit")).toBeDisabled();
    await page.getByLabel("Aclaración necesaria", { exact: true }).fill("   ");
    await expect(page.getByTestId("s08-submit")).toBeDisabled();
    await page.getByLabel("Aclaración necesaria", { exact: true }).fill("Precisar el alcance del entregable.");
    await expect(page.getByTestId("s08-submit")).toBeEnabled();
    fail("abort");
    await page.getByTestId("s08-submit").click();
    await expect(page.getByTestId("s08-review").getByRole("alert")).toBeVisible();
    await expect(page.getByLabel("Aclaración necesaria", { exact: true })).toHaveValue("Precisar el alcance del entregable.");
    fail(200);
    await page.getByTestId("s08-submit").evaluate(button => { button.click(); button.click(); });
    await expect(page.getByRole("region", { name: "Revisar aspectos solicitados" }).getByRole("status")).toContainText("Revisión registrada");
    assert.equal(writes.length, 2);
    assert.equal(writes[0].key, writes[1].key);
    assert.ok(writes[0].key);
    assert.equal(writes[1].body.expectedVersion, 3);
    assert.equal(writes[1].body.expectedRevisionId, "revision-one");
    assert.equal(writes[1].body.expectedRevisionHash, "fixed-revision-hash-001");
    assert.deepEqual(writes[1].body.responses.map(item => item.field), ["contributionRole", "outcome"]);
    assert.equal(writes[1].body.responses[1].decision, "CHANGES_REQUESTED");
    assert.equal(media.length, 0);
    assert.deepEqual(errors, []);
    await page.close(); results.push(`PASS ${width}px: pinned scope, no defaults, keyboard, clarification, retry key, duplicate lock, no private media, no overflow`);
  }
  for (const scenario of ["historical", "historical-unscoped", "expired", "revoked", "confirmed", "missing"]) {
    const { page, writes } = await open(scenario, 375);
    if (scenario === "historical") {
      await expect(page.getByTestId("s08-historical-unavailable")).toBeVisible();
      await expect(page.getByTestId("s08-submit")).toBeDisabled();
      await expect(page.getByTestId("s08-review")).not.toContainText("NO MOSTRAR FECHA ACTUAL");
      await page.screenshot({ path: "output/s08-historical-375.png", fullPage: true });
    } else if (scenario === "historical-unscoped") {
      await expect(page.getByTestId("s08-historical-unavailable")).toHaveCount(0);
      await answer(page); await expect(page.getByTestId("s08-submit")).toBeEnabled();
    } else {
      await expect(page.getByTestId("s08-submit")).toHaveCount(0);
      if (["expired", "revoked"].includes(scenario)) await expect(page.getByTestId("s08-evidence")).toHaveCount(0);
    }
    assert.equal(writes.length, 0); await page.close(); results.push(`PASS ${scenario}`);
  }
  for (const status of [404, 409]) {
    const { page, writes, fail } = await open();
    fail(status); await answer(page); await page.getByTestId("s08-submit").click();
    if (status === 409) await expect(page.getByTestId("s08-review").getByRole("alert")).toContainText("versión cambió"); else await expect(page.getByRole("status")).toContainText("ya no están disponibles");
    if (status === 409) await expect(page.getByTestId("s08-submit")).toBeDisabled(); else await expect(page.getByTestId("s08-submit")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Recargar solicitud" })).toBeVisible();
    assert.equal(writes.length, 1); await page.close(); results.push(`PASS ${status}: blocks replay pending reload`);
  }
  const { page } = await open("", 1440, "review-two");
  await expect(page.getByTestId("s08-review")).toContainText("Otra persona");
  await expect(page.getByTestId("s08-review")).not.toContainText("Antonio");
  // Browser 200% equivalent CSS viewport, plus enlarged type.
  await page.setViewportSize({ width: 720, height: 500 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: "output/s08-large-text.png", fullPage: true });
  await page.close(); results.push("PASS selectedRequestId selects exactly requested item; 200% text no overflow");
  await writeFile("output/s08-ui-results.txt", results.join("\n") + "\n");
  console.log(results.join("\n"));
} finally { await browser.close(); }
