import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";
import type { BrowserContext, Page } from "playwright";
import type { ConversationFixture } from "./s15-conversation-fixture";
import { uploadMessageJourney } from "./s15-message-media";

const requests = "/api/v1/conversation-requests", messages = "/api/terraqo/messages";
const dossiers = "/api/v1/evaluation-dossiers";
type Sessions = Record<"company" | "professional" | "publisher" | "other" | "anonymous", BrowserContext>;

export async function conversationJourney(s: Sessions, db: PrismaClient, f: ConversationFixture, origin: string,
  dossierIds: string[], conversationIds: string[], localMedia: boolean, phase: (value: string) => void) {
  const options = { maxRedirects: 0, timeout: 45_000 };
  const headers = (key = randomUUID()) => ({ Origin: origin, "Idempotency-Key": key });
  const privateSummary = "S15-private-dossier-" + f.run;
  const failures: string[] = [];
  const artifacts = resolve("output/playwright/s15", f.run);
  await mkdir(artifacts, { recursive: true });
  const company = await s.company.newPage(), professional = await s.professional.newPage(), publisher = await s.publisher.newPage();
  for (const page of [company, professional, publisher]) page.on("pageerror", error => failures.push(error.name));
  const grantsBefore = await db.terraqoAccessGrant.count({ where: { subjectUserId: { in: [f.author, f.publisher] } } });

  async function post(context: BrowserContext, path: string, data: object, status: number, key = randomUUID()) {
    const response = await context.request.post(path, { ...options, headers: headers(key), data });
    assert.equal(response.status(), status, path + " unexpected status");
    return response.json();
  }
  async function list(context: BrowserContext, path: string) {
    const response = await context.request.get(path, options);
    assert.equal(response.status(), 200, path + " unavailable");
    return (await response.json()).data;
  }
  function noPrivate(value: unknown) {
    const serialized = JSON.stringify(value);
    for (const secret of [privateSummary, f.term, ...dossierIds])
      assert.ok(!serialized.includes(secret), "Private dossier context leaked to an external actor");
  }
  async function noAutoGrant() {
    assert.equal(await db.terraqoWorkspaceMember.count({ where: { userId: { in: [f.author, f.publisher] } } }), 0);
    assert.equal(await db.terraqoAccessGrant.count({ where: { subjectUserId: { in: [f.author, f.publisher] } } }), grantsBefore);
    assert.equal((await s.professional.request.get(dossiers, options)).status(), 403);
    assert.equal((await s.professional.request.get("/api/v1/collaborations?view=workspace", options)).status(), 403);
  }

  phase("create-private-dossiers");
  for (const scoped of [false, true]) {
    const result = await post(s.company, dossiers, { needRevisionId: f.revision,
      professionalProfileId: scoped ? f.scopedProfile : f.profile,
      worklogRevisionIds: [scoped ? f.limited.revision : f.solo.revision],
      ...(scoped ? { sourceRefs: [{ revisionId: f.limited.revision, accessKind: "PUBLIC_SELECTION", accessReferenceId: f.projection }] } : {}),
      privateSummary }, 201);
    dossierIds.push(result.data.id);
  }
  const source = await db.terraqoEvaluationSource.findFirstOrThrow({ where: { dossierId: dossierIds[0] } });
  async function request(dossierId: string, note: string) {
    const key = randomUUID(), payload = { dossierId, note };
    const first = (await post(s.company, requests, payload, 201, key)).data;
    const replay = (await post(s.company, requests, payload, 201, key)).data;
    assert.equal(first.id, replay.id);
    assert.equal(first.status, "PENDING");
    assert.equal(first.conversationId, null);
    await post(s.company, requests, payload, 409);
    return first as { id: string; version: number; status: string; conversationId: string | null };
  }
  async function decide(page: Page, context: BrowserContext, row: { id: string; version: number }, note: string,
    action: "ACCEPT" | "REJECT" | "BLOCK" | "REPORT") {
    await page.goto(origin + "/portal/mensajes", { waitUntil: "domcontentloaded" });
    const card = page.getByRole("article").filter({ has: page.getByText(note, { exact: true }) });
    await card.getByText("Pendiente", { exact: true }).waitFor();
    assert.equal(await card.getByRole("link", { name: "Abrir conversación" }).count(), 0);
    const incoming = (await list(context, requests)).find((item: { id: string }) => item.id === row.id);
    assert.equal(incoming.context.kind, "PROTECTED");
    noPrivate(incoming);
    if (action === "BLOCK" || action === "REPORT") await card.getByLabel("Motivo, solo si bloqueas o reportas").fill("Solicitud sintética de prueba S15");
    const label = { ACCEPT: "Aceptar", REJECT: "Rechazar", BLOCK: "Bloquear", REPORT: "Reportar" }[action];
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url() === origin + requests + "/" + row.id + "/decision" && r.request().method() === "POST"),
      card.getByRole("button", { name: label, exact: true }).click(),
    ]);
    assert.equal(response.status(), 200);
    // Decision responses must be projected too, not only the GET list.
    noPrivate(await response.json());
    const saved = await db.terraqoConversationRequest.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(saved.status, action === "ACCEPT" ? "ACCEPTED" : action === "REJECT" ? "REJECTED" : "BLOCKED");
    assert.equal(saved.version, row.version + 1);
    assert.equal(Boolean(saved.reportedAt), action === "REPORT");
    assert.equal(Boolean(saved.blockedAt), action === "BLOCK" || action === "REPORT");
    if (action !== "ACCEPT") assert.equal(saved.conversationId, null);
    await post(context, requests + "/" + row.id + "/decision", { action, expectedVersion: row.version, reason: "Reintento S15" }, 409);
    return saved;
  }

  phase("pending-reject-isolation");
  const rejectedNote = "S15 rechazar " + f.run, pending = await request(dossierIds[0], rejectedNote);
  assert.equal(await db.terraqoConversation.count({ where: { workspaceId: f.workspace } }), 0);
  assert.deepEqual(await list(s.other, requests), []);
  assert.equal((await s.anonymous.request.get(requests, options)).status(), 401);
  for (const [context, status] of [[s.company, 404], [s.other, 404], [s.anonymous, 401]] as const)
    await post(context, requests + "/" + pending.id + "/decision", { action: "ACCEPT", expectedVersion: 1 }, status);
  await decide(professional, s.professional, pending, rejectedNote, "REJECT");

  phase("accept-external-professional");
  const acceptedNote = "S15 conversar " + f.run, acceptedRequest = await request(dossierIds[0], acceptedNote);
  const accepted = await decide(professional, s.professional, acceptedRequest, acceptedNote, "ACCEPT");
  assert.ok(accepted.conversationId);
  const conversationId = accepted.conversationId;
  conversationIds.push(conversationId);
  await noAutoGrant();
  assert.equal(await db.terraqoCollaboration.count({ where: { workspaceId: f.workspace } }), 0);
  const hub = await list(s.professional, messages + "?peek=1&conversation=" + conversationId);
  assert.equal(hub.selected?.id, conversationId);
  assert.deepEqual(hub.workspaces, []);
  assert.deepEqual(hub.meetWorkspaceIds, []);
  assert.ok(hub.selected.contexts.length > 0);
  for (const context of hub.selected.contexts) {
    assert.equal(context.protected, true);
    assert.equal(context.referenceId, null);
    assert.equal(context.labelSnapshot, "Contexto profesional protegido");
  }
  noPrivate(hub);
  const acceptedCard = professional.getByRole("article").filter({ has: professional.getByText(acceptedNote, { exact: true }) });
  await acceptedCard.getByRole("link", { name: "Abrir conversación" }).click();
  await professional.waitForURL(url => url.searchParams.get("conversation") === conversationId);
  await professional.getByRole("textbox", { name: "Escribe un mensaje", exact: true }).waitFor();
  assert.equal(new URL(professional.url()).searchParams.get("conversation"), conversationId);
  assert.ok(!(await professional.locator("body").innerText()).includes(privateSummary));
  await company.goto(origin + "/admin/mensajes", { waitUntil: "domcontentloaded" });
  await company.getByRole("article").filter({ has: company.getByText(acceptedNote, { exact: true }) })
    .getByRole("link", { name: "Abrir conversación" }).click();
  await company.waitForURL(url => url.searchParams.get("conversation") === conversationId);
  await company.getByRole("textbox", { name: "Escribe un mensaje", exact: true }).waitFor();
  assert.equal(new URL(company.url()).searchParams.get("conversation"), conversationId);

  phase("composer-draft-reload-send-replay");
  const body = "Contenido privado de conversación S15 " + f.run;
  const draftKey = `terraqo:message-draft:v2:${encodeURIComponent(f.author)}:${encodeURIComponent(conversationId)}`;
  const composer = professional.getByRole("textbox", { name: "Escribe un mensaje", exact: true });
  await composer.fill(body);
  await professional.waitForFunction(({ key, body }) => JSON.parse(localStorage.getItem(key) || "{}").body === body, { key: draftKey, body });
  await professional.reload({ waitUntil: "domcontentloaded" });
  await composer.waitFor();
  await professional.waitForFunction(body => (document.querySelector('[aria-label="Escribe un mensaje"]') as HTMLTextAreaElement)?.value === body, body);
  const [sent] = await Promise.all([
    professional.waitForResponse(r => r.url() === origin + messages && r.request().method() === "POST"),
    composer.press("Enter"),
  ]);
  assert.equal(sent.status(), 200);
  const payload = sent.request().postDataJSON(), message = (await sent.json()).data;
  assert.equal(payload.conversationId, conversationId);
  assert.equal(payload.body, body);
  assert.match(payload.operationKey, /^[a-f0-9-]{36}$/);
  for (const result of await Promise.all([post(s.professional, messages, payload, 200), post(s.professional, messages, payload, 200)]))
    assert.equal(result.data.id, message.id);
  await post(s.professional, messages, { ...payload, body: body + " cambiado" }, 409);
  assert.equal(await db.terraqoDirectMessage.count({ where: { conversationId, body } }), 1);
  assert.equal(await db.terraqoMessageOperation.count({ where: { actorId: f.author, operationKey: payload.operationKey } }), 1);
  await professional.waitForFunction(key => {
    const draft = JSON.parse(localStorage.getItem(key) || "{}");
    return draft.body === "" && draft.pending === null;
  }, draftKey);

  phase("neutral-activity-pulse");
  const pulse = await list(s.company, "/api/terraqo/activity-pulse");
  assert.equal(pulse.latestEvent?.channel, "message");
  assert.equal(pulse.latestEvent?.href, "/portal/mensajes?conversation=" + conversationId);
  assert.ok(typeof pulse.latestEvent.body === "string" && pulse.latestEvent.body.length > 0);
  assert.ok(!JSON.stringify(pulse).includes(body), "activity-pulse exposed contextual message body");
  noPrivate(pulse);
  await company.reload({ waitUntil: "domcontentloaded" });
  await company.getByLabel("Historial de mensajes", { exact: true }).getByText(body, { exact: true }).waitFor();
  const reply = "Respuesta empresa S15 " + f.run;
  const companyComposer = company.getByRole("textbox", { name: "Escribe un mensaje", exact: true });
  await companyComposer.fill(reply);
  const [responded] = await Promise.all([
    company.waitForResponse(r => r.url() === origin + messages && r.request().method() === "POST"), companyComposer.press("Enter"),
  ]);
  assert.equal(responded.status(), 200);
  const externalPulse = await list(s.professional, "/api/terraqo/activity-pulse");
  assert.equal(externalPulse.latestEvent?.channel, "message");
  assert.ok(!JSON.stringify(externalPulse).includes(reply));
  noPrivate(externalPulse);

  phase("tenant-anonymous-dossier-isolation");
  for (const [context, status] of [[s.other, 403], [s.publisher, 403], [s.anonymous, 401]] as const) {
    await post(context, messages, { ...payload, operationKey: randomUUID() }, status);
    const response = await context.request.get(messages + "?peek=1&conversation=" + conversationId, options);
    if (context === s.anonymous) assert.equal(response.status(), 401);
    else {
      assert.equal(response.status(), 200);
      const data = (await response.json()).data;
      assert.equal(data.selected, null);
      assert.deepEqual(data.conversations, []);
      assert.ok(!JSON.stringify(data).includes(body));
    }
  }
  for (const [context, status] of [[s.professional, 403], [s.other, 404], [s.anonymous, 401]] as const)
    assert.equal((await context.request.get(`${dossiers}/${dossierIds[0]}/sources/${source.id}`, options)).status(), status);
  await noAutoGrant();

  phase("safe-attachments");
  const before = await db.terraqoDirectMessage.count({ where: { conversationId } });
  const invalid = await s.professional.request.post(messages + "/attachments", { ...options, headers: headers(), multipart: {
    conversationId, operationKey: randomUUID(), body: "Rejected MIME", file: { name: "unsafe.html", mimeType: "text/html", buffer: Buffer.from("<script>alert(1)</script>") },
  } });
  assert.equal(invalid.status(), 400);
  const badPdf = await s.professional.request.post(messages + "/attachments", { ...options, headers: headers(), multipart: {
    conversationId, operationKey: randomUUID(), body: "Rejected PDF signature",
    file: { name: "not-a-pdf.pdf", mimeType: "application/pdf", buffer: Buffer.from("This is not a PDF file.") },
  } });
  assert.equal(badPdf.status(), 400);
  // Use actual oversized bytes: HTTP clients may normalize Content-Length.
  const oversized = await s.professional.request.post(messages + "/attachments", { ...options,
    headers: { ...headers(), "Content-Type": "multipart/form-data; boundary=s15-preflight" },
    data: Buffer.alloc(20 * 1024 * 1024 + 65_537, 32),
  });
  assert.equal(oversized.status(), 413);
  assert.equal(await db.terraqoDirectMessage.count({ where: { conversationId } }), before);
  phase("attachment-upload-read-replay");
  const uploaded = await uploadMessageJourney(s, db, f, conversationId, origin);
  if (localMedia) {
    // Read the existing S24 synthetic bytes from the disposable local store. No upload or remote blob mutation.
    const media = await db.terraqoDirectMessage.create({ data: { conversationId, senderId: f.owner, body: "Plano sintético S15",
      attachmentItems: { create: { storageKey: f.plan.key, fileName: "plano.webp", contentType: "image/webp", size: f.plan.bytes.length, kind: "IMAGE" } } }, include: { attachmentItems: true } });
    const path = messages + "/attachments/" + media.attachmentItems[0].id;
    for (const context of [s.company, s.professional]) {
      const response = await context.request.get(path, options);
      assert.equal(response.status(), 200);
      assert.equal(response.headers()["x-content-type-options"], "nosniff");
      assert.equal(response.headers()["content-type"], "image/webp");
      assert.ok(response.headers()["cache-control"].startsWith("private"));
      assert.equal(createHash("sha256").update(await response.body()).digest("hex"), f.plan.sha256);
    }
    for (const [context, status] of [[s.other, 404], [s.publisher, 404], [s.anonymous, 401]] as const)
      assert.equal((await context.request.get(path, options)).status(), status);
    await professional.reload({ waitUntil: "domcontentloaded" });
    await professional.locator(`img[src="${path}"]`).first().waitFor();
  }

  phase("explicit-collaboration-proposal");
  assert.equal(await db.terraqoCollaboration.count({ where: { workspaceId: f.workspace } }), 0);
  await company.getByLabel("Profesional y conversación").selectOption(conversationId);
  await company.getByLabel("Alcance de esta versión").fill("Levantamiento sintético explícito S15 " + f.run);
  await company.getByLabel("Rol propuesto").fill("Especialista S15");
  await company.getByLabel("Entregables, uno por línea").fill("Plano sintético de prueba");
  const [proposal] = await Promise.all([
    company.waitForResponse(r => r.url() === origin + "/api/v1/collaborations" && r.request().method() === "POST"),
    company.getByRole("button", { name: "Enviar propuesta", exact: true }).click(),
  ]);
  assert.equal(proposal.status(), 201);
  const collaboration = (await proposal.json()).data;
  assert.equal(collaboration.conversation.id, conversationId);
  assert.equal(collaboration.status, "PROPOSAL_PENDING");
  assert.equal(collaboration.proposals[0].status, "PENDING");
  assert.deepEqual(collaboration.proposals[0].acceptances.map((a: { party: string }) => a.party), ["WORKSPACE"]);
  await professional.reload({ waitUntil: "domcontentloaded" });
  await professional.getByText("Levantamiento sintético explícito S15 " + f.run, { exact: true }).waitFor();
  await noAutoGrant();

  phase("block-report");
  for (const [dossierId, page, context, action] of [[dossierIds[0], professional, s.professional, "BLOCK"],
    [dossierIds[1], publisher, s.publisher, "REPORT"]] as const) {
    const note = "S15 " + action + " " + f.run, row = await request(dossierId, note);
    await decide(page, context, row, note, action);
    await post(s.company, requests, { dossierId, note: "Nueva solicitud bloqueada" }, 403);
  }
  assert.equal(await db.terraqoConversation.count({ where: { workspaceId: f.workspace } }), 1);
  await noAutoGrant();
  for (const width of [375, 320]) {
    await professional.setViewportSize({ width, height: 900 });
    assert.ok(await professional.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "S15 horizontal overflow at " + width);
    await professional.screenshot({ path: resolve(artifacts, `professional-${width}.png`), fullPage: true });
  }
  await company.setViewportSize({ width: 1440, height: 960 });
  await company.screenshot({ path: resolve(artifacts, "company-1440.png"), fullPage: true });
  phase("requester-membership-revoked");
  await db.terraqoWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId: f.workspace, userId: f.owner } }, data: { active: false } });
  const revokedRequests = await list(s.company, requests);
  assert.ok(revokedRequests.length > 0);
  for (const row of revokedRequests) {
    assert.equal(row.context.kind, "PROTECTED");
    assert.equal(row.context.revisionNo, null);
  }
  noPrivate(revokedRequests);
  await post(s.company, messages, { action: "send", conversationId, body: "Revoked requester must not send", operationKey: randomUUID() }, 403);
  const revokedHub = await list(s.company, messages + "?peek=1&conversation=" + conversationId);
  assert.equal(revokedHub.selected, null);
  assert.deepEqual(revokedHub.conversations, []);
  assert.deepEqual(failures, [], "Browser runtime errors");
  return { requests: ["PENDING", "ACCEPTED", "REJECTED", "BLOCKED", "REPORTED"], externalRecipientWithoutMembership: true,
    privateDossierAndContext: "denied-no-auto-grant", conversationReachable: ["company", "professional"], composerDraftReload: true,
    sendReplayAndConflict: true, activityPulse: "neutral-body", requesterRevocation: "neutral-requests-and-denied-messages", isolation: ["anonymous", "other-company", "other-professional"],
    collaboration: "explicit-ui-proposal-pending", attachmentRead: uploaded.read,
    attachmentUpload: uploaded, invalidAttachmentMime: "rejected-no-message",
    invalidPdfSignature: "rejected-no-message", oversizedAttachmentPreflight: "413-no-blob-write", browserWidths: [1440, 375, 320], artifacts };
}
