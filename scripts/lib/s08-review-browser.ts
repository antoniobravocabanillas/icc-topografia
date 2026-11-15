import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import type { Page } from "playwright";
import { inbox, requests } from "./s07-endorsement-browser";

export const reviewPath = (id: string) => inbox + "?solicitud=" + encodeURIComponent(id);
export const decisionPath = (id: string) => requests + "/" + id + "/decisions";
export const reviewForm = (page: Page) =>
  page.getByTestId("s08-review").getByRole("region", { name: "Revisar aspectos solicitados" });

export type ReviewTarget = { id: string; version: number; revisionId: string; revisionHash: string };
export function pinned(target: ReviewTarget) {
  return { expectedVersion: target.version, expectedRevisionId: target.revisionId, expectedRevisionHash: target.revisionHash };
}

export async function clickNotice(page: Page, origin: string, target: ReviewTarget) {
  const href = reviewPath(target.id);
  const bell = page.locator('summary[aria-label^="Notificaciones y sonido"]:visible');
  await bell.click();
  const link = page.locator("details[open]").getByRole("link", { name: "Revisar solicitud de respaldo", exact: true });
  await expect(link).toBeVisible({ timeout: 45_000 });
  await expect(link).toHaveAttribute("href", href, { timeout: 45_000 });
  await Promise.all([page.waitForURL(origin + href), link.click()]);
  await expect(reviewForm(page)).toBeVisible();
}

export async function completePersonalReview(page: Page, target: ReviewTarget, run: string) {
  const form = reviewForm(page);
  const send = form.getByRole("button", { name: /Registrar revisión/ });
  const group = (name: string) => form.getByRole("group", { name, exact: true });
  await expect(form.getByRole("radio")).toHaveCount(9);
  await expect(form.locator("input:checked")).toHaveCount(0);
  await expect(send).toBeDisabled();
  const comment = "Constaté la descripción " + run;
  const clarification = "Indica la tolerancia " + run;
  const general = "Revisión de la versión original " + run;
  await group("Título").getByRole("radio", { name: "No puedo confirmar", exact: true }).check();
  await group("Descripción").getByRole("radio", { name: "Confirmar", exact: true }).check();
  await group("Descripción").getByLabel("Comentario (opcional)").fill("  " + comment + "  ");
  await expect(send).toBeDisabled();
  await group("Resultado").getByRole("radio", { name: "Solicitar aclaración", exact: true }).check();
  const required = group("Resultado").getByLabel("Aclaración necesaria");
  await expect(send).toBeDisabled();
  await required.fill("   ");
  await expect(send).toBeDisabled();
  await required.fill(clarification);
  await form.getByLabel("Comentario general (opcional)").fill(general);
  await expect(send).toBeEnabled();
  const payload = { ...pinned(target), responses: [
    { field: "title", decision: "UNABLE_TO_CONFIRM" },
    { field: "summary", decision: "CONFIRMED", comment },
    { field: "outcome", decision: "CHANGES_REQUESTED", comment: clarification },
  ], summaryComment: general };

  const url = new URL(decisionPath(target.id), page.url()).href;
  let first: { key: string; decisionId: string } | undefined, failure: unknown;
  // Forward the browser's actual POST once. Lose only the committed server response.
  await page.route(url, async route => {
    try {
      assert.equal(route.request().method(), "POST");
      const key = await route.request().headerValue("Idempotency-Key");
      assert.ok(key);
      assert.deepEqual(route.request().postDataJSON(), payload);
      const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 45_000 });
      try {
        assert.equal(response.status(), 200);
        const { data } = await response.json();
        assert.equal(data.id, target.id);
        assert.equal(data.version, target.version + 1);
        assert.equal(data.decisions.length, 1);
        assert.ok(data.decisions[0].id);
        first = { key, decisionId: data.decisions[0].id };
      } finally { await response.dispose(); }
    } catch (error) { failure = error; }
    finally { await route.abort("failed"); }
  }, { times: 1 });
  await Promise.all([page.waitForEvent("requestfailed", { predicate: r => r.url() === url, timeout: 55_000 }), send.click()]);
  if (failure) throw failure;
  assert.ok(first);
  await expect(send).toBeEnabled();
  await expect(required).toHaveValue(clarification);
  await expect(form.getByLabel("Comentario general (opcional)")).toHaveValue(general);

  const [retry] = await Promise.all([page.waitForResponse(r => r.url() === url && r.request().method() === "POST"), send.click()]);
  assert.deepEqual(retry.request().postDataJSON(), payload);
  assert.equal(await retry.request().headerValue("Idempotency-Key"), first.key);
  assert.equal(retry.status(), 200);
  const { data } = await retry.json();
  assert.equal(data.id, target.id);
  assert.equal(data.version, target.version + 1);
  assert.equal(data.status, "CHANGES_REQUESTED");
  assert.equal(data.decisions.length, 1);
  assert.equal(data.decisions[0].id, first.decisionId);
  await expect(page.getByRole("heading", { name: "Revisión finalizada" })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("s08-review")).toContainText(general);
  return { ...first, payload };
}
