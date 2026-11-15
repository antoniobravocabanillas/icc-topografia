import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { BrowserContext, Page } from "playwright";
import { publicCaseRecordHref, publicWorkCaseHref } from "../../lib/terraqo/public-cv-permalink";
import type { SharingFixture, SharingRecord } from "./s06-sharing-fixtures";
import { asSession } from "./s06-sharing-reads";
import { exactImage, excludes } from "./s09-visitor-reads";

export async function scopedCase(db: PrismaClient, fixture: SharingFixture, profileId: string, origin: string,
  owner: BrowserContext, reviewer: BrowserContext, page: Page, records: SharingRecord[], excludedMedia: string) {
  const { run, username, workspace } = fixture;
  const groupId = "s09-case-" + run;
  const groupTitle = "Grupo interno " + run;
  const group = { id: groupId, createdById: fixture.owner, professionalProfileId: profileId, workspaceId: workspace };
  const read = asSession(page.context());
  const request = { maxRedirects: 0, headers: { Origin: origin } };
  try {
    const { collection, workCase } = await db.$transaction(async tx => {
      const updated = await tx.terraqoWorklogEntry.updateMany({ where: { id: records[0].id,
        professionalProfileId: profileId, authorId: fixture.owner, workspaceId: null }, data: { workspaceId: workspace } });
      assert.equal(updated.count, 1);
      const collection = await tx.terraqoShareCollection.create({ data: {
        professionalProfileId: profileId, createdById: fixture.owner, title: "Caso de nivelación " + run,
        operationKey: randomUUID(), operationFingerprint: randomUUID(),
        items: { create: records.map((record, sortOrder) => ({
          revisionId: record.revision, sortOrder, allowedFields: ["summary"], includeMedia: true, mediaIds: [record.photo!.id],
        })) },
      } });
      const workCase = await tx.terraqoWorkCase.create({ data: { ...group, title: groupTitle, lifecycle: "ACTIVE",
        records: { create: records.map(r => ({ worklogId: r.id, relationshipStatus: "CONFIRMED",
          confirmedAt: new Date(), confirmedById: fixture.owner })) } }, select: { id: true, version: true } });
      return { collection, workCase };
    });
    const reviews = "/api/v1/publication-reviews";
    const proposal = { expectedVersion: collection.version, workCase };
    const requested = await owner.request.post(reviews, { ...request, data: { collectionId: collection.id, ...proposal } });
    assert.equal(requested.status(), 200);
    const rows = (await requested.json()).data;
    assert.equal(rows.length, 1);
    const [review] = rows;
    assert.match(review.scopeHash, /^[a-f0-9]{64}$/);
    const publish = () => owner.request.post("/api/v1/share-collections/" + collection.id + "/projection", { ...request, data: proposal });
    assert.equal((await publish()).status(), 409);
    assert.equal((await reviewer.request.patch(reviews, { ...request, data: { reviewId: review.id,
      payload: { decision: "APPROVED", confirmed: true, scopeHash: review.scopeHash } } })).status(), 200);
    const published = await publish();
    assert.equal(published.status(), 200);
    const slug: string = (await published.json()).data.slug;
    const path = publicWorkCaseHref(username, slug);
    const access = "/api/public/cv/" + username + "/trabajos/" + slug;
    const imagePath = (id: string) => access + "/media/" + id;
    const canaries = [groupTitle, excludedMedia, ...records.map(r => r.title)];
    const cv = "/cv/" + username;
    await page.goto(origin + cv);
    await page.locator('a[href="' + path + '"]').click();
    await page.waitForURL(origin + path);
    const scopedDetails = [];
    for (const record of records) {
      const detail = publicCaseRecordHref(username, slug, record.id, record.revision);
      scopedDetails.push(detail);
      const img = record.photo!;
      await page.locator('a[href="' + detail + '"]').click();
      await page.waitForURL(origin + detail);
      await page.getByText(record.summary, { exact: true }).waitFor();
      assert.deepEqual(await page.locator("article dl dt").allTextContents(), ["Contribución"]);
      await page.locator('img[src="' + imagePath(img.id) + '"]').first().evaluate(node => (node as HTMLImageElement).decode());
      excludes(await page.content(), canaries);
      const html = await read(detail);
      assert.equal(html.status, 200);
      excludes(await html.text(), canaries);
      await exactImage(read, imagePath(img.id), img.bytes);
      // An approved case authorizes its snapshot only, including when the source has the PUBLIC flag.
      for (const raw of [cv + "/evidencias/" + record.id, "/api/v1/evidence/" + record.id,
        "/api/public/cv/" + username + "/worklogs/" + img.id]) assert.equal((await read(raw)).status, 404);
      await page.getByRole("link", { name: "Volver al trabajo" }).click();
      await page.waitForURL(origin + path);
    }
    assert.equal((await read(imagePath(excludedMedia))).status, 404);
    assert.equal((await read(publicCaseRecordHref(username, slug, records[0].id, records[1].revision))).status, 404);
    assert.equal((await reviewer.request.delete(reviews, { ...request, data: { reviewId: review.id, reason: "Retiro S09" } })).status(), 200);
    for (const target of [path, access, ...scopedDetails, ...records.map(r => imagePath(r.photo!.id))])
      assert.equal((await read(target)).status, 404);
    const refreshed = await read(cv);
    assert.equal(refreshed.status, 200);
    excludes(await refreshed.text(), [path, collection.title, groupTitle]);
  } finally {
    await db.terraqoWorkCase.deleteMany({ where: group });
    assert.equal(await db.terraqoWorkCaseRecord.count({ where: { workCaseId: groupId } }), 0);
    assert.equal(await db.terraqoWorkCase.count({ where: { id: groupId } }), 0);
  }
}
