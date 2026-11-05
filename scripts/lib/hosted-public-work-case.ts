import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { BrowserContext } from "playwright";
import {
  publicCaseRecordHref,
  publicWorkCaseHref,
  publicWorkCaseListHref,
} from "../../lib/terraqo/public-cv-permalink";
import { checkReviewSnapshot, type S24Selection } from "./s24-acceptance";

type Input = {
  db: PrismaClient;
  origin: URL;
  ownerContext: BrowserContext;
  reviewerContext: BrowserContext;
  anonymous: BrowserContext;
  selection: S24Selection;
  workspaceId: string;
  priorReviewId: string;
};

type CaseTarget = { id: string; version: number };
type Review = { id: string; scopeHash: string; collectionVersion: number };

// Only the guarded S24 runner supplies the fixture, database and signed-in sessions.
// The parent owns collection/review/blob cleanup. We own exactly one private group.
export async function checkHostedPublicWorkCase({
  db, origin, ownerContext, reviewerContext, anonymous, selection, workspaceId, priorReviewId,
}: Input) {
  const { collection, records } = selection;
  const group = {
    id: randomUUID(), professionalProfileId: collection.professionalProfileId,
    createdById: collection.createdById, workspaceId,
  };
  const groupTitle = `Agrupación privada de prueba ${group.id}`;
  const absolute = (path: string) => new URL(path, origin).href;
  const options = { headers: { Origin: origin.origin }, maxRedirects: 0, timeout: 30_000 };
  const reviewUrl = absolute("/api/v1/publication-reviews");
  const publishUrl = absolute(`/api/v1/share-collections/${collection.id}/projection`);
  const get = (path: string) => anonymous.request.get(absolute(path), { maxRedirects: 0, timeout: 30_000 });
  const current = () => db.terraqoShareCollection.findFirstOrThrow({
    where: { id: collection.id, createdById: group.createdById, professionalProfileId: group.professionalProfileId },
    select: { version: true, professionalProfile: { select: { username: true, liveCvEnabled: true } } },
  });

  async function requestReview(version: number, workCase?: CaseTarget) {
    const response = await ownerContext.request.post(reviewUrl, {
      ...options, data: { collectionId: collection.id, expectedVersion: version, workCase },
    });
    assert.equal(response.status(), 200);
    const rows: Review[] = (await response.json()).data;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].collectionVersion, version);
    assert.ok(rows[0].id && rows[0].scopeHash);
    return rows[0];
  }

  async function approve(review: Review) {
    const response = await reviewerContext.request.patch(reviewUrl, {
      ...options, data: { reviewId: review.id, payload: {
        decision: "APPROVED", confirmed: true, scopeHash: review.scopeHash,
      } },
    });
    assert.equal(response.status(), 200);
  }

  async function publish(version: number, workCase?: CaseTarget) {
    return ownerContext.request.post(publishUrl, {
      ...options, data: { expectedVersion: version, workCase },
    });
  }

  async function revokeReview(review: Review) {
    const response = await reviewerContext.request.delete(reviewUrl, {
      ...options, data: { reviewId: review.id, reason: "Retiro de la aceptación S24" },
    });
    assert.equal(response.status(), 200);
  }

  let stage = "fixture preconditions";
  let attemptedCreate = false;
  try {
    const prior = await db.terraqoPublicationReview.findFirstOrThrow({
      where: { id: priorReviewId, collectionId: collection.id, workspaceId,
        requestedById: group.createdById, decision: "APPROVED", revokedAt: { not: null } },
      select: { collectionVersion: true },
    });
    const root = await current();
    const username = root.professionalProfile.username;
    assert.ok(username && root.professionalProfile.liveCvEnabled);
    assert.ok(root.version > prior.collectionVersion);
    assert.equal(records.length, 2);
    assert.equal(new Set(records.map(record => record.worklogId)).size, 2);
    const sources = await db.terraqoWorklogRevision.findMany({
      where: { id: { in: records.map(record => record.revisionId) },
        worklog: { professionalProfileId: group.professionalProfileId, authorId: group.createdById,
          workspaceId, visibility: "PRIVATE", lifecycle: "PUBLISHED", deletedAt: null } },
      select: { id: true, worklogId: true, title: true, outcome: true, worklog: { select: { locationLabel: true } } },
    });
    assert.equal(sources.length, 2);
    // The previous S24 phase changed a live location after its original approval.
    // A fresh review must pin the current authorized value, never the old approval.
    const freshSelection: S24Selection = { collection, records: records.map(record => {
      const source = sources.find(row => row.id === record.revisionId && row.worklogId === record.worklogId);
      assert.ok(source);
      if (!record.fields.locationLabel) return record;
      assert.ok(source.worklog.locationLabel);
      return { ...record, fields: { ...record.fields, locationLabel: source.worklog.locationLabel } };
    }) };
    const forbidden = [groupTitle, ...records.map(record => record.excluded.id),
      ...sources.flatMap(source => [source.title, source.outcome]),
      sources.find(source => source.id === records[1].revisionId)?.worklog.locationLabel];
    assert.ok(forbidden.every(value => typeof value === "string" && value.length > 0));
    const checkPublicBody = (body: string) => {
      for (const value of forbidden) assert.ok(!body.includes(value!));
    };

    stage = "private group setup";
    assert.equal(await db.terraqoWorkCase.count({ where: { id: group.id } }), 0);
    attemptedCreate = true; // Includes a lost response after a successful nested create.
    const target = await db.terraqoWorkCase.create({
      data: { ...group, title: groupTitle, lifecycle: "ACTIVE", records: { create: records.map(record => ({
        worklogId: record.worklogId, relationshipStatus: "CONFIRMED", confirmedAt: new Date(), confirmedById: group.createdById,
      })) } },
      select: { id: true, version: true },
    });

    stage = "ordinary publication with private overlap";
    const ordinary = await requestReview(root.version);
    await approve(ordinary);
    assert.equal((await publish(root.version, target)).status(), 409);
    const normalResponse = await publish(root.version);
    assert.equal(normalResponse.status(), 200);
    const normalSlug: string = (await normalResponse.json()).data.slug;
    assert.ok(normalSlug);
    const selectionResponse = await get(`/api/v1/public/selections/${encodeURIComponent(normalSlug)}`);
    assert.equal(selectionResponse.status(), 200);
    const normalItems = (await selectionResponse.json()).data.items;
    assert.deepEqual(normalItems.map((item: { worklogId: string }) => item.worklogId), records.map(record => record.worklogId));

    const cv = `/cv/${encodeURIComponent(username)}`;
    const list = publicWorkCaseListHref(username);
    const ordinaryCasePath = publicWorkCaseHref(username, normalSlug);
    for (const path of [cv, list]) {
      const response = await get(path);
      assert.equal(response.status(), 200);
      const html = await response.text();
      checkPublicBody(html);
      assert.ok(!html.includes(ordinaryCasePath) && !html.includes(collection.title));
    }
    assert.equal((await get(ordinaryCasePath)).status(), 404);
    await revokeReview(ordinary);

    stage = "explicit case proposal and fresh company approval";
    const next = await current();
    assert.ok(next.version > root.version);
    assert.equal((await publish(root.version, target)).status(), 409);
    const review = await requestReview(next.version, target);
    assert.ok(review.id !== ordinary.id && review.scopeHash !== ordinary.scopeHash);
    assert.equal((await publish(next.version, target)).status(), 409);
    const queue = await reviewerContext.request.get(reviewUrl, options);
    assert.equal(queue.status(), 200);
    const row = (await queue.json()).data.find((entry: Review) => entry.id === review.id);
    assert.ok(row && row.decision === "PENDING" && row.scopeHash === review.scopeHash);
    assert.match(row.snapshot.workCaseScope, /^[a-f0-9]{64}$/);
    checkReviewSnapshot(row.snapshot, freshSelection);
    await approve(review);
    const result = await publish(next.version, target);
    assert.equal(result.status(), 200);
    const slug: string = (await result.json()).data.slug;
    assert.ok(slug && slug !== normalSlug);
    const casePath = publicWorkCaseHref(username, slug);
    const access = `/api/public/cv/${encodeURIComponent(username)}/trabajos/${encodeURIComponent(slug)}`;
    const imagePath = (id: string) => `${access}/media/${encodeURIComponent(id)}`;
    const detailPaths = records.map(record => publicCaseRecordHref(username, slug, record.worklogId, record.revisionId));

    stage = "scoped routes and exact media";
    await Promise.all([cv, list, casePath, ...detailPaths].map(async path => {
      const response = await get(path);
      assert.equal(response.status(), 200);
      checkPublicBody(await response.text());
    }));
    for (const { worklogId, selected, excluded } of records) {
      const image = await get(imagePath(selected.id));
      assert.equal(image.status(), 200);
      assert.equal(image.headers()["content-type"], "image/webp");
      assert.match(image.headers()["cache-control"] ?? "", /no-store/);
      assert.ok(selected.bytes.equals(await image.body()));
      assert.equal((await get(imagePath(excluded.id))).status(), 404);
      assert.equal((await get(`${cv}/evidencias/${encodeURIComponent(worklogId)}`)).status(), 404);
    }
    assert.equal((await get(publicCaseRecordHref(username, slug, records[0].worklogId, records[1].revisionId))).status(), 404);

    stage = "anonymous CV, case, evidence and history";
    const page = await anonymous.newPage();
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(30_000);
    try {
      await page.goto(absolute(cv));
      await page.locator(`a[href="${casePath}"]`).waitFor();
      await page.getByRole("link", { name: "Ver todos los trabajos" }).click();
      await page.waitForURL(absolute(list));
      await page.locator(`a[href="${casePath}"]`).click();
      await page.waitForURL(absolute(casePath));
      const heading = page.getByRole("heading", { level: 1, name: collection.title, exact: true });
      await heading.waitFor();
      for (const [index, record] of freshSelection.records.entries()) {
        const href = detailPaths[index];
        await page.locator(`a[href="${href}"]`).click();
        await page.waitForURL(absolute(href));
        await page.getByText(record.fields.summary, { exact: true }).waitFor();
        await page.reload();
        await page.getByText(record.fields.summary, { exact: true }).waitFor();
        if (record.fields.locationLabel) await page.getByText(record.fields.locationLabel, { exact: true }).waitFor();
        assert.deepEqual(await page.locator("article dl dt").allTextContents(),
          record.fields.locationLabel ? ["Ubicación", "Contribución"] : ["Contribución"]);
        await page.locator(`img[src="${imagePath(record.selected.id)}"]`).first().waitFor();
        checkPublicBody(await page.locator("body").innerText());
        await page.goBack();
        await page.waitForURL(absolute(casePath));
        await heading.waitFor();
      }
      stage = "withdrawn case routes and media";
      await revokeReview(review);
      await Promise.all([casePath, access, ...detailPaths, ...records.map(record => imagePath(record.selected.id))].map(async path => {
        assert.equal((await get(path)).status(), 404);
      }));
      const withdrawnCv = await get(cv);
      assert.equal(withdrawnCv.status(), 200);
      assert.ok(!(await withdrawnCv.text()).includes(casePath));
      await page.goto(absolute(list));
      await page.getByText("No hay trabajos agrupados disponibles.", { exact: true }).waitFor();
      assert.equal(await page.locator(`a[href="${casePath}"]`).count(), 0);
    } finally {
      await page.close();
    }
  } catch {
    // Browser/driver exceptions can embed headers, URLs, HTML or connection details.
    throw new Error(`Hosted WorkCase check failed during ${stage}.`);
  } finally {
    if (attemptedCreate) {
      try {
        await db.terraqoWorkCase.deleteMany({ where: group });
        assert.equal(await db.terraqoWorkCase.count({ where: { id: group.id } }), 0);
        assert.equal(await db.terraqoWorkCaseRecord.count({ where: { workCaseId: group.id } }), 0);
      } catch {
        throw new Error("Hosted WorkCase fixture cleanup failed.");
      }
    }
  }
  console.log("PASS S24 hosted WorkCase scope, navigation, withdrawal and exact group cleanup.");
}
