import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { BrowserContext, Response } from "playwright";
import type { EvaluationFixture } from "./s14-evaluation-fixture";

const dossiers = "/api/v1/evaluation-dossiers";
export async function evaluationJourney(company: BrowserContext, other: BrowserContext, publisher: BrowserContext,
  anonymous: BrowserContext, db: PrismaClient, f: EvaluationFixture, origin: string, dossierIds: string[], phase: (value: string) => void) {
  const page = await company.newPage(), errors: string[] = [], blocked: string[] = [];
  page.on("pageerror", error => errors.push(error.name));
  const headers = () => ({ Origin: origin, "Idempotency-Key": randomUUID() });
  const options = { maxRedirects: 0, timeout: 45_000 };
  const summary = "Resumen manual S14 " + f.run, rationale = "Sustento autorizado S14 " + f.run;
  const note = "Nota privada de coordinación S14 " + f.run, question = "¿Qué información falta confirmar? " + f.run;
  const editedQuestion = "¿Puedes precisar el alcance y la fecha? " + f.run;
  const createBody = { needRevisionId: f.revision, professionalProfileId: f.scopedProfile,
    worklogRevisionIds: [f.limited.revision], sourceRefs: [{ revisionId: f.limited.revision,
      accessKind: "PUBLIC_SELECTION", accessReferenceId: f.projection }], privateSummary: summary };

  phase("create-pinned-dossier");
  const created = await company.request.post(dossiers, { ...options, headers: headers(), data: createBody });
  assert.equal(created.status(), 201);
  const id: string = (await created.json()).data.id;
  assert.match(id, /^c[a-z0-9]+$/);
  dossierIds.push(id);
  const saved = await db.terraqoEvaluationDossier.findFirstOrThrow({ where: { id, workspaceId: f.workspace, createdById: f.owner }, include: { sources: true } });
  assert.equal(saved.needRevisionId, f.revision);
  assert.equal(saved.sources.length, 1);
  const source = saved.sources[0], sourcePath = `${dossiers}/${id}/sources/${source.id}`;
  assert.equal(source.worklogRevisionId, f.limited.revision);
  assert.equal(source.accessKind, "PUBLIC_SELECTION");
  assert.equal(source.accessReferenceId, f.projection);
  const requirement = await db.terraqoNeedRequirement.findFirstOrThrow({ where: { revisionId: f.revision } });
  async function list() {
    const response = await company.request.get(dossiers, options);
    assert.equal(response.status(), 200);
    const rows = (await response.json()).data;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, id);
    assert.equal(rows[0].needRevision.id, f.revision);
    assert.equal(rows[0].needRevision.revisionNo, 1);
    return rows[0];
  }
  const visible = await list();
  assert.equal(visible.privateSummary, summary);
  assert.ok(!JSON.stringify(visible).includes(f.hidden));

  phase("isolation");
  for (const [context, status] of [[anonymous, 401], [publisher, 403]] as const) {
    assert.equal((await context.request.get(dossiers, options)).status(), status);
    assert.equal((await context.request.get(sourcePath, options)).status(), status);
  }
  const otherList = await other.request.get(dossiers, options);
  assert.equal(otherList.status(), 200);
  assert.deepEqual((await otherList.json()).data, []);
  const foreignSource = await other.request.get(sourcePath, options);
  assert.equal(foreignSource.status(), 404);
  assert.ok(!(await foreignSource.text()).includes(f.limited.title));
  const attemptedWrites = {
    notes: { body: "Unauthorized write " + f.run },
    questions: { text: "Unauthorized question " + f.run, expectedRevisionNo: 0 },
    assessments: { requirementId: requirement.id, criterionLabel: requirement.label, claimState: "UNKNOWN",
      rationale: "Unauthorized assessment", sourceIds: [], expectedRevisionNo: 0 },
  };
  for (const [route, data] of Object.entries(attemptedWrites)) {
    for (const [context, statuses] of [[anonymous, [401]], [publisher, [403]], [other, [403, 404]]] as const) {
      const response = await context.request.post(`${dossiers}/${id}/${route}`, { ...options, headers: headers(), data });
      // Other-company writes may fail the pilot entitlement first; source reads MUST return 404.
      assert.ok((statuses as readonly number[]).includes(response.status()), "S14 cross-actor write must be denied");
    }
  }
  assert.equal(await db.terraqoEvaluationNote.count({ where: { dossierId: id } }), 0);
  assert.equal(await db.terraqoEvaluationQuestion.count({ where: { dossierId: id } }), 0);
  assert.equal(await db.terraqoEvaluationAssessment.count({ where: { dossierId: id } }), 0);

  // Browser navigation is same-origin through sharingSession. APIRequestContext calls above are explicit,
  // bounded same-origin paths; no browser route is claimed to intercept APIRequestContext traffic.
  await company.route("**/api/**", route => {
    const request = route.request(), url = new URL(request.url());
    const allowedWrite = request.method() === "POST" && (["/api/auth/presence", "/api/v1/analysis-jobs"].includes(url.pathname) ||
      ["assessments", "notes", "questions"].some(action => url.pathname === `${dossiers}/${id}/${action}`));
    if (url.origin === origin && (["GET", "HEAD"].includes(request.method()) || allowedWrite)) return route.fallback();
    blocked.push(url.pathname); return route.abort();
  });
  const responseFor = (path: string, method: string) => page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === origin && url.pathname === path && response.request().method() === method;
  });
  async function sourceResponse(response: Response) {
    assert.equal(response.status(), 200);
    assert.match(response.headers()["cache-control"] || "", /\bno-store\b/);
    assert.deepEqual((await response.json()).data, { sourceId: source.id, revisionId: f.limited.revision,
      contentHash: f.limited.contentHash, accessKind: "PUBLIC_SELECTION", fields: { title: f.limited.title } });
  }
  async function replay(response: Response) {
    const key = await response.request().headerValue("idempotency-key");
    assert.ok(key);
    const again = await company.request.post(new URL(response.url()).pathname, { ...options,
      headers: { Origin: origin, "Idempotency-Key": key }, data: response.request().postDataJSON() });
    assert.equal(again.status(), 201);
    assert.equal((await again.json()).data.id, (await response.json()).data.id);
  }
  phase("source-viewer");
  await page.setViewportSize({ width: 1440, height: 960 });
  assert.equal((await page.goto(origin + "/admin/necesidades", { waitUntil: "domcontentloaded", timeout: 120_000 }))?.status(), 200);
  const sources = page.locator("#evaluation-sources"), viewer = page.getByRole("region", { name: "Detalle de fuente y versión" });
  const [opened] = await Promise.all([responseFor(sourcePath, "GET"), sources.getByRole("button", { name: /Abrir fuente y versión/ }).click()]);
  await sourceResponse(opened);
  await viewer.getByText("Versión exacta: " + f.limited.revision, { exact: true }).waitFor();
  await viewer.getByText(f.limited.title, { exact: true }).waitFor();
  assert.ok(!(await viewer.innerText()).includes(f.hidden));
  await viewer.getByRole("button", { name: "Cerrar fuente" }).click();
  await viewer.waitFor({ state: "hidden" });

  phase("disabled-or-unavailable-analysis");
  const analysisBody = { dossierId: id, purpose: "QUESTION_DRAFTS", sourceRevisionIds: [f.limited.revision],
    expectedPolicies: [{ sourceRevisionId: f.limited.revision, contentHash: f.limited.contentHash, accessKind: "PUBLIC_SELECTION" }] };
  if (process.env.TERRAQO_EVIDENCE_ANALYSIS_V1 === "false") {
    assert.equal(await page.getByRole("button", { name: /Analizar fuentes|Nuevo análisis/ }).count(), 0);
    const response = await company.request.post("/api/v1/analysis-jobs", { ...options, headers: headers(), data: analysisBody });
    assert.equal(response.status(), 404);
  } else {
    const [response] = await Promise.all([responseFor("/api/v1/analysis-jobs", "POST"),
      page.getByRole("button", { name: "Analizar fuentes", exact: true }).click()]);
    assert.equal(response.status(), 503);
    assert.equal((await response.json()).error.code, "PROVIDER_NOT_CONFIGURED");
    await page.getByText(/no está configurado.*modo manual/i).waitFor();
  }
  assert.equal(await db.terraqoAnalysisJob.count({ where: { dossierId: id } }), 0);
  assert.equal((await list()).effectiveAnalysisStatus, "NOT_REQUESTED");

  phase("manual-assessment");
  const form = page.locator("form").filter({ has: page.getByLabel("Estado de " + f.missing, { exact: true }) });
  const state = form.getByLabel("Estado de " + f.missing, { exact: true });
  for (const value of ["DOCUMENTED", "DECLARED", "ENDORSED", "UNKNOWN"])
    assert.equal(await state.locator(`option[value="${value}"]`).count(), 1);
  await state.selectOption("DOCUMENTED");
  await form.getByLabel(/^Conclusión y sustento/).fill(rationale);
  await form.getByRole("checkbox", { name: f.limited.title, exact: true }).check();
  const [assessment] = await Promise.all([responseFor(`${dossiers}/${id}/assessments`, "POST"), form.getByRole("button", { name: "Guardar criterio" }).click()]);
  assert.equal(assessment.status(), 201);
  await replay(assessment);
  const assessmentRow = await db.terraqoEvaluationAssessment.findFirstOrThrow({ where: { dossierId: id }, include: { sourceLinks: true } });
  assert.equal(assessmentRow.rationale, rationale);
  assert.equal(assessmentRow.claimState, "DOCUMENTED");
  assert.equal(assessmentRow.revisionNo, 1);
  assert.equal(assessmentRow.requirementId, requirement.id);
  assert.deepEqual(assessmentRow.sourceLinks.map(link => link.sourceId), [source.id]);
  assert.equal(await db.terraqoEvaluationAssessment.count({ where: { dossierId: id } }), 1);
  const stale = await company.request.post(`${dossiers}/${id}/assessments`, { ...options, headers: headers(), data: assessment.request().postDataJSON() });
  assert.equal(stale.status(), 409);
  const [citation] = await Promise.all([responseFor(sourcePath, "GET"), form.getByRole("button", { name: /Ver sustento/ }).click()]);
  await sourceResponse(citation);
  await viewer.getByText("Versión exacta: " + f.limited.revision, { exact: true }).waitFor();
  await viewer.getByRole("button", { name: "Cerrar fuente" }).click();

  phase("manual-notes-and-editable-questions");
  await page.getByLabel("Observación del equipo", { exact: true }).fill(note);
  const [noted] = await Promise.all([responseFor(`${dossiers}/${id}/notes`, "POST"), page.getByRole("button", { name: "Agregar nota", exact: true }).click()]);
  assert.equal(noted.status(), 201); await replay(noted);
  await page.getByRole("button", { name: "Preparar preguntas", exact: true }).click();
  const draft = page.getByLabel(/^Borrador de pregunta 1/);
  await draft.waitFor();
  assert.ok((await draft.inputValue()).length > 0);
  assert.equal(await db.terraqoEvaluationQuestion.count({ where: { dossierId: id } }), 0, "Preparing questions must not persist or send them");
  await draft.fill(question);
  const [asked] = await Promise.all([responseFor(`${dossiers}/${id}/questions`, "POST"), page.locator("#evaluation-questions").getByRole("button", { name: "Guardar borrador", exact: true }).click()]);
  assert.equal(asked.status(), 201); await replay(asked);
  const edit = page.locator("form").filter({ has: page.getByLabel("Editar pregunta", { exact: true }) });
  await edit.getByLabel("Editar pregunta", { exact: true }).fill(editedQuestion);
  const [edited] = await Promise.all([responseFor(`${dossiers}/${id}/questions`, "POST"), edit.getByRole("button", { name: "Guardar", exact: true }).click()]);
  assert.equal(edited.status(), 201); await replay(edited);
  const questionRow = await db.terraqoEvaluationQuestion.findFirstOrThrow({ where: { dossierId: id, current: true } });
  assert.equal(questionRow.text, editedQuestion); assert.equal(questionRow.revisionNo, 2);
  assert.equal(questionRow.lifecycle, "DRAFT"); assert.equal(questionRow.supersedesId, (await asked.json()).data.id);
  assert.equal(await db.terraqoEvaluationQuestion.count({ where: { dossierId: id } }), 2);
  assert.equal(await db.terraqoEvaluationNote.count({ where: { dossierId: id, body: note } }), 1);
  const staleQuestion = await company.request.post(`${dossiers}/${id}/questions`, { ...options, headers: headers(), data: edited.request().postDataJSON() });
  assert.equal(staleQuestion.status(), 409);
  assert.equal(await db.terraqoConversationRequest.count({ where: { dossierId: id } }), 0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText(note, { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Editar pregunta", { exact: true }).inputValue(), editedQuestion);
  phase("manual-persistence-readback");
  const persisted = await list();
  assert.equal(persisted.needRevision.requirements[0].label, f.missing);
  assert.equal(persisted.assessments[0].rationale, rationale);
  assert.equal(await form.getByLabel(/^Conclusión y sustento/).inputValue(), rationale);
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 812 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "S14 overflow at " + width);
  }

  phase("source-revocation");
  // Keep the viewer open so refresh must remove already rendered source content too.
  const [beforeRevocation] = await Promise.all([responseFor(sourcePath, "GET"), sources.getByRole("button", { name: /Abrir fuente y versión/ }).click()]);
  await sourceResponse(beforeRevocation);
  const revoked = await publisher.request.delete(`/api/v1/share-collections/${f.collection}/projection`,
    { ...options, headers: { Origin: origin }, data: { expectedVersion: 1 } });
  assert.equal(revoked.status(), 200); assert.equal((await revoked.json()).data.revoked, true);
  const gone = await company.request.get(sourcePath, options);
  assert.equal(gone.status(), 410);
  assert.ok(!(await gone.text()).includes(f.limited.title));
  const after = await list();
  assert.equal(after.effectiveAnalysisStatus, "SOURCE_REVOKED"); assert.equal(after.revokedSourceCount, 1);
  assert.deepEqual(after.sources, []); assert.deepEqual(after.assessments, []); assert.equal(after.privateSummary, null);
  for (const secret of [f.limited.title, rationale, summary, f.hidden]) assert.ok(!JSON.stringify(after).includes(secret));
  const deniedReplay = await company.request.post(`${dossiers}/${id}/assessments`, { ...options,
    headers: { Origin: origin, "Idempotency-Key": (await assessment.request().headerValue("idempotency-key"))! }, data: assessment.request().postDataJSON() });
  assert.equal(deniedReplay.status(), 409);
  // The independent wider grant remains; it must never substitute for the pinned public selection.
  assert.equal(await db.terraqoAccessGrant.count({ where: { collectionId: f.alternate, revokedAt: null } }), 1);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByText(/fuente\(s\) perdieron autorización/).waitFor();
  assert.equal(await viewer.count(), 0);
  assert.equal(await sources.getByRole("button", { name: /Abrir fuente y versión/ }).count(), 0);
  assert.equal(await form.getByLabel(/^Conclusión y sustento/).inputValue(), "");
  for (const secret of [f.limited.title, rationale, summary, f.hidden]) assert.ok(!(await page.locator("body").innerText()).includes(secret));
  await page.getByLabel("Observación del equipo", { exact: true }).fill("Fuente retirada; solicitar nueva autorización.");
  const [manualAfter] = await Promise.all([responseFor(`${dossiers}/${id}/notes`, "POST"), page.getByRole("button", { name: "Agregar nota", exact: true }).click()]);
  assert.equal(manualAfter.status(), 201);
  assert.deepEqual(blocked, []); assert.deepEqual(errors, []);
}
