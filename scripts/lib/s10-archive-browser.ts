import assert from "node:assert/strict";
import { expect, type Page } from "@playwright/test";
import type { BrowserContext } from "playwright";
import { asSession } from "./s06-sharing-reads";
import { excludes } from "./s09-visitor-reads";
import type { ArchiveFixture } from "./s10-archive-fixtures";

const check = expect.configure({ timeout: 45_000 });
export const archiveWidths = [1440, 375, 320];
const month = "2026-10";
const allDays = { "2026-10-27": 1, "2026-10-28": 5, "2026-10-29": 1, "2026-10-31": 1 };
const matchDays = { ...allDays, "2026-10-28": 1 };

function criteria(f: ArchiveFixture) {
  return { q: "poligonal", type: "DELIVERABLE", state: "LINKED", projectId: f.project };
}
function canaries(f: ArchiveFixture) {
  return [f.hiddenProject, ...f.hidden.flatMap(row => [row.id, row.title, row.summary])];
}
export async function archiveReads(ctx: BrowserContext, f: ArchiveFixture) {
  const read = asSession(ctx);
  const root = "/api/v1/profiles/" + f.profile + "/evidence";
  const confidential = canaries(f);
  async function data(path: string, criteria: Record<string, string>) {
    const response = await read(root + path + "?" + new URLSearchParams({ ...criteria, audience: "public", timezone: "America/Lima" }));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") || "", /\bno-store\b/i);
    const body = await response.text();
    excludes(body, confidential);
    const { data } = JSON.parse(body);
    assert.equal(data.audience, "PUBLIC");
    return data;
  }
  const list = { limit: "20", period: "all" };
  const first = await data("", list);
  const ids = (rows: { id: string }[]) => rows.map(row => row.id);
  assert.equal(first.scopeCounts.records, f.visible.length);
  assert.deepEqual(ids(first.items), ids(f.visible.slice(0, 20)));
  assert.deepEqual(ids(first.projects), [f.project]);
  assert.equal(first.page.hasMore, true);
  assert.ok(typeof first.page.nextCursor === "string" && first.page.nextCursor);
  const next = await data("", { ...list, cursor: first.page.nextCursor });
  assert.deepEqual(ids(next.items), ids(f.visible.slice(20)));
  assert.equal(next.page.hasMore, false);
  assert.equal(next.page.nextCursor, null);
  for (const [filters, days] of [
    [{ month }, allDays], [{ month, ...criteria(f) }, matchDays], [{ month: "2026-11" }, { "2026-11-01": 20 }],
  ] as const) {
    const activity = await data("/activity", filters);
    assert.equal(activity.month, filters.month);
    assert.equal(activity.timeZone, "America/Lima");
    assert.deepEqual(activity.days, Object.entries(days).map(([date, count]) => ({ date, count })));
  }
  const html = await read("/cv/" + f.username + "/evidencias");
  assert.equal(html.status, 200);
  excludes(await html.text(), confidential);
  for (const row of f.hidden) {
    const denied = await read("/api/v1/evidence/" + row.id);
    assert.equal(denied.status, 404);
    excludes(await denied.text(), [row.title, row.summary]);
  }
}

const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
async function rows(page: Page, records: { id: string }[], total = records.length) {
  await check(page.getByText(total + (total === 1 ? " bitácora" : " bitácoras") + " en este resultado", { exact: true })).toBeVisible();
  const links = page.locator('a[id^="record-"]');
  await check.poll(() => links.evaluateAll(nodes => nodes.map(n => n.id.slice(7)))).toEqual(records.map(r => r.id));
}
async function fitsViewport(page: Page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Archive exceeds viewport width");
}
function day(page: Page, date: string, count: number) {
  return page.getByRole("button", { name: new RegExp("^" + date + "(?:, hoy)?: " + count + " registros? públicos?$") });
}

export async function archiveJourney(page: Page, origin: string, f: ArchiveFixture, width: number, phase: (name: string) => void) {
  const step = (name: string) => phase(name + "-" + width);
  step("pagination");
  const archive = origin + "/cv/" + f.username + "/evidencias";
  const first = f.visible.slice(0, 20);
  await page.setViewportSize({ width, height: 850 });
  assert.equal((await page.goto(archive))?.status(), 200);
  await rows(page, first, f.visible.length);
  await fitsViewport(page);
  await button(page, "Cargar más bitácoras").click();
  const target = page.locator("#record-" + f.start.id);
  await check(target).toBeVisible();
  await rows(page, f.visible);
  await check(button(page, "Cargar más bitácoras")).toHaveCount(0);
  step("scroll-return");
  // Center the off-page link before clicking so Playwright does not scroll it on our behalf.
  await target.evaluate(node => node.scrollIntoView({ block: "center", behavior: "instant" }));
  const position = await page.evaluate(() => scrollY);
  assert.ok(position > 850);
  await target.click();
  await check(page).toHaveURL(archive + "/" + f.start.id);
  await check(page.getByRole("heading", { name: f.start.title, exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Volver a las bitácoras" }).click();
  await check(page).toHaveURL(archive);
  await check(target).toBeFocused();
  await check(target).toHaveAttribute("aria-current", "true");
  await rows(page, f.visible);
  await check.poll(async () => Math.abs(await page.evaluate(() => scrollY) - position)).toBeLessThanOrEqual(4);

  step("monthly-activity");
  await button(page, "Calendario").click();
  await page.getByLabel("Actividad del mes", { exact: true }).fill(month);
  for (const [date, count] of Object.entries(allDays)) await check(day(page, date, count)).toBeVisible();
  await check(day(page, "2026-10-26", 0)).toBeVisible();
  await fitsViewport(page);

  step("combined-filters");
  await button(page, "Filtros").click();
  const search = page.getByRole("textbox", { name: "Buscar en todas las bitácoras públicas" });
  const filter = criteria(f);
  await search.fill(filter.q);
  await page.getByLabel("Tipo", { exact: true }).selectOption(filter.type);
  await page.getByLabel("Estado", { exact: true }).selectOption(filter.state);
  await page.getByLabel("Proyecto", { exact: true }).selectOption(filter.projectId);
  for (const [date, count] of Object.entries(matchDays)) await check(day(page, date, count)).toBeVisible();
  await check(day(page, "2026-10-26", 0)).toBeVisible();
  await day(page, "2026-10-29", 1).click();
  await day(page, "2026-10-28", 1).click();
  assert.equal(page.url(), archive);
  await rows(page, f.visible);
  await fitsViewport(page);
  await button(page, "Aplicar filtros").click();
  await rows(page, [f.end, f.start]);
  assert.deepEqual(Object.fromEntries(new URL(page.url()).searchParams), { ...filter, from: "2026-10-28", to: "2026-10-29" });
  const filtered = page.url();
  await target.click();
  await check(page).toHaveURL(archive + "/" + f.start.id + new URL(filtered).search);
  await page.goBack();
  await check(page).toHaveURL(filtered);
  await rows(page, [f.end, f.start]);
  await check(page.getByLabel("Actividad del mes", { exact: true })).toHaveValue(month);
  await check(day(page, "2026-10-28", 1)).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /^Quitar periodo:/ }).click();
  await rows(page, [f.after, f.end, f.start, f.before]);
  assert.deepEqual(Object.fromEntries(new URL(page.url()).searchParams), filter);

  step("empty-clear-reset");
  await search.fill("ausentes" + f.run.replaceAll("-", ""));
  await button(page, "Buscar").click();
  await rows(page, []);
  await check(page.getByRole("heading", { name: "No hay bitácoras para estos filtros" })).toBeVisible();
  await fitsViewport(page);
  await button(page, "Limpiar filtros").click();
  await check(page).toHaveURL(archive);
  await rows(page, first, f.visible.length);
  await check(search).toHaveValue("");
  await check(button(page, "Cargar más bitácoras")).toBeVisible();
  excludes(await page.content(), canaries(f));
}
