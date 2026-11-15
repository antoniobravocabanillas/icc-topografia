import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Locator, Page } from "playwright";
import type { NeedFixture } from "./s12-need-fixture";
import { workspaceAdministrationStagingOrigin } from "./workspace-administration-test-target";

const api = "/api/v1/work-needs";
const screen = "/admin/necesidades";

async function clickForResponse(page: Page, control: Locator, path: string, method: string, status: number) {
  const url = new URL(path, page.url()).href;
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url() === url && r.request().method() === method),
    control.click(),
  ]);
  assert.equal(response.status(), status, method + " " + path);
  return response;
}

async function fits(page: Page, width: number) {
  assert.equal(await page.evaluate(() => innerWidth), width);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "S12 horizontal overflow at " + width);
}

export async function needJourney(page: Page, db: PrismaClient, f: NeedFixture, origin: string,
  requirementIds: string[], phase: (name: string) => void) {
  const work = "Nivelación";
  const context = "Losa de obra";
  // Exercise the maximum context accepted by the editor on both suggestion and revision endpoints.
  const changed = "Segundo tramo de la losa. ".repeat(100).slice(0, 2399) + ".";
  const calls: string[] = [];
  const runtimeErrors: string[] = [];
  page.on("pageerror", err => runtimeErrors.push(err.name));
  page.on("request", req => {
    const path = new URL(req.url()).pathname;
    if (path.startsWith(api) && (req.method() === "POST" || path.endsWith("/discover"))) calls.push(path);
  });

  phase("admin-route");
  if (origin !== workspaceAdministrationStagingOrigin) {
    const forwarded = await page.request.get(screen, { maxRedirects: 0, timeout: 120_000,
      headers: { "X-Forwarded-Host": new URL(workspaceAdministrationStagingOrigin).hostname } });
    assert.equal(forwarded.status(), 200);
    assert.match(await forwarded.text(), /name="activity"/);
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  const navigation = await page.goto(origin + screen, { waitUntil: "domcontentloaded", timeout: 120_000 });
  assert.equal(navigation?.status(), 200);
  assert.equal(page.url(), origin + screen);
  const activity = page.getByRole("textbox", { name: /^Actividad principal/ });
  const problem = page.getByRole("textbox", { name: /^Contexto básico/ });
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  await page.getByRole("heading", { name: "Aún no hay necesidades", exact: true }).waitFor();
  await activity.waitFor();
  assert.equal(await page.locator("form").filter({ has: activity }).locator("input:visible, textarea:visible, select:visible").count(), 2);
  await fits(page, 1440);

  phase("minimal-draft");
  await activity.fill(work);
  await problem.fill(context);
  const create = await clickForResponse(page, button("Guardar borrador"), api, "POST", 201);
  const needId: string = (await create.json()).data.id;
  assert.deepEqual(calls, [api]);
  const where = { id: needId, workspaceId: f.workspace, createdById: f.owner };
  const include = { currentRevision: { include: { requirements: { orderBy: { sortOrder: "asc" as const } } } } };
  const first = await db.terraqoWorkNeed.findFirstOrThrow({ where, include });
  const v1 = first.currentRevision;
  assert.ok(v1);
  assert.equal(first.lifecycle, "DRAFT");
  assert.equal(first.version, 1);
  assert.equal(v1.revisionNo, 1);
  assert.equal(v1.title, work);
  assert.deepEqual(v1.activities, [work]);
  assert.equal(v1.problem, context);
  assert.deepEqual(v1.requirements, []);
  assert.deepEqual(v1.requiredTools, []);
  assert.equal(v1.locationLabel, null);
  assert.equal(v1.availableFrom, null);
  assert.equal(v1.availableUntil, null);
  assert.equal(v1.endorsementNeeded, false);

  phase("minimal-search");
  const search = await clickForResponse(page, button("Explorar evidencia"), api + "/" + needId + "/discover", "GET", 200);
  assert.ok(Array.isArray((await search.json()).data));

  // Model a previous evaluation without inviting a reviewer or exercising another screen.
  const previousEvaluation = await db.terraqoEvaluationDossier.create({ data: {
    id: f.dossier, workspaceId: f.workspace, needRevisionId: v1.id, professionalProfileId: f.profile,
    createdById: f.owner, privateSummary: "Evaluación previa de la primera losa", operationKey: randomUUID(), operationFingerprint: f.run,
  } });

  phase("mobile-edit");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await button("Editar borrador").click();
  assert.equal(await activity.inputValue(), work);
  assert.equal(await problem.inputValue(), context);
  await fits(page, 375);
  const activities = work + ", Replanteo";
  await activity.fill(activities);
  await problem.fill(changed);
  phase("explicit-local-suggestions");
  const suggestions = await clickForResponse(page, button("Solicitar sugerencias"), api + "/suggestions", "POST", 200);
  assert.deepEqual(suggestions.request().postDataJSON(), { activity: activities, context: changed });
  const proposed = (await suggestions.json()).data as {
    source: string; suggestions: { label: string; priority: "REQUIRED" | "DESIRED" }[];
  };
  assert.equal(proposed.source, "local");
  assert.deepEqual(proposed.suggestions.map(item => item.label), [work, "Replanteo"]);
  const [accepted, discarded] = proposed.suggestions;
  const proposal = (label: string) => page.getByRole("article").filter({ has: page.getByText(label, { exact: true }) });
  await page.getByText(/Propuestas locales extraídas de tu actividad/).waitFor();
  assert.ok(await button("Guardar nueva versión").isDisabled());
  assert.ok(await button("Buscar evidencia relacionada").isDisabled());
  await page.locator("summary").filter({ hasText: "Precisar criterios y condiciones" }).click();
  assert.equal(await page.getByRole("textbox", { name: /^Requisito \d+$/ }).count(), 0);
  await proposal(accepted.label).getByRole("button", { name: "Aceptar", exact: true }).click();
  assert.ok(await button("Guardar nueva versión").isDisabled());
  await proposal(discarded.label).getByRole("button", { name: "Descartar", exact: true }).click();
  const manual = "Registro de cotas";
  await page.getByLabel("Importancia del requisito 1", { exact: true }).selectOption("REQUIRED");
  await button("Añadir requisito").click();
  await page.getByRole("textbox", { name: "Requisito 2", exact: true }).fill(manual);
  await page.getByLabel("Importancia del requisito 2", { exact: true }).selectOption("DESIRED");
  await page.getByLabel(/^Ubicación · opcional/).fill("Sector norte");
  await page.getByLabel(/^Herramientas · opcional/).fill("Nivel, Prisma");
  await page.getByLabel(/^Desde · opcional/).fill("2027-02-04");
  await page.getByLabel(/^Hasta · opcional/).fill("2027-02-18");
  await page.getByRole("checkbox", { name: /^Solicitar respaldo verificable/ }).check();

  phase("mobile-version");
  await page.setViewportSize({ width: 320, height: 740 });
  await fits(page, 320);
  await clickForResponse(page, button("Guardar nueva versión"), api + "/" + needId + "/revisions", "POST", 200);
  await page.getByText(/Borrador guardado · versión 2/).waitFor();
  const latest = await db.terraqoWorkNeed.findFirstOrThrow({ where, include });
  const v2 = latest.currentRevision;
  assert.ok(v2 && v2.id !== v1.id);
  assert.equal(latest.version, 2);
  assert.equal(v2.revisionNo, 2);
  assert.equal(v2.problem, changed);
  assert.equal(v2.locationLabel, "Sector norte");
  assert.deepEqual(v2.requiredTools, ["Nivel", "Prisma"]);
  assert.equal(v2.availableFrom?.toISOString(), "2027-02-04T00:00:00.000Z");
  assert.equal(v2.availableUntil?.toISOString(), "2027-02-18T00:00:00.000Z");
  assert.equal(v2.endorsementNeeded, true);
  assert.deepEqual(v2.requirements.map(({ label, priority }) => ({ label, priority })),
    [{ label: accepted.label, priority: "REQUIRED" }, { label: manual, priority: "DESIRED" }]);
  requirementIds.push(...v2.requirements.map(item => item.id));

  phase("immutable-evaluation");
  assert.deepEqual(await db.terraqoWorkNeedRevision.findUniqueOrThrow({ where: { id: v1.id },
    include: { requirements: { orderBy: { sortOrder: "asc" } } } }), v1);
  assert.deepEqual(await db.terraqoEvaluationDossier.findUniqueOrThrow({ where: { id: f.dossier } }), previousEvaluation);
  const dossiers = await page.request.get("/api/v1/evaluation-dossiers", { maxRedirects: 0 });
  assert.equal(dossiers.status(), 200);
  const evaluation = (await dossiers.json()).data.find((row: { id: string }) => row.id === f.dossier);
  assert.deepEqual(evaluation?.needRevision, { id: v1.id, title: work, revisionNo: 1, requirements: [] });
  assert.deepEqual(calls, [api, api + "/" + needId + "/discover", api + "/suggestions", api + "/" + needId + "/revisions"]);
  phase("unsaved-one-click-search");
  await button("Nueva necesidad").click();
  const directWork = "Control de alineación";
  const directContext = "Eje del viaducto";
  await activity.fill(directWork);
  await problem.fill(directContext);
  const [created, discovered] = await Promise.all([
    page.waitForResponse(r => r.url() === origin + api && r.request().method() === "POST"),
    page.waitForResponse(r => r.url().startsWith(origin + api + "/") && r.url().endsWith("/discover") && r.request().method() === "GET"),
    button("Buscar evidencia relacionada").click(),
  ]);
  assert.equal(created.status(), 201);
  assert.equal(discovered.status(), 200);
  const directId: string = (await created.json()).data.id;
  assert.notEqual(directId, needId);
  assert.equal(discovered.url(), origin + api + "/" + directId + "/discover");
  assert.ok(Array.isArray((await discovered.json()).data));
  assert.deepEqual(calls.slice(4), [api, api + "/" + directId + "/discover"]);
  const direct = await db.terraqoWorkNeed.findFirstOrThrow({ where: { ...where, id: directId }, include });
  assert.equal(direct.version, 1);
  assert.equal(direct.lifecycle, "DRAFT");
  assert.equal(direct.currentRevision?.title, directWork);
  assert.equal(direct.currentRevision?.problem, directContext);
  assert.deepEqual(direct.currentRevision?.requirements, []);
  assert.equal(await db.terraqoWorkNeed.count({ where: { workspaceId: f.workspace, createdById: f.owner } }), 2);
  await fits(page, 320);
  assert.deepEqual(runtimeErrors, []);
}
