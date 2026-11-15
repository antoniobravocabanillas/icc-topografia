import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import type { Page, Request } from "playwright";
import type { SharingFixture, SharingRecord } from "./s06-sharing-fixtures";

export const inbox = "/portal/respaldos";
export const requests = "/api/v1/endorsement-requests";

export async function openInbox(page: Page) {
  const response = await page.goto(inbox, { waitUntil: "load" });
  assert.equal(response?.status(), 200);
  assert.equal(new URL(page.url()).pathname, inbox);
  await expect(page.getByRole("region", { name: "Mis solicitudes de respaldo" })).toBeVisible();
  // The HTML already contains interactive controls. Wait for the portal's first client-side poll after navigation.
  await page.waitForFunction(() => performance.getEntriesByType("resource").some(entry =>
    new URL(entry.name).pathname === "/api/terraqo/activity-pulse"));
}

export function requestCard(page: Page, id: string) {
  return page.getByTestId("endorsement-request-" + id);
}

export async function createRequest(page: Page, fixture: SharingFixture, record: SharingRecord, sendNow: boolean) {
  const archive = await page.goto("/portal/bitacora", { waitUntil: "domcontentloaded" });
  assert.equal(archive?.status(), 200);
  const link = page.locator("article#worklog-" + record.id).getByRole("link", { name: "Solicitar respaldo", exact: true });
  const path = inbox + "?registro=" + record.id;
  await expect(link).toHaveAttribute("href", path);
  await Promise.all([page.waitForURL(new URL(path, page.url()).href), link.click()]);
  const picker = page.getByLabel("Versión de evidencia");
  await expect(picker.locator('option:not([value=""])')).toHaveCount(1);
  await expect(picker).toHaveValue(record.revision);
  const url = new URL(requests, page.url()).href;
  let prematureCreates = 0;
  const watchCreate = (request: Request) => {
    if (request.method() === "POST" && request.url() === url) prematureCreates++;
  };
  page.on("request", watchCreate);
  const email = fixture.recipient + "@example.invalid";
  const relationship = (sendNow ? "Supervisor " : "Colaborador ") + fixture.run;
  const emailField = page.getByLabel("Correo del revisor");
  await picker.selectOption(record.revision);
  await emailField.fill(sendNow ? fixture.reviewer + "@example.invalid" : email);
  await page.getByLabel("Relación profesional").fill(relationship);
  const expiry = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 16);
  await page.getByLabel("Vigencia").fill(expiry);
  const expiresAt = await page.evaluate(value => new Date(value).toISOString(), expiry);
  const aspects = page.getByRole("group", { name: "Aspectos que podrá revisar" });
  assert.equal(await aspects.locator("input:checked").count(), 0);
  await aspects.getByRole("checkbox", { name: "Descripción", exact: true }).check();
  const preview = page.getByRole("region", { name: "Contenido que revisará el destinatario" });
  await expect(preview).toContainText(record.summary);
  await expect(preview).not.toContainText(record.title);
  const button = page.getByRole("button", { name: sendNow ? "Confirmar y enviar" : "Guardar borrador", exact: true });
  if (sendNow) {
    await page.getByRole("button", { name: "Enviar solicitud", exact: true }).click();
    const consent = page.getByRole("checkbox", { name: /Confirmo enviar a/ });
    await expect(button).toBeDisabled();
    await consent.check();
    await expect(button).toBeEnabled();
    // Consent to the original recipient must lapse when the author edits the address.
    await emailField.fill(email);
    await expect(consent).not.toBeChecked();
    await expect(button).toBeDisabled();
    await expect(consent).toHaveAccessibleName(new RegExp(email.replaceAll(".", "\\.")));
    await consent.check();
  }
  page.off("request", watchCreate);
  assert.equal(prematureCreates, 0);
  let first: { id: string; key: string | null; payload: unknown } | undefined;
  if (sendNow) {
    // Deliver once to the real server, then drop only its response to the browser.
    // Do not throw inside the route handler: always settle the intercepted request.
    let failure: unknown;
    await page.route(url, async route => {
      try {
        assert.equal(route.request().method(), "POST");
        const committed = await route.fetch({ maxRedirects: 0, timeout: 45_000 });
        try {
          assert.equal(committed.status(), 201);
          first = { id: (await committed.json()).data.id, key: await route.request().headerValue("Idempotency-Key"), payload: route.request().postDataJSON() };
        } finally { await committed.dispose(); }
      } catch (error) { failure = error; }
      finally { await route.abort("failed"); }
    }, { times: 1 });
    await button.click();
    await expect(page.locator(".s07-endorsements").getByRole("alert")).toBeVisible({ timeout: 50_000 });
    if (failure) throw failure;
    assert.ok(first?.key);
  }
  const [created] = await Promise.all([
    page.waitForResponse(r => r.url() === url && r.request().method() === "POST"),
    button.click(),
  ]);
  assert.equal(created.status(), 201);
  const payload = { revisionId: record.revision, reviewerEmail: email, relationshipLabel: relationship,
    requestedScope: ["summary"], expiresAt, sendNow };
  assert.deepEqual(created.request().postDataJSON(), payload);
  const key = await created.request().headerValue("Idempotency-Key");
  assert.ok(key);
  const { data } = await created.json();
  if (first) {
    assert.equal(key, first.key);
    assert.equal(data.id, first.id);
    assert.deepEqual(first.payload, payload);
  }
  assert.match(data.id, /^c[a-z0-9]+$/);
  assert.equal(data.requesterId, fixture.owner);
  assert.equal(data.reviewerEmail, email);
  assert.equal(data.reviewerUserId, null);
  assert.equal(data.status, sendNow ? "PENDING" : "DRAFT");
  assert.equal(data.version, 1);
  assert.equal(data.expiresAt, expiresAt);
  await expect(requestCard(page, data.id).getByTestId("endorsement-status")).toHaveText(sendNow ? "Pendiente" : "Borrador", { timeout: 45_000 });
  return { id: data.id as string, payload, key };
}

export async function sendDraft(page: Page, draft: Awaited<ReturnType<typeof createRequest>>) {
  await openInbox(page);
  const card = requestCard(page, draft.id);
  const send = card.getByRole("button", { name: "Enviar borrador", exact: true });
  await expect(send).toBeDisabled();
  const consent = card.getByRole("checkbox", { name: /Confirmo enviar este borrador/ });
  await expect(consent).toHaveAccessibleName(new RegExp(draft.payload.reviewerEmail.replaceAll(".", "\\.")));
  await consent.check();
  await expect(send).toBeEnabled();
  const url = new URL(requests + "/" + draft.id, page.url()).href;
  const [sent] = await Promise.all([
    page.waitForResponse(r => r.url() === url && r.request().method() === "PATCH"),
    send.click(),
  ]);
  assert.equal(sent.status(), 200);
  const body = sent.request().postDataJSON();
  assert.equal(body.expectedVersion, 1);
  assert.equal((await sent.json()).data.id, draft.id);
  await expect(card).toContainText("Pendiente", { timeout: 45_000 });
}

export async function readRecipient(page: Page, id: string, record: SharingRecord, available: boolean) {
  await openInbox(page);
  const card = requestCard(page, id);
  await expect(card).toBeVisible();
  await expect(card).not.toContainText(record.title);
  if (record.photo) {
    await expect(card.locator('img[src*="' + record.photo.id + '"]')).toHaveCount(0);
  }
  const form = page.getByRole("region", { name: "Revisar aspectos solicitados" });
  if (available) {
    await card.getByRole("link", { name: "Revisar solicitud", exact: true }).click();
    await expect(form).toBeVisible();
    await expect(form.getByRole("group", { name: "Descripción", exact: true })).toContainText(record.summary);
    await expect(form.getByRole("radio")).toHaveCount(3);
  } else {
    await expect(card).not.toContainText(record.summary);
    await expect(form).toHaveCount(0);
  }
}
