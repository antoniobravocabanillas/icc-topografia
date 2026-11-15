import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";
import type { SharingRecord } from "./s06-sharing-fixtures";
import { anonymousSession, checkPdf, excludes } from "./s09-visitor-reads";

const verify = expect.configure({ timeout: 30_000 });

export async function visitorJourney(page: Page, origin: string, username: string,
  record: SharingRecord, hidden: string[]) {
  const cv = origin + "/cv/" + username, archive = cv + "/evidencias", detail = archive + "/" + record.id;
  const photo = record.photo!;
  const media = origin + "/api/public/cv/" + username + "/worklogs/" + photo.id;
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal((await page.goto(cv))?.status(), 200);
    const main = page.getByTestId("s09-profile");
    await verify(main.getByRole("heading", { level: 1, name: username })).toBeVisible();
    await verify(main.getByTestId("s09-availability")).toContainText("Disponibilidad declarada");
    const card = main.getByTestId("s09-work-" + record.id);
    await verify(card).toContainText(record.summary);
    await verify(card.getByTestId("s09-work-status-" + record.id)).toContainText(/declarad/i);
    excludes(await main.innerText(), hidden);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (width === 1440) {
      const link = main.getByRole("link", { name: "Descargar CV", exact: true });
      const pdf = origin + "/api/terraqo/cv/" + username + "/pdf";
      await verify(link).toHaveAttribute("href", new URL(pdf).pathname);
      const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
      assert.equal(download.url(), pdf);
      assert.equal(download.suggestedFilename(), "terraqo-cv-" + username + ".pdf");
      const file = await download.path();
      assert.ok(file);
      await checkPdf(await readFile(file), username);
      await download.delete();
    }
    await card.getByRole("link", { name: "Ver bitácora", exact: true }).click();
    await verify(page).toHaveURL(detail);
    await verify(page.getByRole("heading", { level: 1, name: record.title, exact: true })).toBeVisible();
    const image = page.getByRole("img", { name: record.title + ", evidencia 1", exact: true });
    const actual = await image.evaluate(async node => {
      const img = node as HTMLImageElement;
      await img.decode();
      return { src: img.currentSrc, width: img.naturalWidth, height: img.naturalHeight };
    });
    assert.deepEqual(actual, { src: media, width: 960, height: 540 });
    await page.goBack();
    await verify(page).toHaveURL(cv);
    await verify(card).toBeVisible();
    await main.getByRole("link", { name: "Bitácoras", exact: true }).click();
    await verify(page).toHaveURL(archive);
    const row = page.locator("#record-" + record.id);
    await row.click();
    await verify(page).toHaveURL(detail);
    await page.getByRole("link", { name: "Volver a las bitácoras", exact: true }).click();
    await verify(page).toHaveURL(archive);
    await verify(row).toBeVisible();
    await page.getByRole("navigation", { name: "Navegación del perfil público" }).getByRole("link", { name: "CV vivo" }).click();
    await verify(page).toHaveURL(cv);
  }
  await anonymousSession(page.context());
}

export async function emptyContact(page: Page, origin: string, username: string, hidden: string[]) {
  const path = "/cv/" + username;
  assert.equal((await page.goto(origin + path))?.status(), 200);
  await verify(page.getByTestId("s09-empty")).toBeVisible();
  await verify(page.getByTestId("s09-empty")).toContainText(/trabajos públicos/i);
  await verify(page.locator('article[data-testid^="s09-work-"]')).toHaveCount(0);
  excludes(await page.content(), hidden);
  const contact = page.getByTestId("s09-contact");
  await verify(contact).toHaveAccessibleName("Contactar");
  await verify(contact).toHaveAttribute("href", path + "/contacto");
  await contact.click();
  await page.waitForURL(url => url.origin === origin && url.pathname === "/cuenta");
  const callback = new URL(page.url()).searchParams.get("callbackUrl");
  assert.ok(callback);
  assert.equal(new URL(callback, origin).href, origin + path + "/contacto");
  await anonymousSession(page.context());
}
