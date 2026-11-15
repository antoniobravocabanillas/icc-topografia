import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Start the isolated local fixture with: node scripts/fixtures/s07-harness.mjs
const baseURL = process.env.S07_FIXTURE_URL || "http://localhost:3197";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname), "Local fixtures only");
const browser = await chromium.launch();
const future = () => {
  const value = new Date(Date.now() + 7 * 86400000);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
async function prepare(page) {
  const writes = [], images = [], errors = [];
  let failure = null;
  page.setDefaultTimeout(20000);
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/terraqo/worklog/evidence/**", route => {
    images.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "image/webp", body: readFileSync(new URL("./fixtures/public-archive/media/nivelacion.webp", import.meta.url)) });
  });
  await page.route("**/api/v1/endorsement-requests**", async route => {
    writes.push({ url: route.request().url(), method: route.request().method(), body: route.request().postDataJSON(), key: await route.request().headerValue("Idempotency-Key") });
    const status = failure || 200;
    failure = null;
    return route.fulfill({ status, json: status === 200 ? { data: {} } : { error: { message: "Error de prueba. Reintenta." } } });
  });
  return { writes, images, errors, failNext: status => { failure = status; } };
}
async function fill(page) {
  await page.getByRole("combobox", { name: "Versión de evidencia" }).selectOption("revision-one");
  await page.getByLabel("Correo del revisor").fill("one@example.com");
  await page.getByLabel("Relación profesional").fill("Supervisor");
  await page.getByLabel("Vigencia").fill(future());
  const scope = page.getByRole("checkbox", { name: "Descripción", exact: true });
  await scope.focus(); await scope.press("Space");
}
try {
  for (const width of [1440, 375, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    const { writes, images, errors, failNext } = await prepare(page);
    await page.goto(`${baseURL}/respaldo-preview`);
    await expect(page.getByRole("heading", { name: "Solicitar respaldo", level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.fonts.check('700 16px "Satoshi"')), true);
    await expect(page.getByRole("button", { name: "Guardar borrador", exact: true })).toBeDisabled();
    await expect(page.getByRole("group", { name: "Aspectos que podrá revisar" }).locator("input:checked")).toHaveCount(0);
    await fill(page);
    await expect(page.getByRole("region", { name: "Mis solicitudes de respaldo" })).toContainText("1 solicitud ·");
    await expect(page.getByRole("link", { name: "Volver al registro" })).toHaveAttribute("href", "/portal/bitacora?registro=worklog-one#worklog-worklog-one");
    const preview = page.getByRole("region", { name: "Contenido que revisará el destinatario" });
    await expect(preview).toContainText("Descripción solicitada");
    await expect(preview).not.toContainText("Título reservado");
    await expect(preview.locator("img")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Guardar borrador", exact: true })).toBeEnabled();
    await page.getByLabel("Correo del revisor").fill("invalid-email");
    await expect(page.getByRole("button", { name: "Enviar solicitud", exact: true })).toBeDisabled();
    await page.getByLabel("Correo del revisor").fill("one@example.com");
    await page.getByLabel("Vigencia").fill("2020-01-01T10:00");
    await expect(page.getByRole("button", { name: "Guardar borrador", exact: true })).toBeDisabled();
    await page.getByLabel("Vigencia").fill(future());
    await page.getByRole("button", { name: "Enviar solicitud", exact: true }).click();
    const send = page.getByRole("button", { name: "Confirmar y enviar", exact: true });
    await expect(send).toBeDisabled();
    const consent = page.getByRole("checkbox", { name: /Confirmo enviar a/ });
    await expect(consent).toHaveAccessibleName(/el 1 aspecto de la versión/);
    await consent.check();
    await expect(send).toBeEnabled();
    await page.getByLabel("Correo del revisor").fill("two@example.com");
    await expect(consent).not.toBeChecked();
    await expect(send).toBeDisabled();
    await consent.check();
    await page.getByRole("combobox", { name: "Versión de evidencia" }).selectOption("revision-two");
    await expect(consent).not.toBeChecked();
    await page.getByRole("combobox", { name: "Versión de evidencia" }).selectOption("revision-one");
    await consent.check();
    await page.getByRole("checkbox", { name: "Herramientas", exact: true }).check();
    await expect(consent).not.toBeChecked();
    await page.getByRole("checkbox", { name: "Herramientas", exact: true }).uncheck();
    await consent.check();
    assert.equal(writes.length, 0, "Preview and consent never write");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `output/s07-ui-${width}.png`, fullPage: true });
    failNext(503);
    await send.click();
    await expect(page.getByTestId("endorsement-notice")).toContainText("Error de prueba");
    await expect(send).toBeEnabled();
    await send.dblclick();
    await expect(page.getByRole("status")).toContainText("Solicitud enviada");
    assert.equal(writes.length, 2, "Double click must not create another operation");
    assert.equal(writes[0].key, writes[1].key, "Uncertain response reuses the idempotency key");
    assert.ok(writes[0].key);
    assert.equal(writes[1].body.reviewerEmail, "two@example.com");
    assert.deepEqual(writes[1].body.requestedScope, ["summary"]);
    assert.equal(writes[1].body.sendNow, true);
    await fill(page);
    await page.getByRole("button", { name: "Guardar borrador", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Borrador guardado sin enviar");
    assert.equal(writes[2].body.sendNow, false);
    assert.notEqual(writes[1].key, writes[2].key);
    const draft = page.getByTestId("endorsement-request-draft-one");
    await expect(draft.getByRole("button", { name: "Enviar borrador", exact: true })).toBeDisabled();
    await draft.getByRole("checkbox", { name: /Confirmo enviar este borrador/ }).check();
    await draft.getByRole("button", { name: "Enviar borrador", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("alcance y la versión quedaron fijados");
    assert.deepEqual(writes[3].body, { expectedVersion: 1 });
    assert.ok(images.some(url => url.endsWith("/owner-media")));
    assert.deepEqual(errors, []);
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 375, height: 960 } });
  const { writes, images, errors, failNext } = await prepare(page);
  await page.goto(`${baseURL}/respaldo-preview?scenario=history`);
  for (const [id, label] of [["pending", "Pendiente"], ["in_review", "En revisión"], ["partial", "Parcial"], ["changes_requested", "Solicita cambios"], ["declined", "No confirmado"], ["confirmed", "Confirmado"], ["expired", "Caducado"], ["revoked", "Revocado"]]) {
    await expect(page.getByTestId(`endorsement-request-${id}`).getByTestId("endorsement-status")).toHaveText(label);
  }
  for (const id of ["expired-incoming", "revoked-incoming"]) {
    const card = page.getByTestId(`endorsement-request-${id}`);
    await expect(card).not.toContainText("Descripción solicitada");
    await expect(card).not.toContainText("Título reservado");
    await expect(card.locator("img")).toHaveCount(0);
  }
  assert.ok(!images.some(url => url.includes("recipient-secret-media")));
  await expect(page.getByTestId("endorsement-request-cooldown").getByRole("button", { name: "Reenviar solicitud" })).toBeDisabled();
  const pending = page.getByTestId("endorsement-request-pending");
  failNext(429);
  await pending.getByRole("button", { name: "Reenviar solicitud" }).click();
  await expect(page.getByTestId("endorsement-notice")).toContainText("24 horas");
  await expect(pending).toBeVisible();
  assert.deepEqual(writes[0].body, { action: "resend", expectedVersion: 1 });
  await pending.getByRole("button", { name: "Reenviar solicitud" }).click();
  await expect(page.getByRole("status")).toContainText("Solicitud reenviada");
  await expect(pending.getByRole("button", { name: "Reenviar solicitud" })).toBeDisabled();
  const partial = page.getByTestId("endorsement-request-partial");
  await partial.getByRole("button", { name: "Revocar solicitud" }).click();
  assert.equal(writes.length, 2, "Opening revocation confirmation never writes");
  await expect(partial).toContainText("Las decisiones emitidas y su historial se conservarán");
  await partial.getByRole("button", { name: "Conservar solicitud" }).click();
  await partial.getByRole("button", { name: "Revocar solicitud" }).click();
  await partial.getByRole("button", { name: "Confirmar revocación" }).click();
  await expect(partial.getByTestId("endorsement-status")).toHaveText("Revocado");
  await expect(partial).toContainText("Decisión conservada");
  assert.deepEqual(writes[2].body, { expectedVersion: 1 });
  assert.equal(writes[2].method, "DELETE");
  await page.goto(`${baseURL}/respaldo-preview?scenario=initial`);
  await expect(page.getByRole("combobox", { name: "Versión de evidencia" })).toHaveValue("revision-two");
  await page.goto(`${baseURL}/respaldo-preview?scenario=empty`);
  await expect(page.getByRole("heading", { name: "Sin solicitudes todavía" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enviar solicitud", exact: true })).toBeDisabled();
  assert.deepEqual(errors, []);
  await page.close();
  console.log("PASS S07 UI: 1440/375/320, scoped preview, inline consent invalidation, draft/send, exact API payloads, idempotent retry/double click, 24h resend/429, revocation trace, hidden recipient data/images, empty/error states.");
} finally { await browser.close(); }
