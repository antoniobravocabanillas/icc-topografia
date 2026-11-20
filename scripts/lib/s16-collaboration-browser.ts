import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { chromium, expect as baseExpect, type BrowserContext, type Page, type Locator } from "@playwright/test";
import { sharingSession } from "@/scripts/lib/s06-sharing-browser";
import { seedConversation, seedCancellation, sharingSnapshot, cleanS16, ownedIds,
  type S16Fixture, type OwnedIds } from "./s16-collaboration-fixture";

const expect = baseExpect.configure({ timeout: 45_000 });
const root = "/api/v1/collaborations";
const options = { maxRedirects: 0, timeout: 45_000 };
type Revision = { id: string; revisionNo: number; status: string; contribution: string;
  result: string; deliverables: string[]; authorizedExcerpt: string | null; submittedAt: string | null;
  references: { id: string; worklogRevisionId: string }[] };
type Certificate = { id: string; workspaceName: string; professionalName: string; scope: string;
  proposalRevisionNo: number; closureRevisionNo: number; issuedAt: string; privateByDefault: boolean };
type Row = { id: string; version: number; status: string; acceptedRevisionNo: number | null;
  cancellationReason?: string | null; cancelledAt?: string | null;
  cancellationActor?: { id: string; name: string | null } | null;
  proposals: { id: string; revisionNo: number; scope: string; roleTitle: string; status: string }[];
  closure: null | { id: string; version: number; currentRevision: Revision | null;
    currentRevisionId?: string | null; revisions: Revision[]; certificate: Certificate | null } };
type Sessions = Record<"company" | "professional" | "other" | "anonymous", BrowserContext>;

async function post<T>(ctx: BrowserContext, origin: string, path: string, data: object,
  status: number, key: string = randomUUID()): Promise<T> {
  const response = await ctx.request.post(path, { ...options, headers: { Origin: origin, "Idempotency-Key": key }, data });
  assert.equal(response.status(), status, "Unexpected status: " + path);
  const envelope = await response.json();
  if (status === 403) assert.equal(envelope.error.code, "FEATURE_NOT_ENTITLED", "Other workspace is outside the pilot before resource lookup");
  return envelope.data as T;
}
async function rows(ctx: BrowserContext, workspace = false): Promise<Row[]> {
  const response = await ctx.request.get(root + (workspace ? "?view=workspace" : ""), options);
  assert.equal(response.status(), 200);
  const value = (await response.json()).data;
  assert.ok(Array.isArray(value));
  return value;
}
async function row(ctx: BrowserContext, id: string, workspace = false) {
  const value = (await rows(ctx, workspace)).find(item => item.id === id);
  assert.ok(value, "Fixture collaboration absent from authorized GET");
  return value;
}
const proposalPanel = (page: Page) => page.getByTestId("collaboration-panel");
const closurePanel = (page: Page) => page.getByTestId("closure-panel");
async function visitClosure(page: Page, origin: string, company: boolean, collaborationId: string) {
  const response = await page.goto(`${origin}/${company ? "admin" : "portal"}/colaboraciones/${encodeURIComponent(collaborationId)}/cierre`, { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200, "Dedicated closure page must authorize this actor");
  await expect(closurePanel(page)).toHaveAttribute("aria-busy", "false");
}
async function clickPost<T>(page: Page, origin: string, path: string, button: Locator, status: number) {
  const [response] = await Promise.all([
    page.waitForResponse(value => value.url() === origin + path && value.request().method() === "POST"), button.click(),
  ]);
  assert.equal(response.status(), status, "UI mutation failed: " + path);
  return { data: (await response.json()).data as T, payload: response.request().postDataJSON() as Record<string, unknown>,
    key: response.request().headers()["idempotency-key"] };
}
async function visit(page: Page, origin: string, company: boolean, conversation?: string) {
  const response = await page.goto(origin + (company ? "/admin/mensajes" : "/portal/mensajes") +
    (conversation ? "?conversation=" + encodeURIComponent(conversation) : ""), { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200);
  await proposalPanel(page).getByRole("heading", { name: "Propuestas de colaboración", exact: true }).waitFor();
  await expect(proposalPanel(page)).toHaveAttribute("aria-busy", "false");
}
function noSecrets(value: unknown, forbidden: string[]) {
  const text = JSON.stringify(value);
  for (const secret of forbidden) assert.ok(!text.includes(secret), "Unsent/private content leaked");
  for (const internal of ["operationFingerprint", "submitFingerprint", "accessSnapshot", "contentHash", "storageKey"])
    assert.ok(!text.includes('"' + internal + '"'), "Internal closure fields leaked");
}
async function captures(pages: [Page, Page], dir: string, state: string) {
  for (const width of [1440, 375, 320]) for (const [index, page] of pages.entries()) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator("body")).toBeVisible();
    await page.evaluate(async () => { await document.fonts.ready; });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      "Horizontal overflow in " + state + ": " + width);
    await page.screenshot({ path: resolve(dir, `${state}-${index === 0 ? "company" : "professional"}-${width}.png`), fullPage: true });
  }
}

async function journey(s: Sessions, db: PrismaClient, f: S16Fixture, ids: OwnedIds, origin: string,
  phase: (value: string) => void) {
  const artifactDir = resolve("output/playwright/s16", f.run);
  await mkdir(artifactDir, { recursive: true });
  const company = await s.company.newPage(), professional = await s.professional.newPage();
  const pages: [Page, Page] = [company, professional];
  const runtimeErrors: string[] = [];
  for (const page of pages) page.on("pageerror", error => runtimeErrors.push(error.name));
  const beforeSharing = await sharingSnapshot(db, f);
  assert.deepEqual(beforeSharing.memberships, [], "Professionals must remain external");
  phase("real-sessions-contextual-request");
  const dossier = await post<{ id: string }>(s.company, origin, "/api/v1/evaluation-dossiers", {
    needRevisionId: f.revision, professionalProfileId: f.profile, worklogRevisionIds: [f.solo.revision],
    privateSummary: "S16 private dossier " + f.run,
  }, 201);
  ids.dossiers.push(dossier.id);
  const note = "S16 solicitud sintética " + f.run;
  const request = await post<{ id: string; version: number }>(s.company, origin, "/api/v1/conversation-requests", { dossierId: dossier.id, note }, 201);
  // Accept the contextual request through the actual professional UI.
  const response = await professional.goto(origin + "/portal/mensajes", { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200);
  const requestCard = professional.getByRole("article").filter({ has: professional.getByText(note, { exact: true }) });
  await clickPost(professional, origin, "/api/v1/conversation-requests/" + request.id + "/decision",
    requestCard.getByRole("button", { name: "Aceptar", exact: true }), 200);
  const savedRequest = await db.terraqoConversationRequest.findUniqueOrThrow({ where: { id: request.id } });
  assert.equal(savedRequest.status, "ACCEPTED");
  assert.equal(savedRequest.requesterId, f.owner);
  assert.equal(savedRequest.recipientId, f.author);
  assert.ok(savedRequest.conversationId);
  const conversation = savedRequest.conversationId;
  ids.conversations.push(conversation);
  assert.equal((await db.terraqoConversation.findUniqueOrThrow({ where: { id: conversation } })).createdById, f.owner);

  phase("s21-explicit-proposal-exact-acceptance");
  await visit(company, origin, true, conversation);
  const scope = "Alcance S16 aceptado: inspección sintética de muelle " + f.run;
  const roleTitle = "Inspector S16 " + f.run;
  const proposal = proposalPanel(company);
  phase("s21-proposal-form");
  await proposal.getByLabel("Profesional y conversación", { exact: true }).selectOption(conversation);
  await proposal.getByLabel("Alcance de esta versión", { exact: true }).fill(scope);
  await proposal.getByLabel("Rol propuesto", { exact: true }).fill(roleTitle);
  await proposal.getByLabel("Entregables, uno por línea", { exact: true }).fill("Informe sintético S16");
  await proposal.getByLabel("Inicio, si corresponde", { exact: true }).fill("2026-11-20");
  await proposal.getByLabel("Fin, si corresponde", { exact: true }).fill("2026-11-21");
  await proposal.getByLabel("Condiciones pertinentes, sin datos de pago implícitos", { exact: true }).fill("Sin pagos ni contrato implícito.");
  phase("s21-create-proposal");
  const created = await clickPost<Row>(company, origin, root, proposal.getByRole("button", { name: "Enviar propuesta", exact: true }), 201);
  const id = created.data.id;
  ids.collaborations.push(id);
  assert.equal(created.payload.conversationId, conversation);
  assert.equal(created.data.status, "PROPOSAL_PENDING");
  assert.equal(created.data.acceptedRevisionNo, null);
  assert.equal(await db.terraqoCollaborationAcceptance.count({ where: { proposal: { collaborationId: id }, party: "PROFESSIONAL" } }), 0);
  await visit(professional, origin, false, conversation);
  phase("s21-professional-acceptance");
  const proCard = proposalPanel(professional).getByRole("article").filter({ has: professional.getByText(roleTitle, { exact: true }) });
  await expect(proCard.getByText(scope, { exact: true })).toBeVisible();
  await post(s.professional, origin, root + "/" + id + "/decision", { action: "ACCEPT", expectedRevisionNo: 2 }, 409);
  const accepted = await clickPost<Row>(professional, origin, root + "/" + id + "/decision",
    proCard.getByRole("button", { name: "Aceptar esta versión", exact: true }), 200);
  assert.equal(accepted.payload.expectedRevisionNo, 1);
  assert.equal(accepted.data.acceptedRevisionNo, 1);
  assert.equal(accepted.data.status, "ACCEPTED");
  const acceptances = await db.terraqoCollaborationAcceptance.findMany({ where: { proposal: { collaborationId: id, revisionNo: 1 } } });
  assert.deepEqual(acceptances.map(value => [value.party, value.actorId]).sort(), [["PROFESSIONAL", f.author], ["WORKSPACE", f.owner]].sort());
  for (const [page, isCompany] of [[company, true], [professional, false]] as const) {
    await visit(page, origin, isCompany, conversation);
    await expect(proposalPanel(page).getByRole("heading", { name: "Alcance aceptado · v1", exact: true })).toBeVisible();
    await expect(proposalPanel(page).getByText(scope, { exact: true }).last()).toBeVisible();
  }
  phase("s21-accepted-scope-responsive");
  await captures(pages, artifactDir, "accepted-scope");

  phase("s16-ui-reference-selection-draft-private");
  const draftContribution = "Borrador privado inicial S16 " + f.run;
  await visitClosure(company, origin, true, id);
  const draftUi = closurePanel(company);
  await draftUi.getByLabel("Contribución realizada", { exact: true }).fill(draftContribution);
  await draftUi.getByLabel("Entregables, uno por línea", { exact: true }).fill("Informe sintético S16");
  await draftUi.getByLabel("Resultado", { exact: true }).fill("Resultado inicial sintético");
  await draftUi.getByLabel("Extracto autorizado (opcional)", { exact: true }).fill("Extracto autorizado S16");
  await draftUi.getByRole("checkbox", { name: `Añadir ${f.solo.title} · CV público`, exact: true }).check();
  const selectedSource = { worklogRevisionId: f.solo.revision, accessKind: "PUBLIC_CV", accessReferenceId: f.solo.id };
  const firstSave = await clickPost<NonNullable<Row["closure"]>>(company, origin, root + "/" + id + "/closures",
    draftUi.getByRole("button", { name: "Guardar borrador", exact: true }), 201);
  assert.deepEqual(firstSave.payload.referenceSources, [selectedSource]);
  assert.ok(!Object.hasOwn(firstSave.payload, "referenceRevisionIds"));
  const first = firstSave.data;
  ids.closures.push(first.id);
  noSecrets(first, []);
  assert.ok(first.currentRevision);
  ids.revisions.push(first.currentRevision.id);
  assert.equal(first.currentRevision.status, "DRAFT");
  assert.deepEqual(first.currentRevision.references.map(ref => ref.worklogRevisionId), [f.solo.revision]);
  assert.equal((await row(s.professional, id)).closure, null);
  await visit(professional, origin, false, conversation);
  assert.ok(!(await professional.locator("body").innerText()).includes(draftContribution));
  await visitClosure(company, origin, true, id);
  await expect(closurePanel(company)).toHaveAttribute("aria-busy", "false");
  await expect(closurePanel(company).getByLabel("Contribución realizada", { exact: true })).toHaveValue(draftContribution);
  await captures(pages, artifactDir, "private-draft");
  const submit1 = await clickPost(company, origin, root + "/" + id + "/closures/submit",
    closurePanel(company).getByRole("button", { name: "Enviar cierre a revisión", exact: true }), 200);
  assert.equal(submit1.payload.expectedRevisionNo, 1);
  let visible = (await row(s.professional, id)).closure;
  assert.equal(visible?.currentRevision?.id, first.currentRevision.id);
  assert.equal(visible?.currentRevision?.contribution, draftContribution);
  assert.equal(visible?.currentRevision?.status, "SUBMITTED");
  const submitted = await db.terraqoClosureRevision.findUniqueOrThrow({ where: { id: first.currentRevision.id }, include: { references: true } });
  assert.ok(submitted.submittedAt);

  phase("s17-protected-reference-image");
  const referenceId = first.currentRevision.references[0].id;
  const mediaPath = `${root}/${id}/closure-references/${f.solo.revision}/media/${f.photoId}`;
  for (const [context, view] of [[s.company, "workspace"], [s.professional, "professional"]] as const) {
    const image = await context.request.get(`${mediaPath}?view=${view}&referenceId=${referenceId}`, options);
    assert.equal(image.status(), 200);
    assert.match(image.headers()["cache-control"], /no-store/);
    assert.equal(image.headers()["content-type"], "image/webp");
    assert.equal(image.headers()["etag"], undefined);
    const bytes = await image.body();
    assert.equal(bytes.subarray(0, 4).toString(), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString(), "WEBP");
  }
  for (const [context, status] of [[s.other, 404], [s.anonymous, 401]] as const)
    assert.equal((await context.request.get(`${mediaPath}?view=workspace&referenceId=${referenceId}`, options)).status(), status);
  await visitClosure(professional, origin, false, id);
  const evidence = closurePanel(professional).getByRole("region", { name: "Referencias autorizadas" });
  await evidence.locator("summary").first().click();
  const image = evidence.getByRole("img", { name: "Evidencia autorizada 1", exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await captures(pages, artifactDir, "protected-reference");

  phase("s17-request-correction-new-draft-not-exposed");
  await visitClosure(professional, origin, false, id);
  const correction = "Precisar el resultado sintético " + f.run;
  await closurePanel(professional).getByLabel("Comentario para corrección o desacuerdo", { exact: true }).fill(correction);
  const correctionResponse = await clickPost(professional, origin, "/api/v1/closures/" + first.id + "/decision",
    closurePanel(professional).getByRole("button", { name: "Solicitar corrección", exact: true }), 200);
  assert.equal(correctionResponse.payload.expectedRevisionNo, 1);
  const afterCorrection = await db.terraqoClosureRevision.findUniqueOrThrow({ where: { id: submitted.id }, include: { references: true } });
  assert.equal(afterCorrection.decisionComment, correction);
  const revisedContribution = "Corrección privada pendiente S16 " + f.run;
  await visitClosure(company, origin, true, id);
  const closeUI = closurePanel(company);
  await expect(closeUI).toHaveAttribute("aria-busy", "false");
  await closeUI.getByLabel("Contribución realizada", { exact: true }).fill(revisedContribution);
  await closeUI.getByLabel("Resultado", { exact: true }).fill("Resultado corregido sintético S16");
  const second = await clickPost<NonNullable<Row["closure"]>>(company, origin, root + "/" + id + "/closures",
    closeUI.getByRole("button", { name: "Guardar borrador", exact: true }), 201);
  assert.ok(second.data.currentRevision);
  noSecrets(second.data, []);
  const secondRevision = second.data.currentRevision;
  ids.revisions.push(secondRevision.id);
  assert.equal(secondRevision.revisionNo, 2);
  assert.equal(secondRevision.status, "DRAFT");
  assert.deepEqual(second.payload.referenceSources, [selectedSource], "UI must preserve the exact authorized source");
  visible = (await row(s.professional, id)).closure;
  assert.equal(visible?.currentRevision?.id, submitted.id);
  assert.deepEqual(visible?.revisions.map(value => value.revisionNo), [1]);
  assert.equal(visible?.currentRevision?.contribution, draftContribution);
  noSecrets(visible, [revisedContribution, secondRevision.id]);
  const preserved = await db.terraqoClosureRevision.findUniqueOrThrow({ where: { id: submitted.id }, include: { references: true } });
  for (const key of ["contribution", "result", "deliverables", "authorizedExcerpt", "submittedAt", "decisionComment", "references"] as const)
    assert.deepEqual(preserved[key], afterCorrection[key], "Prior sent content/history must survive: " + key);
  await visitClosure(professional, origin, false, id);
  assert.ok(!(await professional.locator("body").innerText()).includes(revisedContribution));
  await expect(closurePanel(professional).getByText(draftContribution, { exact: true })).toBeVisible();
  await captures(pages, artifactDir, "correction-private-draft");

  phase("s17-exact-resubmit-accept-private-certificate");
  await expect(closeUI).toHaveAttribute("aria-busy", "false");
  const sent2 = await clickPost(company, origin, root + "/" + id + "/closures/submit",
    closeUI.getByRole("button", { name: "Enviar cierre a revisión", exact: true }), 200);
  assert.equal(sent2.payload.expectedRevisionNo, 2);
  visible = (await row(s.professional, id)).closure;
  assert.equal(visible?.currentRevision?.id, secondRevision.id);
  assert.equal(visible?.currentRevision?.contribution, revisedContribution);
  assert.deepEqual(visible?.revisions.map(value => value.revisionNo), [2, 1]);
  await post(s.professional, origin, "/api/v1/closures/" + first.id + "/decision", { action: "ACCEPT", expectedRevisionNo: 1 }, 409);
  await visitClosure(professional, origin, false, id);
  const finalDecision = await clickPost(professional, origin, "/api/v1/closures/" + first.id + "/decision",
    closurePanel(professional).getByRole("button", { name: "Aceptar y emitir constancia", exact: true }), 200);
  assert.equal(finalDecision.payload.expectedRevisionNo, 2);
  const certified = await row(s.professional, id);
  assert.equal(certified.status, "CLOSED");
  const certificate = certified.closure?.certificate;
  assert.ok(certificate);
  ids.certificates.push(certificate.id);
  assert.equal(certificate.privateByDefault, true);
  assert.equal(certificate.scope, scope);
  assert.equal(certificate.proposalRevisionNo, 1);
  assert.equal(certificate.closureRevisionNo, 2);
  assert.ok(Number.isFinite(Date.parse(certificate.issuedAt)));
  const storedCertificate = await db.terraqoCollaborationCertificate.findUniqueOrThrow({ where: { id: certificate.id } });
  assert.equal(storedCertificate.closureRevisionId, secondRevision.id);
  assert.equal(storedCertificate.issuedById, f.author);
  assert.equal(certificate.workspaceName, (await db.terraqoWorkspace.findUniqueOrThrow({ where: { id: f.workspace } })).name);
  assert.equal(certificate.professionalName, (await db.user.findUniqueOrThrow({ where: { id: f.author } })).name);
  for (const [page, isCompany] of [[company, true], [professional, false]] as const) {
    await visitClosure(page, origin, isCompany, id);
    const closePanel = closurePanel(page);
    await expect(closePanel.getByRole("heading", { name: "Constancia de colaboración", exact: true })).toBeVisible();
    for (const label of ["Partes", "Versiones aceptadas", "Emitida · Hora de Perú", "Alcance de la constancia"])
      await expect(closePanel.getByText(label, { exact: true })).toBeVisible();
    const certificateFields = closePanel.locator("dl").filter({ has: page.getByText("Partes", { exact: true }) });
    await expect(certificateFields.getByText(scope, { exact: true })).toBeVisible();
    const issuedAt = new Intl.DateTimeFormat("es-PE", {
      dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima",
    }).format(new Date(certificate.issuedAt));
    await expect(certificateFields.getByText(issuedAt, { exact: true })).toBeVisible();
    await expect(closePanel.getByText("Alcance v1 · Cierre v2", { exact: true })).toBeVisible();
    await expect(closePanel.getByText(certificate.workspaceName + " · " + certificate.professionalName, { exact: true }).last()).toBeVisible();
  }
  await captures(pages, artifactDir, "private-certificate");

  phase("synthetic-second-conversation-cancellation-history-replay");
  const cancellable = await seedCancellation(db, f, ids);
  const historyBefore = await db.terraqoCollaborationProposal.findMany({ where: { collaborationId: cancellable.id }, include: { acceptances: true } });
  await visit(company, origin, true, cancellable.conversationId);
  const cancelCard = proposalPanel(company).getByRole("article").filter({ has: company.getByRole("heading", { name: "Cancelación S16", exact: true }) });
  await cancelCard.getByText("Cancelar colaboración", { exact: true }).click();
  const reason = "Cancelación sintética motivada " + f.run;
  await cancelCard.getByLabel("Motivo de cancelación", { exact: true }).fill(reason);
  const cancellation = await clickPost<{ id: string; version: number; cancelledAt: string }>(company, origin,
    root + "/" + cancellable.id + "/cancel", cancelCard.getByRole("button", { name: "Confirmar cancelación", exact: true }), 200);
  assert.equal(cancellation.payload.expectedVersion, cancellable.version);
  assert.ok(cancellation.key);
  const afterCancel = await db.terraqoCollaboration.findUniqueOrThrow({ where: { id: cancellable.id } });
  const eventsBefore = await db.activityLog.findMany({ where: { entityId: cancellable.id, id: { startsWith: "collaboration-cancel:v1:" } } });
  assert.equal(eventsBefore.length, 1);
  assert.equal(afterCancel.version, cancellable.version + 1);
  assert.equal(afterCancel.status, "CANCELLED");
  // A later profile rename must not rewrite the responsible actor in the receipt/GET.
  await db.user.update({ where: { id: f.owner }, data: { name: "Nombre posterior S16 " + f.run } });
  const retry = await post<{ id: string; version: number; cancelledAt: string }>(s.company, origin,
    root + "/" + cancellable.id + "/cancel", cancellation.payload, 200, cancellation.key);
  assert.deepEqual(retry, cancellation.data);
  await post(s.company, origin, root + "/" + cancellable.id + "/cancel",
    { ...cancellation.payload, reason: "Otro motivo sintético" }, 409, cancellation.key);
  assert.deepEqual(await db.terraqoCollaboration.findUniqueOrThrow({ where: { id: cancellable.id } }), afterCancel);
  assert.deepEqual(await db.activityLog.findMany({ where: { entityId: cancellable.id, id: { startsWith: "collaboration-cancel:v1:" } } }), eventsBefore);
  assert.deepEqual(await db.terraqoCollaborationProposal.findMany({ where: { collaborationId: cancellable.id }, include: { acceptances: true } }), historyBefore);
  for (const [context, workspace] of [[s.company, true], [s.professional, false]] as const) {
    const historical = await row(context, cancellable.id, workspace);
    assert.equal(historical.status, "CANCELLED");
    assert.equal(historical.cancellationReason, reason);
    assert.equal(historical.cancelledAt, afterCancel.cancelledAt?.toISOString());
    assert.equal(historical.cancellationActor?.id, f.owner);
    assert.equal(historical.cancellationActor?.name, "Responsable S13");
  }
  for (const [page, isCompany] of [[company, true], [professional, false]] as const) {
    await visit(page, origin, isCompany, cancellable.conversationId);
    await expect(proposalPanel(page).getByText(reason, { exact: true })).toBeVisible();
    await expect(proposalPanel(page).getByText("Responsable: Responsable S13", { exact: true })).toBeVisible();
  }
  await captures(pages, artifactDir, "cancelled-history");

  phase("anonymous-other-tenant-isolation-no-sharing-side-effects");
  for (const [context, suffix, expectedIds] of [
    [s.company, "?view=workspace&", [id]],
    [s.professional, "?", [id]],
    [s.other, "?view=workspace&", []],
    [s.other, "?", []],
  ] as const) {
    const response = await context.request.get(root + suffix + "collaborationId=" + encodeURIComponent(id), options);
    assert.equal(response.status(), 200);
    assert.deepEqual((await response.json()).data.map((item: { id: string }) => item.id), expectedIds,
      "Exact-id lookup must retain the authorized audience scope");
  }
  for (const prefix of ["admin", "portal"]) {
    const route = `/${prefix}/colaboraciones/${encodeURIComponent(id)}/cierre`;
    const denied = await s.other.request.get(route, options);
    assert.ok((prefix === "portal" ? [404, 307] : [404]).includes(denied.status()), "Other tenant must not open a dedicated closure page");
    const anonymous = await s.anonymous.request.get(route, options);
    assert.ok([302, 303, 307, 401].includes(anonymous.status()), "Anonymous closure page must require login");
  }
  assert.deepEqual(await rows(s.other, true), []);
  assert.deepEqual(await rows(s.other), []);
  for (const suffix of ["", "?view=workspace"])
    assert.equal((await s.anonymous.request.get(root + suffix, options)).status(), 401);
  for (const [context, status] of [[s.anonymous, 401], [s.other, 404]] as const) {
    await post(context, origin, root + "/" + id + "/decision", { action: "ACCEPT", expectedRevisionNo: 1 }, status);
    await post(context, origin, root + "/" + id + "/closures", { contribution: "Intento ajeno sintético", deliverables: ["Nada"],
      result: "Sin acceso", referenceRevisionIds: [f.solo.revision], expectedVersion: 2 }, status === 404 ? 403 : status);
    await post(context, origin, root + "/" + id + "/closures/submit", { expectedRevisionNo: 2 }, status === 404 ? 403 : status);
    await post(context, origin, "/api/v1/closures/" + first.id + "/decision", { action: "ACCEPT", expectedRevisionNo: 2 }, status);
    await post(context, origin, root + "/" + cancellable.id + "/cancel", { reason: "Intento ajeno", expectedVersion: afterCancel.version }, status === 404 ? 403 : status);
    const messages = await context.request.get("/api/terraqo/messages?peek=1&conversation=" + conversation, options);
    if (status === 401) assert.equal(messages.status(), 401);
    else { assert.equal(messages.status(), 200); const hub = (await messages.json()).data;
      assert.equal(hub.selected, null); assert.deepEqual(hub.conversations, []); }
  }
  assert.deepEqual(await sharingSnapshot(db, f), beforeSharing, "Closure/cancellation must not grant, publish, move media or add memberships");
  assert.deepEqual(runtimeErrors, [], "Browser runtime errors");
  return { artifactDir, browserWidths: [1440, 375, 320], controls: "backend-and-dedicated-pages",
    phaseComplete: false, uxPass: false, referenceSelection: "public-cv-exact-source-via-ui",
    cancellation: "separate-synthetic-conversation-real-ui-post-get-replay", uploads: "none" };
}

export async function runS16Journey(input: { origin: string; target: "local" | "staging"; commit: string; blobRun: string }) {
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  let phase = "database-identity";
  const step = (value: string) => { phase = value; console.log(JSON.stringify({ gate: "s16-s17-draft", phase })); };
  try {
    assert.deepEqual(await db.$queryRaw`SELECT current_user AS role, current_database() AS database`,
      [{ role: input.target === "local" ? "terraqo_s22_test" : "terraqo_staging_runtime", database: "postgres" }]);
    step("seed-exact-s15-fixture");
    // No cleanup is armed if seed fails before ownership is returned.
    const f = await seedConversation(db, input.commit, input.blobRun), ids = ownedIds();
    const failures: unknown[] = [];
    let result: Awaited<ReturnType<typeof journey>> | undefined;
    try {
      const browser = await chromium.launch();
      try {
        const sessions: Sessions = {
          company: await sharingSession(browser, input.origin, f.owner, f.password),
          professional: await sharingSession(browser, input.origin, f.author, f.password),
          other: await sharingSession(browser, input.origin, f.otherOwner, f.password),
          anonymous: await sharingSession(browser, input.origin),
        };
        result = await journey(sessions, db, f, ids, input.origin, step);
      } finally { await browser.close(); }
    } catch (error) {
      const failure = error as { name?: string; code?: string; stack?: string; actual?: unknown; expected?: unknown };
      console.error(JSON.stringify({ gate: "s16-s17-draft", failedPhase: phase, name: failure.name,
        code: failure.code, errorType: failure.name, locations: failure.stack?.split("\n").filter(line => /\bat .*s16-/.test(line)).slice(0, 4),
        actual: typeof failure.actual === "number" ? failure.actual : undefined,
        expected: typeof failure.expected === "number" ? failure.expected : undefined }));
      failures.push(error);
    }
    finally {
      step("cleanup-independent-readback");
      try { await cleanS16(db, f, ids); console.log(JSON.stringify({ gate: "s16-s17-draft", cleanup: "verified", run: f.run })); }
      catch (error) {
        const diagnostic = (value: unknown): object => {
          const e = value as { name?: string; code?: string; stack?: string; errors?: unknown[] };
          return { name: e.name, code: e.code,
            locations: e.stack?.split("\n").filter(line => /\bat .*scripts/.test(line)).slice(0, 4),
            causes: e.errors?.map(diagnostic) };
        };
        console.error(JSON.stringify({ gate: "s16-s17-draft", cleanup: "failed", run: f.run, error: diagnostic(error) }));
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, "S16 journey/cleanup failed");
    assert.ok(result);
    return { run: f.run, databaseCleanup: "independent-readback", ...result };
  } finally { await db.$disconnect(); }
}
