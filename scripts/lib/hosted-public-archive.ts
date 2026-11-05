import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { expect, type BrowserContext } from "@playwright/test";
import { s24BlobFixtures } from "./s24-blob-fixtures.mjs";

export async function checkHostedPublicArchive(db: PrismaClient, anonymous: BrowserContext, origin: URL,
  run: string, ownerId: string, profileId: string, username: string, ownedIds: string[]) {
  assert.equal(origin.origin, "https://terraqo-platform-staging.netlify.app");
  assert.match(ownerId, /^s24-owner-[0-9a-f]{12}$/);
  assert.equal(username, `s24-archive-${run}`);
  const archive = new URL(`/cv/${username}/evidencias`, origin);
  const ids = [randomUUID(), randomUUID()];
  ownedIds.push(...ids);
  const selected = s24BlobFixtures(run).map(pair => pair[0]);
  const title = "Nivelación de la plataforma de control";
  const later = "Comprobación posterior de cotas";
  const page = await anonymous.newPage();
  page.setDefaultTimeout(45_000);
  try {
    await db.$transaction([
      db.terraqoWorklogEntry.create({ data: {
        id: ids[0], authorId: ownerId, professionalProfileId: profileId, title, visibility: "PUBLIC",
        summary: "Planos sintéticos de nivelación y replanteo para la prueba de navegación.",
        lifecycle: "PUBLISHED", occurredAt: new Date("2026-10-29T04:30:00Z"),
        media: { create: selected.map((asset, index) => ({ fileName: index ? "replanteo.webp" : "nivelacion.webp",
          contentType: "image/webp", size: asset.bytes.length, sha256: asset.sha256, storageKey: asset.key, sortOrder: index })) },
      } }),
      db.terraqoWorklogEntry.create({ data: { id: ids[1], authorId: ownerId, professionalProfileId: profileId,
        title: later, visibility: "PUBLIC", lifecycle: "PUBLISHED", summary: "Lectura sintética al día siguiente.",
        occurredAt: new Date("2026-10-29T05:30:00Z") } }),
    ]);
    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(archive.href);
      await expect(page.getByText("2 bitácoras en este resultado", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Calendario", exact: true }).click();
      await page.getByLabel("Actividad del mes").fill("2026-10");
      await page.getByRole("button", { name: "2026-10-28: 1 registros públicos", exact: true }).click();
      await page.getByRole("button", { name: "2026-10-27: 0 registros públicos", exact: true }).click();
      assert.equal(page.url(), archive.href);
      await expect(page.getByRole("heading", { name: later, exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Aplicar fechas", exact: true }).click();
      await expect(page.getByText("1 bitácora en este resultado", { exact: true })).toBeVisible();
      const filtered = new URL(page.url());
      assert.equal(filtered.searchParams.get("from"), "2026-10-27");
      assert.equal(filtered.searchParams.get("to"), "2026-10-28");
      await expect(page.getByRole("heading", { name: later, exact: true })).toHaveCount(0);
      await page.locator(`#record-${ids[0]}`).click();
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      for (const n of [1, 2]) {
        await page.getByRole("button", { name: `Ver evidencia ${n}`, exact: true }).click();
        const img = page.getByRole("img", { name: `${title}, evidencia ${n}`, exact: true });
        await img.evaluate(async element => {
          const image = element as HTMLImageElement;
          await image.decode();
          if (image.naturalWidth !== 960 || image.naturalHeight !== 540) throw Error("Unexpected plan dimensions");
        });
      }
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.getByRole("link", { name: "Volver a las bitácoras" }).click();
      await expect(page).toHaveURL(filtered.href);
      await expect(page.locator(`#record-${ids[0]}`)).toBeVisible();
      await page.getByRole("button", { name: /^Quitar periodo:/ }).click();
      await expect(page.getByText("2 bitácoras en este resultado", { exact: true })).toBeVisible();
    }
  } finally {
    await page.close().finally(async () => {
      await db.terraqoWorklogEntry.deleteMany({ where: { id: { in: ids }, authorId: ownerId, professionalProfileId: profileId } });
      assert.equal(await db.terraqoWorklogEntry.count({ where: { id: { in: ids } } }), 0);
      for (const id of ids) ownedIds.splice(ownedIds.indexOf(id), 1);
    });
  }
  console.log("PASS hosted S10/S11 public archive: explicit range, Lima midnight, inline two-plan gallery, return and removal at 1280/375/320.");
}
