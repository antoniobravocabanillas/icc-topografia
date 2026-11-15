import assert from "node:assert/strict";
import type { Browser, BrowserContext, Page } from "playwright";
import type { SharingFixture, SharingRecord } from "./s06-sharing-fixtures";

export async function sharingSession(browser: Browser, origin: string, id?: string, password?: string) {
  const ctx = await browser.newContext({ baseURL: origin, serviceWorkers: "block" });
  ctx.setDefaultTimeout(45_000);
  await ctx.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  if (id) {
    const options = { maxRedirects: 0, timeout: 45_000 };
    const csrf = await ctx.request.get("/api/auth/csrf", options);
    assert.equal(csrf.status(), 200);
    const { csrfToken } = await csrf.json();
    assert.ok(typeof csrfToken === "string" && csrfToken);
    const email = id + "@example.invalid";
    const callback = await ctx.request.post("/api/auth/callback/credentials", { ...options,
      headers: { Origin: origin, "X-Auth-Return-Redirect": "1" }, form: { csrfToken, email, password: password!, callbackUrl: origin + "/portal" } });
    assert.equal(callback.status(), 200);
    const session = await ctx.request.get("/api/auth/session", options);
    assert.equal(session.status(), 200);
    const { user } = await session.json();
    assert.equal(user?.id, id);
    assert.equal(user.email, email);
  }
  return ctx;
}

export async function compose(page: Page, origin: string, fixture: SharingFixture, name: string,
  destination: "private" | "invited" | "public", records: SharingRecord[], needsReview = false) {
  await page.goto(origin + "/portal/selecciones", { waitUntil: "domcontentloaded" });
  const mode = (value: string) => page.locator('input[type="radio"][name="sharing-destination"][value="' + value + '"]');
  await mode("private").waitFor();
  assert.ok(await mode("private").isChecked());
  for (const record of records) {
    const card = page.getByRole("region", { name: "Publicar y compartir selección" }).getByRole("article").filter({ has: page.getByText(record.title, { exact: true }) });
    await card.getByRole("checkbox", { name: new RegExp(record.title) }).check();
    await card.getByRole("checkbox", { name: "Descripción", exact: true }).check();
    if (record.photo && destination !== "private") await card.getByRole("checkbox", { name: "Incluir archivos normalizados" }).check();
  }
  await mode(destination).check();
  await page.getByLabel("Nombre de la selección", { exact: true }).fill(name);
  if (destination === "invited") await page.getByLabel("Correo de la persona invitada", { exact: true }).fill(fixture.recipient + "@example.invalid");
  const root = origin + "/api/v1/share-collections";
  const [created, permission] = await Promise.all([
    page.waitForResponse(r => r.url() === root && r.request().method() === "POST"),
    destination === "private" ? undefined : page.waitForResponse(r => r.request().method() === "POST" &&
      (needsReview ? r.url() === origin + "/api/v1/publication-reviews" :
        r.url().startsWith(root + "/") && r.url().endsWith(destination === "invited" ? "/grants" : "/projection"))),
    page.getByRole("button", { name: "Guardar selección y permisos", exact: true }).click(),
  ]);
  assert.equal(created.status(), 201);
  const collection = (await created.json()).data;
  assert.equal(collection.title, name);
  assert.equal(collection.version, 1);
  assert.deepEqual(collection.grants, []);
  assert.equal(collection.publicProjection, null);
  assert.match(collection.id, /^c[a-z0-9]+$/);
  if (permission) {
    assert.equal(permission.url(), needsReview ? origin + "/api/v1/publication-reviews" :
      root + "/" + collection.id + (destination === "invited" ? "/grants" : "/projection"));
    assert.equal(permission.status(), needsReview || destination === "public" ? 200 : 201);
    const body = permission.request().postDataJSON();
    if (needsReview) assert.equal(body.collectionId, collection.id);
    if (destination === "public") assert.equal(body.listOnCv, true);
  }
  const link = page.getByLabel("Enlace para compartir", { exact: true });
  const composer = page.getByRole("region", { name: "Publicar y compartir selección" });
  if (needsReview) await composer.getByRole("link", { name: "Revisar autorizaciones guardadas" }).waitFor();
  else await composer.getByRole("button", { name: "Crear otra selección", exact: true }).waitFor();
  if (destination === "private" || needsReview) assert.equal(await link.count(), 0);
  else {
    const expectedPath = destination === "invited" ? "/portal/selecciones/" + collection.id : "/selecciones/" + (await permission!.json()).data.slug;
    assert.equal(await link.inputValue(), origin + expectedPath);
  }
  return { id: collection.id as string, reviewRequest: needsReview ? permission!.request().postDataJSON() : undefined };
}

export async function readPage(ctx: BrowserContext, path: string, record: SharingRecord) {
  const page = await ctx.newPage();
  try {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    assert.equal(response?.status(), 200);
    await page.getByText(record.summary, { exact: true }).first().waitFor();
    assert.equal(await page.getByText(record.title, { exact: true }).count(), 0);
  } finally { await page.close(); }
}
