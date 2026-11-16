import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { BrowserContext, Page } from "playwright";
import { imageRow, type DiscoveryFixture } from "./s13-discovery-fixture";

type Row = {
  worklogId: string; revisionId: string; professionalProfileId: string; needRevisionId: string;
  title: string; previewHref: string | null; professionalHref: string | null; evidenceHref: string | null; availability: string | null;
  accessKind: string; accessReferenceId: string; reasons: { activityTerms: string[] }; missingRequired: string[];
};
type Filters = Partial<Record<"activity" | "context" | "availability" | "from" | "to", string>>;

export async function discoveryJourney(page: Page, publisher: BrowserContext, db: PrismaClient, f: DiscoveryFixture,
  origin: string, revisions: string[], phase: (value: string) => void) {
  const endpoint = "/api/v1/work-needs/" + f.need + "/discover", dossiers = "/api/v1/evaluation-dossiers";
  const errors: string[] = [];
  page.on("pageerror", err => errors.push(err.name));
  const explorer = page.getByRole("region", { name: "Explorar experiencia relacionada" });
  const article = (title: string) => explorer.getByRole("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  const button = (name: string) => explorer.getByRole("button", { name, exact: true });
  const responseFor = (path: string, method: string) => page.waitForResponse(r => {
    const url = new URL(r.url());
    return url.origin === origin && url.pathname === path && r.request().method() === method;
  });
  async function search(filters: Filters = {}) {
    await explorer.getByLabel("Actividad pertinente").fill(filters.activity ?? "");
    await explorer.getByLabel("Contexto del trabajo").fill(filters.context ?? "");
    await explorer.getByLabel("Disponibilidad declarada").selectOption(filters.availability ?? "");
    await explorer.getByLabel("Trabajo desde").fill(filters.from ?? "");
    await explorer.getByLabel("Trabajo hasta").fill(filters.to ?? "");
    const [res] = await Promise.all([responseFor(endpoint, "GET"), button("Aplicar filtros").click()]);
    assert.equal(res.status(), 200);
    assert.deepEqual(Object.fromEntries(new URL(res.url()).searchParams), filters);
    const { data } = await res.json();
    assert.ok(Array.isArray(data));
    await explorer.locator('[role="status"]').filter({ hasText: /trabajos? relacionados?/ }).or(
      explorer.getByRole("heading", { name: "Sin trabajos con estos criterios" })).waitFor();
    assert.equal(await explorer.getByRole("article").count(), data.length);
    return data as Row[];
  }
  async function fits(width: number) {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 812 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "S13 overflow at " + width);
  }
  async function expectOnly(filters: Filters, ...expected: string[]) {
    assert.deepEqual((await search(filters)).map(r => r.revisionId).sort(), expected.sort());
  }

  phase("role-boundary");
  const publisherView = await publisher.request.get(dossiers, { maxRedirects: 0 });
  assert.equal(publisherView.status(), 403);

  phase("company-discovery");
  await page.setViewportSize({ width: 1440, height: 960 });
  assert.equal((await page.goto(origin + "/admin/necesidades", { waitUntil: "domcontentloaded", timeout: 120_000 }))?.status(), 200);
  await explorer.getByRole("heading", { name: "Explora a partir de tu necesidad" }).waitFor();
  // The editor still displays v1. Only the discovery result knows the new need revision.
  const active = await db.$transaction(async tx => {
    const rev = await tx.terraqoWorkNeedRevision.create({ data: { needId: f.need, revisionNo: 2, createdById: f.owner,
      title: f.term, problem: f.term, activities: [f.term], operationKey: randomUUID(), operationFingerprint: f.run,
      contentHash: f.run, requirements: { create: { label: f.missing, priority: "REQUIRED" } } } });
    await tx.terraqoWorkNeed.update({ where: { id: f.need, workspaceId: f.workspace }, data: { currentRevisionId: rev.id, version: 2 } });
    return rev.id;
  });
  revisions.push(active);
  const initial = await search();
  assert.equal(initial.length, 3);
  const pair = initial.filter(r => [f.first.revision, f.second.revision].includes(r.revisionId));
  assert.equal(pair.length, 1);
  assert.ok(initial.some(r => r.revisionId === f.solo.revision));
  const scoped = initial.find(r => r.revisionId === f.limited.revision);
  assert.ok(scoped);
  assert.ok(!JSON.stringify(initial).includes(f.hidden));
  assert.ok(!JSON.stringify(initial).includes(f.privateRecord.revision));
  assert.equal(scoped.accessKind, "PUBLIC_SELECTION");
  assert.equal(scoped.accessReferenceId, f.projection);
  assert.equal(scoped.professionalHref, null);
  assert.equal(scoped.availability, null);
  assert.equal(scoped.previewHref, null);
  assert.equal(await article(scoped.title).locator("img").count(), 0);
  assert.equal(scoped.evidenceHref, "/selecciones/" + f.username);
  for (const field of ["summary", "locationLabel", "occurredAt"]) assert.ok(!(field in scoped));
  for (const row of initial) {
    assert.equal(row.needRevisionId, active);
    assert.ok(row.reasons.activityTerms.includes(f.term));
    assert.deepEqual(row.missingRequired, [f.missing]);
    assert.ok(!Object.keys(row).some(key => /score/i.test(key)));
    const card = article(row.title);
    await card.getByRole("heading", { name: "Por qué coincide" }).waitFor();
    await card.getByText(f.term, { exact: true }).waitFor();
    await card.getByText(f.missing, { exact: true }).waitFor();
    if (row.accessKind === "PUBLIC_CV") {
      assert.equal(row.availability, "AVAILABLE");
      assert.equal(row.professionalHref, "/cv/" + f.username);
      assert.equal(row.evidenceHref, row.professionalHref + "/evidencias/" + row.worklogId);
      assert.equal(await card.getByRole("link", { name: /Profesional S13/ }).getAttribute("href"), origin + row.professionalHref);
    } else {
      await card.getByText("Identidad profesional no publicada").waitFor();
      assert.equal(await card.getByRole("link").count(), 1);
    }
    assert.equal(await card.getByRole("link", { name: /Abrir fuente/ }).getAttribute("href"), origin + row.evidenceHref);
  }
  phase("authorized-image");
  const solo = initial.find(row => row.revisionId === f.solo.revision);
  const preview = "/api/public/cv/" + f.username + "/worklogs/" + f.photoId;
  assert.equal(solo?.previewHref, preview);
  const image = article(f.solo.title).locator("img");
  await image.scrollIntoViewIfNeeded();
  const rendered = await image.evaluate(async element => {
    const photo = element as HTMLImageElement;
    await photo.decode();
    return { width: photo.naturalWidth, height: photo.naturalHeight, url: photo.currentSrc };
  });
  assert.ok(rendered.width > 0 && rendered.height > 0);
  assert.equal(rendered.url, origin + preview);
  for (const download of [false, true]) {
    const response = await page.request.get(preview + (download ? "?download=1" : ""), { maxRedirects: 0 });
    assert.equal(response.status(), 200);
    const headers = response.headers();
    assert.equal(headers["content-type"], "image/webp");
    assert.match(headers["cache-control"] ?? "", /no-store/);
    assert.match(headers["content-disposition"] ?? "", download ? /^attachment\b/ : /^inline\b/);
    assert.ok(f.plan.bytes.equals(await response.body()), "S13 media differs from the S24 manifest");
  }
  await fits(1440);

  phase("duplicate-work-and-media");
  const alternate = pair[0].revisionId === f.first.revision ? f.second : f.first;
  await db.terraqoWorklogMedia.createMany({ data: f.additionalPhotos.map((blob, index) => imageRow(alternate.id, blob, index)) });
  assert.deepEqual((await search()).map(r => r.revisionId), initial.map(r => r.revisionId));

  phase("filters-and-lima-boundary");
  await fits(375);
  await expectOnly({ activity: "Replanteo" }, f.first.revision);
  await expectOnly({ context: "Cantera" }, f.second.revision);
  await expectOnly({ availability: "AVAILABLE" }, pair[0].revisionId, f.solo.revision);
  await expectOnly({ availability: "WORKING" });
  await expectOnly({ from: "2026-02-11", to: "2026-02-11" }, f.first.revision);
  await expectOnly({ from: "2026-02-12", to: "2026-02-12" }, f.second.revision);
  await expectOnly({ activity: "Replanteo", context: "Cantera" });
  await expectOnly({ context: f.hidden });
  await explorer.getByText(/amplía el periodo/i).waitFor();
  await fits(320);

  phase("save-exact-scope");
  await expectOnly({ activity: "Deslinde" }, f.limited.revision);
  const selection = article(scoped.title).getByRole("button", { name: /Seleccionar trabajo/ });
  await selection.click();
  const save = page.getByRole("button", { name: /^Crear expediente ·/ });
  const [created] = await Promise.all([responseFor(dossiers, "POST"), save.click()]);
  assert.equal(created.status(), 201);
  assert.deepEqual(created.request().postDataJSON(), { needRevisionId: active, professionalProfileId: f.scopedProfile,
    worklogRevisionIds: [scoped.revisionId], sourceRefs: [{ revisionId: scoped.revisionId,
      accessKind: scoped.accessKind, accessReferenceId: scoped.accessReferenceId }] });
  const dossierId: string = (await created.json()).data.id;
  const saved = await db.terraqoEvaluationDossier.findFirstOrThrow({ where: { id: dossierId, workspaceId: f.workspace, createdById: f.owner },
    include: { sources: true } });
  assert.equal(saved.needRevisionId, active);
  assert.equal(saved.professionalProfileId, f.scopedProfile);
  assert.equal(saved.sources.length, 1);
  const [source] = saved.sources;
  assert.equal(source.worklogRevisionId, f.limited.revision);
  assert.equal(source.accessKind, "PUBLIC_SELECTION");
  assert.equal(source.accessReferenceId, f.projection);
  assert.deepEqual(source.accessSnapshot, { checkedAt: (source.accessSnapshot as { checkedAt: string }).checkedAt,
    revisionHash: f.limited.contentHash, accessKind: source.accessKind, accessReferenceId: f.projection, allowedFields: ["title"] });
  assert.equal(saved.privateSummary, null);
  // Model an existing derived summary without invoking an external analysis provider.
  const summary = "Resumen derivado de " + scoped.title;
  await db.terraqoEvaluationDossier.update({ where: { id: dossierId, createdById: f.owner }, data: { privateSummary: summary } });
  const before = await page.request.get(dossiers, { maxRedirects: 0 });
  assert.equal(before.status(), 200);
  const [visible] = (await before.json()).data;
  assert.equal(visible.id, dossierId);
  assert.equal(visible.privateSummary, summary);
  assert.ok(!JSON.stringify(visible).includes(f.hidden));
  assert.equal(visible.sources[0].worklogRevision.title, scoped.title);
  const displayedSources = page.locator("#evaluation-sources");
  await displayedSources.getByText(scoped.title, { exact: true }).waitFor();
  await selection.click();
  await save.waitFor();

  phase("publisher-revocation");
  const revoked = await publisher.request.delete("/api/v1/share-collections/" + f.collection + "/projection",
    { data: { expectedVersion: 1 }, headers: { Origin: origin }, maxRedirects: 0 });
  assert.equal(revoked.status(), 200);
  assert.equal((await revoked.json()).data.revoked, true);
  // Revalidate the stale selection through its normal save action; the independent grant remains active.
  await save.click();
  await explorer.getByRole("heading", { name: "Sin trabajos con estos criterios" }).waitFor();
  await page.getByText(/fuente\(s\) perdieron autorización/).waitFor();
  assert.equal(await explorer.getByRole("article").count(), 0);
  assert.equal(await page.getByText(scoped.title, { exact: true }).count(), 0);
  assert.equal(await save.count(), 0);
  const listed = await page.request.get(dossiers, { maxRedirects: 0 });
  assert.equal(listed.status(), 200);
  const rows = (await listed.json()).data;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, dossierId);
  assert.equal(rows[0].effectiveAnalysisStatus, "SOURCE_REVOKED");
  assert.equal(rows[0].revokedSourceCount, 1);
  assert.deepEqual(rows[0].sources, []);
  assert.equal(rows[0].privateSummary, null);
  assert.ok(!JSON.stringify(rows).includes(scoped.title));
  assert.equal(await db.terraqoEvaluationDossier.count({ where: { workspaceId: f.workspace, createdById: f.owner } }), 1);
  // A transport retry of the original save must recheck the pinned exposure even when its key already exists.
  const operationKey = await created.request().headerValue("idempotency-key");
  assert.ok(operationKey);
  const retried = await page.request.post(dossiers, { data: created.request().postDataJSON(),
    headers: { Origin: origin, "Idempotency-Key": operationKey }, maxRedirects: 0 });
  assert.equal(retried.status(), 409);
  assert.equal(await db.terraqoEvaluationSource.count({ where: { addedById: f.owner } }), 1);
  await expectOnly({}, pair[0].revisionId, f.solo.revision);
  assert.deepEqual(errors, []);
}
