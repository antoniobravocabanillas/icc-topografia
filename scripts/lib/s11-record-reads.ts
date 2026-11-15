import assert from "node:assert/strict";
import type { BrowserContext } from "playwright";
import { asSession, type Read } from "./s06-sharing-reads";
import { excludes } from "./s09-visitor-reads";
import { recordSecrets, type RecordFixture } from "./s11-record-fixture";

export const mediaPath = (f: RecordFixture, id: string) => "/api/public/cv/" + f.username + "/worklogs/" + id;
const listPath = (f: RecordFixture) => "/api/v1/profiles/" + f.profile + "/evidence?audience=public&period=all&limit=20";

async function denied(read: Read, path: string, status: number, secrets: string[]) {
  const response = await read(path);
  assert.equal(response.status, status);
  assert.equal(response.headers.has("content-disposition"), false);
  assert.doesNotMatch(response.headers.get("content-type") || "", /image\/|application\/(?:pdf|octet-stream)/i);
  excludes(await response.text(), secrets);
}

async function checkLocked(read: Read, f: RecordFixture, secrets: string[]) {
  for (const suffix of ["", "?download=1"]) await denied(read, mediaPath(f, f.locked.id) + suffix, 404, secrets);
  for (const suffix of ["", "?inline=1"])
    await denied(read, "/api/terraqo/professional-documents/" + f.document + suffix, 401, secrets);
}

export async function publicRecordReads(ctx: BrowserContext, f: RecordFixture, phase: (s: string) => void) {
  const read = asSession(ctx), secrets = recordSecrets(f);
  for (const path of [f.canonical, f.archive]) {
    phase(path === f.canonical ? "serialized-detail" : "serialized-archive");
    const response = await read(path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(f.title));
    excludes(html, secrets);
  }
  for (const isDetail of [false, true]) {
    phase(isDetail ? "detail-api" : "archive-api");
    const response = await read(isDetail ? "/api/v1/evidence/" + f.record : listPath(f));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    const body = await response.text();
    excludes(body, secrets);
    const { data } = JSON.parse(body);
    assert.equal(data.audience, "PUBLIC");
    if (!isDetail) assert.equal(data.items.length, 1);
    const item = isDetail ? data.item : data.items[0];
    assert.equal(item.id, f.record);
    assert.equal(item.title, f.title);
    assert.equal(item.summary, f.summary);
    assert.equal(item.createdAt, f.created.toISOString());
    assert.equal(item.occurredAt, f.occurred.toISOString());
    assert.deepEqual(item.capabilities, { view: true, edit: false, viewPreciseLocation: false });
    assert.deepEqual(item.media.map((m: { id: string }) => m.id), f.photos.map(p => p.id));
    assert.equal(item.validations.length, 1);
    assert.equal(item.validations[0].validatorName, f.validator);
    assert.equal(item.validations[0].resolvedAt, f.resolved.toISOString());
  }
  phase("normalized-media");
  for (const photo of f.photos) {
    for (const download of [false, true]) {
      const response = await read(mediaPath(f, photo.id) + (download ? "?download=1" : ""));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/webp");
      assert.match(response.headers.get("cache-control") || "", /no-store/);
      const disposition = response.headers.get("content-disposition") || "";
      assert.match(disposition, download ? /^attachment\b/ : /^inline\b/);
      excludes(disposition, secrets);
      assert.ok(photo.bytes.equals(Buffer.from(await response.arrayBuffer())), "Different bytes from S24 manifest");
    }
  }
  phase("locked-files");
  await checkLocked(read, f, secrets);
}

export async function withdrawnReads(ctx: BrowserContext, f: RecordFixture) {
  const read = asSession(ctx);
  const secrets = [...recordSecrets(f), f.title, f.summary, f.outcome, f.validator, ...f.photos.map(p => p.id)];
  await denied(read, f.canonical, 404, secrets);
  await denied(read, "/api/v1/evidence/" + f.record, 404, secrets);
  const list = await read(listPath(f));
  assert.equal(list.status, 200);
  const body = await list.text();
  excludes(body, [...secrets, f.record]);
  assert.deepEqual(JSON.parse(body).data.items, []);
  for (const photo of f.photos) {
    for (const suffix of ["", "?download=1"]) await denied(read, mediaPath(f, photo.id) + suffix, 404, secrets);
  }
  await checkLocked(read, f, secrets);
  // Social crawlers use a separate (blocking metadata) rendering path in Next.
  const crawler = await ctx.request.get(f.canonical, { maxRedirects: 0, headers: { "User-Agent": "Twitterbot/1.0" } });
  assert.equal(crawler.status(), 404);
  excludes(await crawler.text(), secrets);
  const page = await ctx.newPage();
  try {
    await page.goto(f.archive + "#" + f.record);
    await page.waitForURL(url => url.pathname === f.canonical && !url.hash);
    await page.waitForLoadState("load");
    excludes(await page.content(), secrets);
    const metadata = () => page.evaluate(() => ({
      title: document.title,
      descriptions: Array.from(document.querySelectorAll('meta[name="description"],meta[property^="og:"],meta[name^="twitter:"]'),
        tag => [tag.getAttribute("property") || tag.getAttribute("name"), tag.getAttribute("content")]),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
    }));
    const withdrawn = await metadata();
    // Unknown and withdrawn records must be indistinguishable in title, canonical and social previews.
    assert.equal((await page.goto(f.archive + "/absent-" + f.run))?.status(), 404);
    assert.deepEqual(withdrawn, await metadata());
  } finally { await page.close(); }
}
