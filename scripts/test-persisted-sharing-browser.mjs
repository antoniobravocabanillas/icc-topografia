import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const origin = process.env.S06_FIXTURE_ORIGIN || "http://localhost:3190";
const browser = await chromium.launch();
const writes = [];
async function open(state, width, abort = false) {
  const context = await browser.newContext({ viewport: { width, height: 960 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.route("**/fonts/satoshi/*", route => route.fulfill({ contentType: "font/woff2", path: `public/fonts/satoshi/${new URL(route.request().url()).pathname.split("/").pop()}` }));
  await page.route("**/api/**", async route => {
    const request = route.request();
    assert.equal(request.method(), "POST");
    assert.match(request.url(), /\/share-collections\/persisted-collection\/(grants|projection)$/);
    writes.push({ path: new URL(request.url()).pathname, key: request.headers()["idempotency-key"], body: request.postDataJSON() });
    if (abort) return route.abort("failed");
    return route.fulfill({ status: request.url().endsWith("/grants") ? 201 : 200,
      json: { data: request.url().endsWith("/grants") ? { grant: { id: "confirmed-grant" }, replayed: true } : { slug: "confirmed-public" } } });
  });
  await page.goto(`${origin}/compartir-persistido?state=${state}`);
  await expect(page.getByRole("heading", { name: "Tus selecciones", exact: true })).toBeVisible();
  return { context, page, region: page.getByRole("region", { name: "Confirmaciones de autorizaciones guardadas" }) };
}
try {
  const blocked = ["pending", "public-pending", "declined", "revoked", "foreign", "missing", "duplicate", "invalid-hash", "wrong-fields", "wrong-media", "wrong-email", "wrong-expiry", "wrong-download", "wrong-version", "wrong-destination", "stale", "expired"];
  for (const width of [1440, 375, 320]) {
    for (const state of blocked) {
      const start = writes.length;
      const { context, page, region } = await open(state, width);
      const buttons = region.getByRole("button", { name: /Confirmar (acceso|publicación) autorizad/ });
      assert.ok(await buttons.count() > 0);
      for (const button of await buttons.all()) await expect(button).toBeDisabled();
      await expect(page.getByLabel("Correo de la persona", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Publicar selección", exact: true })).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(writes.length, start, "Review listing must not mutate permissions");
      await context.close();
    }
    for (const state of ["invited", "download", "public"]) {
      const start = writes.length;
      let session = await open(state, width);
      const firstExpiry = state !== "public" ? await session.region.locator("time").getAttribute("datetime") : undefined;
      await session.page.reload();
      if (firstExpiry) await expect(session.region.locator("time")).toHaveAttribute("datetime", firstExpiry);
      await session.context.close();
      // A new browser context has no component state, cookies, localStorage or sessionStorage.
      // The server fixture supplies the owner's saved review disclosures again.
      session = await open(state, width);
      const { page, region, context } = session;
      assert.equal(writes.length, start);
      const confirmation = region.getByRole("button", { name: state === "public" ? "Confirmar publicación autorizada" : "Confirmar acceso autorizado", exact: true });
      await expect(confirmation).toBeEnabled();
      if (firstExpiry) await expect(region.locator("time")).toHaveAttribute("datetime", firstExpiry);
      await expect(region).toContainText("Empresa 1: Autorizada");
      await expect(region).toContainText("Empresa 2: Autorizada");
      if (state === "public") await expect(region).toContainText("También aparecerá en tu CV cuando el perfil tenga el CV público");
      await page.screenshot({ path: `output/s06-persisted-${state}-${width}.png`, fullPage: true });
      await confirmation.dblclick();
      await expect(region.getByRole("status")).toContainText(state === "public" ? "Selección publicada" : "No se envió ningún correo");
      assert.equal(writes.length, start + 1);
      const write = writes.at(-1);
      if (state === "public") {
        assert.deepEqual(write.body, { expectedVersion: 4, listOnCv: true });
        assert.ok(write.path.endsWith("/projection"));
      } else {
        assert.deepEqual(write.body, { expectedVersion: 4, inviteEmail: "destino@example.com", scopes: state === "download" ? ["VIEW_COLLECTION", "DOWNLOAD_MEDIA"] : ["VIEW_COLLECTION"], expiresAt: firstExpiry });
        assert.match(write.key, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        assert.ok(write.body.expiresAt.endsWith("123Z"), "Millisecond precision must survive reload");
        assert.equal(write.body.listOnCv, undefined);
      }
      await expect(region.getByLabel("Enlace del destino confirmado")).toHaveValue(`${origin}${state === "public" ? "/selecciones/confirmed-public" : "/portal/selecciones/persisted-collection"}`);
      await context.close();
    }
    const first = await open("invited", width, true);
    await first.region.getByRole("button", { name: "Confirmar acceso autorizado", exact: true }).click();
    await expect(first.region.getByRole("status")).toContainText("Los datos aprobados se conservan");
    const failed = writes.at(-1);
    await first.context.close();
    const resumed = await open("invited", width);
    await resumed.region.getByRole("button", { name: "Confirmar acceso autorizado", exact: true }).click();
    await expect(resumed.region.getByRole("status")).toContainText("Permiso de lectura guardado");
    assert.deepEqual(writes.at(-1), failed, "Same idempotency UUID and exact approved body after complete browser restart");
    await resumed.context.close();
  }
  console.log("PASS S06 persisted recovery: 60 disclosure cases + 3 network/reopen retries; owner-only, two companies, all versions/destinations/rights, exact ISO expiry and stable UUID, reload and fresh contexts, no email/modal/implicit mutations/overflow.");
} finally { await browser.close(); }
