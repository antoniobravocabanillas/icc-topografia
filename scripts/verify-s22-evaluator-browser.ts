import { s24BlobFixtures } from "./lib/s24-blob-fixtures.mjs";
import { workspaceAdministrationStagingOrigin } from "./lib/workspace-administration-test-target";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { BrowserContext } from "playwright";

// Called only by the destination-checked synthetic S22 browser suite.
export async function verifyEvaluatorBrowser(input: {
  db: PrismaClient; owner: BrowserContext; reviewer: BrowserContext; origin: string;
  workspaceId: string; ownerId: string; reviewerId: string; email: string; password: string;
}) {
  const { db, owner, reviewer, origin, workspaceId, ownerId, reviewerId, email } = input;
  const headers = { Origin: origin };
  const invites = "/api/terraqo/workspace-invitations";
  const access = "/api/terraqo/workspace-evaluators";
  const uuid = randomUUID();
  const create = await owner.request.post(invites, { headers, data: { action: "create", workspaceId, email, role: "EVALUATOR", canReadEvaluations: true, operationKey: uuid } });
  assert.equal(create.status(), 201);
  const issue = await create.json();
  assert.equal(issue.delivery, "disabled");
  const page = await reviewer.newPage();
  await page.goto(origin + "/invitacion-workspace#" + issue.token, { timeout: 120000 });
  const targetProfile = await db.terraqoProfessionalProfile.create({ data: { userId: reviewerId } });
  const entryId = randomUUID();
  try {
    await db.terraqoWorklogEntry.create({ data: { id: entryId, authorId: reviewerId, professionalProfileId: targetProfile.id,
      title: "Nivelación de control", summary: "Registro sintético de trayectoria.", occurredAt: new Date(), visibility: "PRIVATE" } });
    console.log("S01/S02: invitation opened");
    const popup = reviewer.waitForEvent("page");
    await page.getByRole("link", { name: "Iniciar sesión", exact: true }).click();
    const loginPage = await popup;
    loginPage.setDefaultTimeout(60_000);
    await loginPage.locator("#terraqo-login-panel input[name=email]").fill(email);
    await loginPage.locator("#terraqo-login-panel input[name=password]").fill(input.password);
    console.log("S01/S02: credential form ready");
    await loginPage.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
    await loginPage.waitForURL(origin + "/portal", { timeout: 90_000 });
    console.log("S01/S02: portal reached");
    const session = await (await reviewer.request.get("/api/auth/session")).json();
    assert.equal(session.user.id, reviewerId);
    for (const width of [1280, 375, 320]) {
      await loginPage.setViewportSize({ width, height: 900 });
      const trajectory = loginPage.getByRole("region", { name: "Mi trayectoria" });
      const pending = loginPage.getByRole("heading", { name: "Pendientes", exact: true });
      const recent = loginPage.getByRole("region", { name: "Actividad reciente" });
      await recent.getByText("Nivelación de control", { exact: true }).waitFor();
      await loginPage.getByRole("link", { name: /Documentos pendientes/ }).first().waitFor();
      const [a,b,c] = await Promise.all([trajectory.boundingBox(), pending.boundingBox(), recent.boundingBox()]);
      assert.ok(a && b && c);
      assert.ok(width >= 1024 ? b.x >= a.x+a.width : b.y >= a.y+a.height);
      assert.ok(c.y > b.y);
      assert.ok(await loginPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await loginPage.getByRole("link", { name: "Registrar trabajo", exact: true }).click();
    const composer = loginPage.locator("#registrar-trabajo");
    await composer.locator("input[type=file][multiple]").setInputFiles("scripts/fixtures/public-archive/media/nivelacion.webp");
    await composer.locator("input[capture]").setInputFiles("scripts/fixtures/public-archive/media/replanteo.webp");
    await composer.locator("[name=workDate]").fill("2026-10-14");
    await composer.locator("[name=title]").fill("Control de cotas de prueba");
    await composer.locator("[name=summary]").fill("Se contrastaron las cotas de los dos planos de prueba.");
    await composer.getByRole("button", { name: "Continuar", exact: true }).click();
    await composer.getByRole("button", { name: "Ver foto 2" }).click();
    await composer.getByRole("img", { name: "Evidencia seleccionada" }).evaluate(async el => (el as HTMLImageElement).decode());
    await composer.locator("[name=outcome]").fill("Las cotas coinciden con el plano.");
    await composer.getByRole("button", { name: "Revisar visibilidad" }).click();
    await composer.locator('time[datetime="2026-10-14"]').waitFor();
    assert.equal(await composer.locator("[name=visibility]").inputValue(), "PRIVATE");
    await composer.getByRole("button", { name: "Volver", exact: true }).click();
    assert.equal(await composer.locator("[name=outcome]").inputValue(), "Las cotas coinciden con el plano.");
    assert.equal(await db.terraqoWorklogEntry.count({ where: { professionalProfileId: targetProfile.id } }), 1);
    console.log("PASS S03/S04 authenticated capture, gallery, private visibility and return without publication.");
    if (origin === workspaceAdministrationStagingOrigin) {
      const photos = s24BlobFixtures(process.env.PLATFORM_STAGING_S24_BLOB_RUN!).map(pair => pair[0]);
      await db.terraqoWorklogRevision.create({ data: { worklogId: entryId, createdById: reviewerId,
        revisionNo: 1, title: "Nivelación de control", summary: "Resumen visible de prueba", contentHash: photos[0].sha256 } });
      await db.terraqoWorklogMedia.createMany({ data: photos.map((photo, sortOrder) => ({
        worklogId: entryId, sortOrder, size: photo.bytes.length, sha256: photo.sha256,
        storageKey: photo.key, contentType: "image/webp", fileName: `plano-${sortOrder}.webp`,
      })) });
      const selectionPage = await reviewer.newPage();
      try {
        await selectionPage.goto(origin + "/portal/selecciones");
        await selectionPage.getByRole("checkbox", { name: /Nivelación de control/ }).check();
        await selectionPage.getByRole("checkbox", { name: "Descripción", exact: true }).check();
        const preview = selectionPage.getByRole("article", { name: "Contenido que se compartirá" });
        await preview.getByText("Resumen visible de prueba").waitFor();
        assert.equal(await preview.getByText("Nivelación de control").count(), 0);
        assert.equal(await preview.getByRole("img").count(), 0);
        const include = selectionPage.getByRole("checkbox", { name: "Incluir archivos normalizados" });
        await include.check();
        for (const index of [0, 1]) {
          if (index) await preview.getByRole("button", { name: "Archivo siguiente" }).click();
          await preview.getByRole("img", { name: `Archivo seleccionado ${index + 1} de 2` })
            .evaluate(el => (el as HTMLImageElement).decode());
        }
        await include.uncheck();
        await preview.getByRole("img").waitFor({ state: "detached" });
        console.log("PASS S06 authenticated private preview, selected fields, two decoded photos and exclusion.");
      } finally { await selectionPage.close(); }
    }
    console.log("S01/S02: trajectory inspected");
    await page.bringToFront();
    await page.getByText(email, { exact: true }).waitFor({ timeout: 60000 });
    assert.equal(await db.terraqoWorkspaceEvaluator.count({ where: { workspaceId, userId: reviewerId } }), 0);
    await loginPage.close();
    console.log("PASS S01 two tabs, real credential login and explicit invitation; S02 pending and recent activity at 1280/375/320.");
  } finally {
    await db.terraqoWorklogEntry.deleteMany({ where: { id: entryId, authorId: reviewerId } });
    await db.terraqoProfessionalProfile.deleteMany({ where: { id: targetProfile.id, userId: reviewerId } });
  }
  await page.getByRole("button", { name: "Aceptar invitación", exact: true }).click();
  await page.getByRole("link", { name: "Ver evaluaciones autorizadas", exact: true }).click();
  await page.getByRole("heading", { name: "Evaluaciones autorizadas", exact: true }).waitFor();
  assert.equal(new URL(page.url()).hash, "");
  assert.equal(await db.terraqoWorkspaceMember.count({ where: { workspaceId, userId: reviewerId } }), 0);
  const url = access + "?workspaceId=" + workspaceId;
  assert.equal((await reviewer.request.get(url)).status(), 403);
  const list = async () => {
    const response = await owner.request.get(url);
    assert.equal(response.status(), 200);
    const result = await response.json();
    const person = result.evaluators.find((item: { userId: string }) => item.userId === reviewerId);
    assert.ok(person);
    return person as { id: string; updatedAt: string };
  };
  const profileId = "profile-" + uuid;
  const ids = ["assigned-", "other-"].map(prefix => prefix + uuid);
  const needIds = ids.map(id => "need-" + id);
  const titles = ["Visita autorizada " + uuid, "Expediente privado " + uuid];
  const operation = () => ({ createdById: ownerId, operationKey: randomUUID(), operationFingerprint: uuid });
  try {
    await db.terraqoProfessionalProfile.create({ data: { id: profileId, userId: ownerId } });
    for (const [index,id] of ids.entries()) {
      const need = await db.terraqoWorkNeed.create({ data: { id: needIds[index], workspaceId, ...operation() } });
      const revision = await db.terraqoWorkNeedRevision.create({ data: { needId: need.id, revisionNo: 1, title: titles[index], problem: "Topografía", contentHash: uuid, ...operation() } });
      await db.terraqoEvaluationDossier.create({ data: { id, workspaceId, needRevisionId: revision.id, professionalProfileId: profileId, ...operation() } });
    }
    const person = await list();
    const data = { workspaceId, evaluatorId: person.id, active: true, canReadEvaluations: true, expectedUpdatedAt: person.updatedAt, dossierIds: [ids[0]] };
    assert.equal((await owner.request.patch(access, { headers: { Origin: "https://unrelated.invalid" }, data })).status(), 403);
    assert.equal((await reviewer.request.patch(access, { headers, data })).status(), 403);
    assert.equal((await owner.request.patch(access, { headers, data })).status(), 200);
    await page.reload();
    await page.getByText(titles[0], { exact: true }).waitFor({ timeout: 60000 });
    assert.equal(await page.getByText(titles[1], { exact: true }).count(), 0);
    const refreshed = await list();
    assert.equal((await owner.request.patch(access, { headers, data: { ...data, canReadEvaluations: false, dossierIds: [], expectedUpdatedAt: refreshed.updatedAt } })).status(), 200);
    assert.equal((await owner.request.patch(access, { headers, data })).status(), 409);
    await page.reload();
    assert.equal(await page.getByText(titles[0], { exact: true }).count(), 0);
    console.log("PASS evaluator HTTP/browser: verified acceptance, separate authority, explicit assignment, cross-origin denial, isolated list, revoked access and stale retry.");
  } finally {
    await db.$transaction([
      db.terraqoEvaluationDossier.deleteMany({ where: { workspaceId, id: { in: ids } } }),
      db.terraqoWorkNeed.deleteMany({ where: { workspaceId, id: { in: needIds } } }),
      db.terraqoProfessionalProfile.deleteMany({ where: { id: profileId, userId: ownerId } }),
    ]);
  }
}
