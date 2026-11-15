import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { BrowserContext, Page } from "playwright";
import { compose, readPage } from "./s06-sharing-browser";
import type { SharingFixture } from "./s06-sharing-fixtures";
import { asSession, checkCv, checkSelection, denied, type Read } from "./s06-sharing-reads";

type InviteTarget = { email: string; expiresAt: string; download: boolean };
type Review = {
  id: string; collectionId: string; scopeHash: string; decision: string;
  snapshot: { destination: string; workspaceId: string; inviteTarget?: InviteTarget; listOnCv?: boolean;
    items: { revisionId: string; fields: Record<string, unknown>; mediaIds: string[] }[] };
};

export async function verifyCompany(input: {
  db: PrismaClient; origin: string; page: Page; fixture: SharingFixture; reviewer: BrowserContext;
  recipient: BrowserContext; anonymous: BrowserContext; fixedReader: Read; legacySlug: string;
}, destination: "public" | "invited") {
  const { db, origin, page, fixture, reviewer, recipient, anonymous, fixedReader, legacySlug } = input;
  const record = fixture.records[2];
  const invited = destination === "invited";
  const title = "Empresa " + destination + " " + fixture.run;
  const { id, reviewRequest } = await compose(page, origin, fixture, title, destination, [record], true);
  const root = "/api/v1/share-collections/" + id;
  const privateRoot = "/api/v1/shared-selections/" + id;
  const reviews = "/api/v1/publication-reviews";
  const options = { headers: { Origin: origin }, maxRedirects: 0 };
  const target: InviteTarget = invited ? reviewRequest.inviteTarget : {
    email: fixture.recipient + "@example.invalid", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), download: false,
  };
  assert.equal(target.email, fixture.recipient + "@example.invalid");
  assert.equal(target.download, false);
  assert.ok(Date.parse(target.expiresAt) > Date.now() + 300_000);
  assert.deepEqual(reviewRequest, { collectionId: id, expectedVersion: 1, ...(invited ? { inviteTarget: target } : { listOnCv: true }) });
  const owner = page.context();
  const grant = (to: InviteTarget) => owner.request.post(root + "/grants", { ...options,
    headers: { ...options.headers, "Idempotency-Key": randomUUID() }, data: { expectedVersion: 1, inviteEmail: to.email,
      expiresAt: to.expiresAt, scopes: to.download ? ["VIEW_COLLECTION", "DOWNLOAD_MEDIA"] : ["VIEW_COLLECTION"] } });
  const publish = () => owner.request.post(root + "/projection", { ...options, data: { expectedVersion: 1, listOnCv: true } });
  const noExposure = async () => {
    assert.equal(await db.terraqoPublicProjection.count({ where: { collectionId: id } }), 0);
    assert.equal(await db.terraqoAccessGrant.count({ where: { collectionId: id } }), 0);
    await denied(fixedReader, privateRoot, record);
  };
  // A 409 here must be a policy decision for the actual, current version.
  assert.equal((await grant(target)).status(), 409);
  assert.equal((await publish()).status(), 409);
  await noExposure();
  // Reload destroys the composer's in-memory retry operation. Resume only from the saved card.
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  const saved = card.getByRole("region", { name: "Confirmaciones de autorizaciones guardadas" });
  const resume = saved.getByRole("button", { name: invited ? "Confirmar acceso autorizado" : "Confirmar publicación autorizada", exact: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  await resume.waitFor();
  assert.equal(await resume.isEnabled(), false);
  const queue = await reviewer.request.get(reviews, options);
  assert.equal(queue.status(), 200);
  const rows = ((await queue.json()).data as Review[]).filter(row => row.collectionId === id);
  assert.equal(rows.length, 1);
  const [review] = rows;
  assert.equal(review.decision, "PENDING");
  assert.equal(review.snapshot.workspaceId, fixture.workspace);
  assert.equal(review.snapshot.destination, invited ? "INVITED_SELECTION" : "PUBLIC_SELECTION");
  assert.deepEqual(review.snapshot.inviteTarget, invited ? target : undefined);
  assert.equal(review.snapshot.listOnCv, invited ? undefined : true);
  assert.equal(review.snapshot.items.length, 1);
  const [item] = review.snapshot.items;
  assert.equal(item.revisionId, record.revision);
  assert.deepEqual(item.fields, { summary: record.summary });
  assert.deepEqual(item.mediaIds, [record.photo!.id]);
  const decision = { reviewId: review.id, payload: { decision: "APPROVED", confirmed: true, scopeHash: review.scopeHash } };
  assert.equal((await recipient.request.patch(reviews, { ...options, data: decision })).status(), 403);
  const reviewPage = await reviewer.newPage();
  try {
    await reviewPage.goto(origin + "/admin/publicaciones", { waitUntil: "domcontentloaded" });
    await reviewPage.getByRole("button").filter({ hasText: title }).click();
    const preview = reviewPage.getByRole("region", { name: "Vista previa del material solicitado" });
    await preview.getByText(record.summary, { exact: true }).waitFor();
    assert.equal(await preview.getByText(record.title, { exact: true }).count(), 0);
    if (invited) {
      const terms = reviewPage.locator("p").filter({ hasText: target.email });
      await terms.waitFor();
      const text = await terms.innerText();
      const expiry = await reviewPage.evaluate(iso => new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima" }), target.expiresAt);
      assert.ok(text.includes(expiry));
      assert.match(text, /solo lectura/i);
    } else await reviewPage.getByText(/selección visible en el CV público/i).waitFor();
    await preview.getByRole("img").evaluate(el => (el as HTMLImageElement).decode());
    const approve = reviewPage.getByRole("button", { name: "Autorizar selección", exact: true });
    assert.equal(await approve.isEnabled(), false);
    await reviewPage.getByRole("checkbox", { name: /He revisado esta versión/ }).check();
    const [approved] = await Promise.all([
      reviewPage.waitForResponse(r => r.url() === origin + reviews && r.request().method() === "PATCH"), approve.click(),
    ]);
    assert.equal(approved.status(), 200);
    assert.deepEqual(approved.request().postDataJSON(), decision);
  } finally { await reviewPage.close(); }
  await noExposure();
  if (invited) {
    assert.equal((await publish()).status(), 409);
    for (const mismatch of [{ ...target, email: fixture.reviewer + "@example.invalid" },
      { ...target, expiresAt: new Date(Date.parse(target.expiresAt) + 60_000).toISOString() }, { ...target, download: true }]) {
      assert.equal((await grant(mismatch)).status(), 409);
    }
  } else {
    assert.equal((await grant(target)).status(), 409);
  }
  await noExposure();
  await page.reload({ waitUntil: "domcontentloaded" });
  await resume.waitFor();
  assert.ok(await resume.isEnabled());
  if (invited) {
    await saved.getByText(target.email, { exact: true }).waitFor();
    assert.equal(await saved.locator("time").getAttribute("datetime"), target.expiresAt);
    await saved.getByText("Ver selección · Sin descarga", { exact: true }).waitFor();
  }
  const [confirmed] = await Promise.all([
    page.waitForResponse(r => r.url() === origin + root + (invited ? "/grants" : "/projection") && r.request().method() === "POST"),
    resume.click(),
  ]);
  assert.equal(confirmed.status(), invited ? 201 : 200);
  assert.deepEqual(confirmed.request().postDataJSON(), invited ?
    { expectedVersion: 1, inviteEmail: target.email, expiresAt: target.expiresAt, scopes: ["VIEW_COLLECTION"] } :
    { expectedVersion: 1, listOnCv: true });
  const result = (await confirmed.json()).data;
  const expectedPath = invited ? "/portal/selecciones/" + id : "/selecciones/" + result.slug;
  const savedLink = saved.getByLabel("Enlace del destino confirmado");
  await savedLink.waitFor();
  assert.equal(await savedLink.inputValue(), origin + expectedPath);
  const read = invited ? fixedReader : asSession(anonymous);
  const accessRoot = invited ? privateRoot : "/api/v1/public/selections/" + result.slug;
  await checkSelection(read, accessRoot, [record]);
  await readPage(invited ? recipient : anonymous, invited ? "/portal/selecciones/" + id : "/selecciones/" + result.slug, record);
  if (invited) {
    assert.equal(result.grant.inviteEmail, target.email);
    assert.equal(result.grant.expiresAt, target.expiresAt);
    assert.deepEqual(result.grant.scopes, ["VIEW_COLLECTION"]);
    await denied(asSession(reviewer), privateRoot, record);
    assert.equal(await db.terraqoPublicProjection.count({ where: { collectionId: id } }), 0);
  } else await checkCv(anonymous, origin, fixture.username, [result.slug], [legacySlug]);
  assert.equal((await reviewer.request.delete(reviews, { ...options, data: { reviewId: review.id, reason: "Retiro sintético S06" } })).status(), 200);
  await denied(read, accessRoot, record);
  if (!invited) await checkCv(anonymous, origin, fixture.username, [], [result.slug, legacySlug]);
}
