import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch();
const origin = process.env.S06_FIXTURE_ORIGIN || "http://localhost:3190";
try {
  for (const width of [1440, 375, 320]) {
    for (const scenario of ["private", "invited", "public", "create-retry", "grant-retry", "projection-retry", "conflict", "denied", "review", "review-retry", "invited-review"]) {
      const page = await browser.newPage({ viewport: { width, height: 960 } });
      const requests = [];
      let approved = false;
      let createCount = 0, grantCount = 0, projectionCount = 0, reviewCount = 0;
      await page.route("**/api/**", async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path.includes("/evidence/")) return route.abort();
        requests.push({ path, method: request.method(), key: request.headers()["idempotency-key"], body: request.postDataJSON() });
        if (request.method() === "GET") return route.fulfill({ json: { data: [{ id: "fixture-collection", version: scenario === "conflict" ? 3 : 2, publicProjection: { slug: "confirmed-slug", revokedAt: null } }] } });
        if (path.endsWith("/share-collections")) {
          createCount++;
          if (scenario === "create-retry" && createCount === 1) return route.abort("failed");
          return route.fulfill({ status: 201, json: { data: { id: "fixture-collection", version: 1 } } });
        }
        if (path.endsWith("/grants")) {
          grantCount++;
          if (scenario === "invited-review" && !approved) return route.fulfill({ status: 403, json: { error: { message: "Autorización pendiente para este destinatario." } } });
          if (scenario === "grant-retry" && grantCount === 1) return route.abort("failed");
          return route.fulfill({ status: 201, json: { data: { grant: { id: "fixture-grant" }, invitationToken: null, replayed: grantCount > 1 } } });
        }
        if (path.endsWith("/publication-reviews")) {
          reviewCount++;
          if (scenario === "review-retry" && reviewCount === 1) return route.abort("failed");
          return route.fulfill({ json: { data: [{ id: "fixture-review", decision: "PENDING" }] } });
        }
        if (path.endsWith("/projection")) {
          projectionCount++;
          if (["projection-retry", "conflict"].includes(scenario)) return route.abort("failed");
          if (scenario === "denied") return route.fulfill({ status: 422, json: { error: { message: "El material de empresa necesita autorización." } } });
          return route.fulfill({ json: { data: { slug: "confirmed-slug" } } });
        }
        throw new Error(`Unexpected API: ${request.method()} ${path}`);
      });
      await page.goto(`${origin}/compartir${scenario.includes("review") ? "?review=1" : ""}`);
      await expect(page.getByRole("radio")).toHaveCount(3);
      await expect(page.getByRole("radio", { name: /^Privado/ })).toBeChecked();
      await page.getByRole("checkbox").first().check();
      await page.getByRole("checkbox", { name: "Descripción", exact: true }).check();
      await page.getByLabel("Nombre de la selección").fill("Selección de prueba");
      const invited = ["invited", "grant-retry", "invited-review"].includes(scenario);
      const publicDestination = ["public", "projection-retry", "conflict", "denied", "review", "review-retry"].includes(scenario);
      if (invited) {
        await page.getByRole("radio", { name: /^Personas invitadas/ }).check();
        await page.getByLabel("Correo de la persona invitada").fill("invalid");
        await expect(page.getByRole("button", { name: "Guardar selección y permisos" })).toBeDisabled();
        await page.getByLabel("Correo de la persona invitada").fill("EVALUADOR@example.com");
      }
      if (publicDestination) await page.getByRole("radio", { name: /^Público/ }).check();
      assert.equal(requests.length, 0, "No implicit API calls");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      if (["private", "invited", "public"].includes(scenario)) await page.screenshot({ path: `output/s06-composer-${scenario}-${width}.png`, fullPage: true });
      await page.getByRole("button", { name: "Guardar selección y permisos" }).dblclick();
      const retry = ["create-retry", "grant-retry", "projection-retry", "conflict", "review-retry"].includes(scenario);
      if (retry) {
        await expect(page.getByRole("status")).toContainText("Conservamos el contenido");
        await expect(page.getByLabel("Nombre de la selección")).toBeDisabled();
        await expect(page.getByLabel("Nombre de la selección")).toHaveValue("Selección de prueba");
        await page.getByRole("button", { name: "Reintentar guardado y permisos" }).click();
      }
      if (scenario.includes("review")) {
        await expect(page.getByRole("status")).toContainText("Autorización empresarial solicitada");
        assert.equal(grantCount, 0);
        assert.equal(projectionCount, 0);
        await expect(page.getByLabel("Enlace para compartir")).toHaveCount(0);
        const confirm = page.getByRole("button", { name: invited ? "Confirmar acceso autorizado" : "Confirmar publicación autorizada" });
        if (invited) {
          const review = requests.find(request => request.path.endsWith("/publication-reviews")).body;
          assert.equal(review.listOnCv, undefined);
          assert.equal(review.inviteTarget.email, "evaluador@example.com");
          assert.equal(review.inviteTarget.download, false);
          await confirm.click();
          await expect(page.getByRole("status")).toContainText("Autorización pendiente");
          await expect(page.getByLabel("Enlace para compartir")).toHaveCount(0);
        }
        approved = true;
        await confirm.click();
      }
      if (scenario === "conflict") {
        await expect(page.getByRole("status")).toContainText("cambió en otra sesión");
        await expect(page.getByLabel("Enlace para compartir")).toHaveCount(0);
      } else if (scenario === "denied") {
        await expect(page.getByRole("status")).toContainText("La selección está guardada");
        await expect(page.getByLabel("Enlace para compartir")).toHaveCount(0);
      } else {
        await expect(page.getByRole("button", { name: "Crear otra selección" })).toBeVisible();
        await expect(page.getByRole("status")).toContainText(invited ? "No se envió ningún correo" : publicDestination ? /publica/i : "Aún no se compartió con nadie");
        if (invited || publicDestination) {
          await expect(page.getByLabel("Enlace para compartir")).toHaveValue(`${origin}${invited ? "/portal/selecciones/fixture-collection" : "/selecciones/confirmed-slug"}`);
          await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } }));
          await page.getByRole("button", { name: "Copiar enlace", exact: true }).click();
          await expect(page.getByRole("status")).toContainText("cópialo manualmente");
        }
      }
      assert.equal(createCount, scenario === "create-retry" ? 2 : 1);
      assert.equal(grantCount, invited ? (["grant-retry", "invited-review"].includes(scenario) ? 2 : 1) : 0);
      assert.equal(projectionCount, publicDestination ? 1 : 0);
      assert.equal(reviewCount, scenario.includes("review") ? (scenario === "review-retry" ? 2 : 1) : 0);
      for (const write of requests.filter(request => request.path.endsWith("/projection") || (request.path.endsWith("/publication-reviews") && !invited))) assert.equal(write.body.listOnCv, true);
      if (scenario === "review-retry") { const writes = requests.filter(request => request.path.endsWith("/publication-reviews")); assert.deepEqual(writes[0].body, writes[1].body); }
      assert.deepEqual(requests[0].body.items, [{ revisionId: "synthetic-revision", allowedFields: ["summary"], includeMedia: false }]);
      for (const endpoint of ["/share-collections", "/grants"]) {
        const attempts = requests.filter(request => request.method === "POST" && request.path.endsWith(endpoint));
        if (attempts.length === 2) { assert.equal(attempts[0].key, attempts[1].key); assert.deepEqual(attempts[0].body, attempts[1].body); }
      }
      if (invited) {
        const grant = requests.find(request => request.path.endsWith("/grants")).body;
        assert.equal(grant.inviteEmail, "evaluador@example.com");
        assert.equal(grant.expectedVersion, 1);
        if (scenario === "invited-review") {
          const review = requests.find(request => request.path.endsWith("/publication-reviews")).body;
          assert.equal(grant.expiresAt, review.inviteTarget.expiresAt);
          assert.equal(grant.inviteEmail, review.inviteTarget.email);
          assert.equal(projectionCount, 0);
        }
        assert.deepEqual(grant.scopes, ["VIEW_COLLECTION"]);
        assert.ok(new Date(grant.expiresAt).getTime() > Date.now());
      }
      await page.close();
    }
  }
  console.log("PASS S06 composer: 33 scenarios, three destinations, exact API payloads, retries, double-click, conflict, authorization denied, clipboard failure, no modal/email/overflow.");
} finally { await browser.close(); }
