import assert from "node:assert/strict";
import { expect, type Page } from "@playwright/test";
import { excludes } from "./s09-visitor-reads";
import { recordSecrets, type RecordFixture } from "./s11-record-fixture";
import { mediaPath } from "./s11-record-reads";

const check = expect.configure({ timeout: 45_000 });
export const recordWidths = [1440, 375, 320];

export async function recordJourney(page: Page, origin: string, f: RecordFixture, width: number, phase: (s: string) => void) {
  const step = (s: string) => phase(s + "-" + width);
  const query = "?type=DELIVERABLE";
  const canonical = origin + f.canonical;
  const article = page.getByRole("article").filter({ has: page.getByRole("heading", { name: f.title, exact: true }) });
  const panel = article.getByRole("tabpanel");
  const gallery = article.getByRole("region", { name: "Galería de evidencias", exact: true });
  step("archive-detail");
  await page.setViewportSize({ width, height: 900 });
  assert.equal((await page.goto(f.archive + query))?.status(), 200);
  await page.locator("#record-" + f.record).click();
  await check(page).toHaveURL(canonical + query);
  const header = article.locator("header");
  await check(header.getByRole("link", { name: f.author, exact: true })).toHaveAttribute("href", "/cv/" + f.username);
  // The three UTC instants all fall on the previous calendar day in Lima.
  await check(header).toContainText(/Trabajo:\s*28\s+(?:de\s+)?oct/i);
  await check(header).toContainText(/Registrado el\s+30 de octubre de 2026/i);
  const summary = article.getByRole("complementary", { name: "Resumen del registro" });
  await check(summary).toContainText(f.summary);
  await check(summary).toContainText(f.outcome);
  await check(summary.getByText("Contexto", { exact: true })).toBeVisible();
  await check(panel).not.toContainText(f.summary);

  step("gallery");
  await check(gallery).toHaveCount(1);
  await check(article.getByRole("button", { name: /^Ver evidencia \d+$/ })).toHaveCount(2);
  for (const [i, photo] of f.photos.entries()) {
    const button = gallery.getByRole("button", { name: "Ver evidencia " + (i + 1), exact: true });
    await button.click();
    await check(button).toHaveAttribute("aria-pressed", "true");
    const img = gallery.getByRole("img", { name: f.title + ", evidencia " + (i + 1), exact: true });
    await check(img).toBeVisible();
    assert.deepEqual(await img.evaluate(async node => {
      const image = node as HTMLImageElement;
      await image.decode();
      return [image.currentSrc, image.naturalWidth, image.naturalHeight];
    }), [origin + mediaPath(f, photo.id), 960, 540]);
    await check(panel.locator('a[href="' + mediaPath(f, photo.id) + '?download=1"]')).toBeVisible();
  }
  await check(article.locator("img").filter({ visible: true })).toHaveCount(3); // One main image and two thumbnails.
  await check(page.getByRole("dialog")).toHaveCount(0);
  step("public-trace");
  const support = article.getByRole("tab", { name: "Respaldo", exact: true });
  await support.click();
  await check(support).toHaveAttribute("aria-selected", "true");
  await check(panel).toContainText(f.validator);
  await check(panel).toContainText(/0?2 de noviembre de 2026/i);
  for (const [label, fallback] of [["Relación", "No indicada públicamente"], ["Aspecto", "No disponible para este respaldo heredado"],
    ["Versión", "No disponible para este respaldo heredado"]]) {
    await check(panel.locator("dt").filter({ hasText: label }).locator("+ dd")).toHaveText(fallback);
  }
  await support.press("ArrowRight");
  await check(article.getByRole("tab", { name: "Historial", exact: true })).toBeFocused();
  await check(panel).toContainText(/Registro creado el 30 de octubre de 2026/i);
  excludes(await page.content(), recordSecrets(f));

  step("canonical-share");
  await article.getByRole("button", { name: "Compartir registro", exact: true }).click();
  await check(article.getByRole("button", { name: "Enlace copiado", exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), canonical);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole("link", { name: "Volver a las bitácoras" }).click();
  await check(page).toHaveURL(origin + f.archive + query);
  await check(page.locator("#record-" + f.record)).toBeFocused();
  step("historical-link");
  await page.goto(f.archive + "#" + f.record);
  await check(page).toHaveURL(canonical);
  await check(article.getByRole("heading", { name: f.title, exact: true })).toBeVisible();
  await check(page.locator('link[rel="canonical"]')).toHaveAttribute("href", canonical);
  await check(page.locator('meta[property="og:title"]')).toHaveAttribute("content", new RegExp(f.title));
  await check(page.locator('meta[name="description"]')).toHaveAttribute("content", f.summary);
}
