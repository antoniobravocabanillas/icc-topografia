import { createChatRecoveryLink } from "../lib/terraqo/chat-recovery-link";
import { assertAttentionTestTarget } from "./lib/customer-attention-test-target";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { chromium, type BrowserContext } from "playwright";

async function login(context: BrowserContext, origin: string, email: string, password: string) {
  const csrf = await context.request.get(`${origin}/api/auth/csrf`);
  assert.equal(csrf.status(), 200);
  const { csrfToken } = await csrf.json();
  assert.equal(typeof csrfToken, "string");
  await context.request.post(`${origin}/api/auth/callback/credentials`, {
    form: { csrfToken, email, password, callbackUrl: `${origin}/admin/chat` },
    headers: { "X-Auth-Return-Redirect": "1" },
  });
  const session = await context.request.get(`${origin}/api/auth/session`);
  assert.equal(session.status(), 200);
  assert.equal((await session.json()).user?.email, email, "Real credential sign-in failed");
}

/** Executes real authentication and Server Actions. Never runs against production. */
export async function verifyAuthenticatedAttention(db: PrismaClient, origin: string, workspaceId: string, otherWorkspaceId: string) {
  assertAttentionTestTarget(process.env, origin);
  const suffix = randomUUID();
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);
  const users: string[] = [], profiles: string[] = [], conversations: string[] = [];
  const browser = await chromium.launch({ ...(process.platform === "win32" ? { channel: "chrome" } : {}), headless: true });
  let phase = "fixtures";
  try {
    const admin = await db.user.create({ data: { name: "Attention admin fixture", email: `attention-admin-${suffix}@example.invalid`, role: "ADMIN", emailVerified: new Date(), passwordHash } }); users.push(admin.id);
    const advisor = await db.user.create({ data: { name: "Attention advisor fixture", email: `attention-advisor-${suffix}@example.invalid`, role: "SALES", emailVerified: new Date(), passwordHash } }); users.push(advisor.id);
    const outsider = await db.user.create({ data: { name: "Attention outsider fixture", email: `attention-other-${suffix}@example.invalid`, role: "ADMIN", emailVerified: new Date(), passwordHash } }); users.push(outsider.id);
    await db.terraqoWorkspaceMember.createMany({ data: [
      { workspaceId, userId: admin.id, role: "OWNER", active: true },
      { workspaceId, userId: advisor.id, role: "MANAGER", active: true },
      { workspaceId: otherWorkspaceId, userId: outsider.id, role: "OWNER", active: true },
    ] });
    const profile = await db.staffProfile.create({ data: { terraqoWorkspaceId: workspaceId, userId: advisor.id, displayName: "Asesor E2E", roleTitle: "Atención", tools: {} } }); profiles.push(profile.id);
    const chat = await db.chatConversation.create({ data: { terraqoWorkspaceId: workspaceId, customerName: `Visitor ${suffix}`, messages: { create: { sender: "customer", body: `Private attention ${suffix}` } } } }); conversations.push(chat.id);
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const advisorContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const outsiderContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    phase = "login";
    await login(adminContext, origin, admin.email!, password);
    await login(advisorContext, origin, advisor.email!, password);
    await login(outsiderContext, origin, outsider.email!, password);
    const url = `${origin}/admin/chat?conversation=${chat.id}`;
    const outsiderPage = await outsiderContext.newPage();
    await outsiderPage.goto(url);
    await outsiderPage.getByText("Conversación no disponible", { exact: true }).waitFor();
    assert.equal((await outsiderPage.locator("body").innerText()).includes(`Private attention ${suffix}`), false);
    phase = "initial-configuration";
    await outsiderPage.setViewportSize({ width: 390, height: 844 });
    await outsiderPage.goto(`${origin}/admin/chat/configuracion`);
    await outsiderPage.getByRole("heading", { name: "¿Cómo quieres atender?" }).waitFor();
    assert.equal(await outsiderPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await outsiderPage.screenshot({ path: "output/attention-objectives-mobile.png", fullPage: true });
    await outsiderPage.getByRole("button", { name: /^Agendar/ }).click();
    assert.match(await outsiderPage.getByLabel("Mensaje de bienvenida", { exact: true }).inputValue(), /confirmará la disponibilidad/);
    await outsiderPage.getByRole("button", { name: "Guardar borrador", exact: true }).click();
    await outsiderPage.getByRole("status").filter({ hasText: "Borrador guardado" }).waitFor();
    const settings = (await db.terraqoWorkspace.findUniqueOrThrow({ where: { id: otherWorkspaceId } })).settings as { customerAttention?: { published: unknown; revision: number } };
    assert.equal(settings.customerAttention?.published, null);
    assert.equal(settings.customerAttention?.revision, 1);
    await outsiderPage.reload();
    await outsiderPage.getByLabel("Mensaje de bienvenida", { exact: true }).waitFor();
    assert.equal(await outsiderPage.getByRole("heading", { name: "¿Cómo quieres atender?" }).count(), 0);
    const advisorPage = await advisorContext.newPage();
    await advisorPage.goto(url);
    await advisorPage.getByText("Conversación no disponible", { exact: true }).waitFor();
    phase = "assignment";
    const adminPage = await adminContext.newPage(); await adminPage.goto(url);
    await adminPage.getByLabel("Persona del equipo").selectOption(profile.id);
    await adminPage.getByRole("button", { name: "Asignar responsable", exact: true }).click();
    await adminPage.getByText("Cambio guardado.", { exact: true }).waitFor();
    assert.equal((await db.chatConversation.findUniqueOrThrow({ where: { id: chat.id } })).assignedToId, advisor.id);
    await advisorPage.reload();
    await advisorPage.getByLabel("Respuesta al cliente").waitFor();
    assert.equal(await advisorPage.getByRole("button", { name: "Asignar responsable", exact: true }).count(), 0);
    phase = "reply";
    const body = `Authorized reply ${suffix}`;
    await advisorPage.getByLabel("Respuesta al cliente").fill(body);
    await advisorPage.getByRole("button", { name: "Responder", exact: true }).click();
    await advisorPage.getByRole("log").getByText(body, { exact: true }).waitFor();
    assert.equal(await db.chatMessage.count({ where: { conversationId: chat.id, body } }), 1);
    phase = "private-note";
    await advisorPage.getByLabel("Nota interna").fill(`Private note ${suffix}`);
    await advisorPage.getByRole("button", { name: "Guardar nota", exact: true }).click();
    await advisorPage.getByText(`Private note ${suffix}`, { exact: true }).waitFor();
    assert.equal(await db.chatMessage.count({ where: { conversationId: chat.id, body: `Private note ${suffix}` } }), 0);
    phase = "stale-permission";
    await db.chatConversation.update({ where: { id: chat.id }, data: { assignedToId: null, assignedProfileId: null } });
    await advisorPage.getByLabel("Respuesta al cliente").fill(`Rejected reply ${suffix}`);
    await advisorPage.getByRole("button", { name: "Responder", exact: true }).click();
    await advisorPage.getByRole("alert").filter({ hasText: "No se confirmó" }).waitFor();
    assert.equal(await advisorPage.getByLabel("Respuesta al cliente").inputValue(), `Rejected reply ${suffix}`);
    assert.equal(await db.chatMessage.count({ where: { conversationId: chat.id, body: `Rejected reply ${suffix}` } }), 0);
    await advisorPage.getByLabel("Nota interna").fill(`Rejected note ${suffix}`);
    await advisorPage.getByRole("button", { name: "Guardar nota", exact: true }).click();
    await advisorPage.getByText("No se pudo guardar. Actualiza la conversación y vuelve a intentarlo.", { exact: true }).waitFor();
    assert.equal(await advisorPage.getByLabel("Nota interna").inputValue(), `Rejected note ${suffix}`);
    assert.equal(await db.activityLog.count({ where: { entityId: chat.id, body: `Rejected note ${suffix}` } }), 0);
    phase = "mobile";
    await adminPage.setViewportSize({ width: 390, height: 844 });
    await adminPage.goto(url);
    await adminPage.getByRole("link", { name: "Contacto, seguimiento y oportunidades →" }).click();
    await adminPage.getByLabel("Contexto de la solicitud").waitFor();
    assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await adminPage.screenshot({ path: "output/attention-authenticated-mobile.png", fullPage: true });
    phase = "automatic-routing";
    await adminPage.goto(`${origin}/admin/chat/configuracion`);
    await adminPage.getByLabel("Responsable inicial", { exact: true }).selectOption(profile.id);
    await adminPage.screenshot({ path: "output/attention-routing-mobile.png", fullPage: true });
    await adminPage.setViewportSize({ width: 1440, height: 1000 });
    await adminPage.screenshot({ path: "output/attention-routing-desktop.png", fullPage: true });
    await adminPage.getByRole("button", { name: "Guardar borrador", exact: true }).click();
    await adminPage.getByRole("status").filter({ hasText: "Borrador guardado" }).waitFor();
    await adminPage.getByRole("button", { name: "Publicar configuración", exact: true }).click();
    await adminPage.getByRole("status").filter({ hasText: "Configuración publicada" }).waitFor();
    const workspace = await db.terraqoWorkspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const configResponse = await adminContext.request.get(`${origin}/api/chat/config?workspace=${workspace.slug}`);
    assert.equal(configResponse.status(), 200);
    assert.equal("routing" in (await configResponse.json()).config, false);
    const routedResponse = await adminContext.request.post(`${origin}/api/chat?workspace=${workspace.slug}`, { headers: { "x-chat-protocol": "2" }, multipart: { name: "Routing browser fixture", body: "Consulta dirigida", operationKey: randomUUID() } });
    assert.equal(routedResponse.status(), 201);
    const routed = await routedResponse.json(); conversations.push(routed.conversationId);
    assert.equal((await db.chatConversation.findUniqueOrThrow({ where: { id: routed.conversationId } })).assignedToId, advisor.id);
    phase = "contact-rules";
    const contactTopic = (await (await adminContext.request.get(`${origin}/api/chat/config?workspace=${workspace.slug}`)).json()).config.topics[0] as string;
    await adminPage.getByLabel(`Correo electrónico para ${contactTopic}`, { exact: true }).selectOption("required");
    await adminPage.getByLabel(`Teléfono para ${contactTopic}`, { exact: true }).selectOption("hidden");
    await adminPage.setViewportSize({ width: 390, height: 844 });
    await adminPage.getByRole("heading", { name: "Motivos y datos de contacto", exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await adminPage.screenshot({ path: "output/attention-contact-settings-mobile.png" });
    await adminPage.getByRole("button", { name: "Guardar borrador", exact: true }).click();
    await adminPage.getByRole("status").filter({ hasText: "Borrador guardado" }).waitFor();
    await adminPage.getByRole("button", { name: "Publicar configuración", exact: true }).click();
    await adminPage.getByRole("status").filter({ hasText: "Configuración publicada" }).waitFor();
    const visitorContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const visitorPage = await visitorContext.newPage();
    await visitorPage.goto(`${origin}/atencion/${workspace.slug}`);
    await visitorPage.getByRole("button", { name: "Hablar con asesor humano", exact: true }).click();
    await visitorPage.getByLabel("Motivo de contacto", { exact: true }).selectOption(contactTopic);
    await visitorPage.getByLabel("Nombre y apellido", { exact: true }).fill("Contact browser fixture");
    const emailField = visitorPage.getByLabel("Correo electrónico · obligatorio", { exact: true });
    assert.equal(await emailField.getAttribute("required"), "");
    assert.equal(await visitorPage.locator('input[name="phone"]').count(), 0);
    await visitorPage.getByLabel("Tu consulta", { exact: true }).fill("Consulta con datos configurados");
    await emailField.scrollIntoViewIfNeeded();
    await visitorPage.screenshot({ path: "output/attention-contact-visitor-mobile.png" });
    assert.equal(await visitorPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const missingContact = await visitorContext.request.post(`${origin}/api/chat?workspace=${workspace.slug}`, { headers: { "x-chat-protocol": "2" }, multipart: { name: "Rejected contact fixture", topic: contactTopic, body: "Missing required contact", operationKey: randomUUID() } });
    assert.equal(missingContact.status(), 422);
    await emailField.fill("contact@example.invalid");
    const contactResponsePromise = visitorPage.waitForResponse(response => new URL(response.url()).pathname === "/api/chat" && response.request().method() === "POST");
    await visitorPage.getByRole("button", { name: "Iniciar chat", exact: true }).click();
    const contactResponse = await contactResponsePromise;
    assert.equal(contactResponse.status(), 201);
    const contactResult = await contactResponse.json(); conversations.push(contactResult.conversationId);
    const contactRow = await db.chatConversation.findUniqueOrThrow({ where: { id: contactResult.conversationId } });
    assert.equal(contactRow.customerEmail, "contact@example.invalid");
    assert.equal(contactRow.customerPhone, null);
    phase = "progressive-contact";
    await visitorPage.getByText("Compartir datos de contacto", { exact: true }).click();
    await visitorPage.getByLabel("Correo de contacto", { exact: true }).fill("later@example.invalid");
    assert.equal(await visitorPage.getByLabel("Teléfono de contacto", { exact: true }).count(), 0);
    await visitorPage.getByRole("button", { name: "Compartir con el equipo", exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await visitorPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await visitorPage.screenshot({ path: "output/attention-progressive-contact-mobile.png" });
    await visitorContext.setOffline(true);
    await visitorPage.getByRole("button", { name: "Compartir con el equipo", exact: true }).click();
    await visitorPage.getByRole("status").filter({ hasText: "Sin conexión" }).waitFor();
    assert.equal(await visitorPage.getByLabel("Correo de contacto", { exact: true }).inputValue(), "later@example.invalid");
    await visitorContext.setOffline(false);
    await visitorPage.getByRole("button", { name: "Compartir con el equipo", exact: true }).click();
    await visitorPage.getByRole("status").filter({ hasText: "Datos compartidos con el equipo" }).waitFor();
    const progressiveRow = await db.chatConversation.findUniqueOrThrow({ where: { id: contactResult.conversationId }, include: { messages: true } });
    assert.equal(progressiveRow.customerEmail, "later@example.invalid");
    assert.equal(progressiveRow.customerPhone, null);
    assert.equal(progressiveRow.messages.length, 1);
    assert.equal(await db.activityLog.count({ where: { entityId: contactResult.conversationId, title: "Contacto compartido por visitante" } }), 1);
    const hiddenContactResponse = await visitorContext.request.post(`${origin}/api/chat/contact?workspace=${workspace.slug}&conversationId=${contactResult.conversationId}`, { headers: { "x-chat-access": contactResult.accessToken }, data: { operationKey: randomUUID(), phone: "123456789" } });
    assert.equal(hiddenContactResponse.status(), 422);
    phase = "recovery-link";
    const recoveredContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const recoveredPage = await recoveredContext.newPage();
      const leakedRequests: string[] = [];
      recoveredPage.on("request", request => { if (request.url().includes(contactResult.accessToken) || request.url().includes("#terraqo-chat=")) leakedRequests.push("credential-in-url"); });
      await recoveredPage.goto(createChatRecoveryLink(contactResult.conversationId, contactResult.accessToken, origin + "/atencion/" + workspace.slug));
      await recoveredPage.getByRole("log").getByText("Consulta con datos configurados", { exact: true }).waitFor();
      assert.equal(new URL(recoveredPage.url()).hash, "");
      assert.equal(await recoveredPage.evaluate(key => localStorage.getItem(key), "terraqo-chat:" + workspace.slug), contactResult.conversationId);
      assert.deepEqual(leakedRequests, []);
      await recoveredPage.getByText("Continuar después", { exact: true }).click();
      await recoveredPage.getByRole("button", { name: "Copiar enlace privado", exact: true }).waitFor();
      await recoveredPage.screenshot({ path: "output/attention-recovery-link-mobile.png" });
    } finally { await recoveredContext.close(); }
    await visitorContext.close();
    phase = "revocation";
    await db.terraqoWorkspaceMember.updateMany({ where: { userId: advisor.id, workspaceId }, data: { active: false } });
    await advisorPage.goto(url);
    await advisorPage.waitForURL(value => value.origin === origin && value.pathname === "/cuenta");
    await advisorPage.getByRole("heading", { name: "Tu acceso a la empresa no está activo", exact: true }).waitFor();
    assert.equal((await advisorPage.locator("body").innerText()).includes(`Private attention ${suffix}`), false);
    await advisorPage.setViewportSize({ width: 390, height: 844 });
    assert.equal(await advisorPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await advisorPage.screenshot({ path: "output/attention-access-revoked-mobile.png", fullPage: true });
    await Promise.all([
      advisorPage.waitForNavigation({ waitUntil: "domcontentloaded" }),
      advisorPage.getByRole("button", { name: "Volver a comprobar", exact: true }).click(),
    ]);
    await advisorPage.getByRole("heading", { name: "Tu acceso a la empresa no está activo", exact: true }).waitFor();
    await Promise.all([
      advisorPage.waitForNavigation({ waitUntil: "domcontentloaded" }),
      advisorPage.getByRole("button", { name: "Cerrar sesión", exact: true }).click(),
    ]);
    await advisorPage.waitForURL(value => value.origin === origin && value.pathname === "/cuenta" && !value.search);
    const signedOutSession = await advisorContext.request.get(`${origin}/api/auth/session`);
    assert.equal(signedOutSession.status(), 200);
    assert.ok(!(await signedOutSession.json())?.user, "Sign-out must remove the authenticated session");
    await advisorPage.screenshot({ path: "output/attention-signed-out-mobile.png", fullPage: true });
    assert.equal(await advisorPage.getByRole("heading", { name: "Tu acceso a la empresa no está activo", exact: true }).count(), 0);
    await advisorPage.getByRole("region", { name: "Iniciar sesión", exact: true }).waitFor();
    console.log("PASS authenticated attention: credentials, admin assignment, advisor reply, tenant exclusion, private note, stale permission, draft preservation, mobile context and revoked membership.");
  } catch (error) {
    console.error(JSON.stringify({ authenticatedAttentionFailedAt: phase }));
    throw error;
  } finally {
    await browser.close();
    // Delete only tracked synthetic IDs, never a workspace-wide predicate.
    await db.activityLog.deleteMany({ where: { OR: [{ entityType: "ChatConversation", entityId: { in: conversations } }, { actorId: { in: users } }] } });
    await db.chatConversation.deleteMany({ where: { id: { in: conversations } } });
    await db.notification.deleteMany({ where: { href: { in: conversations.map(id => `/admin/chat?conversation=${id}`) } } });
    await db.staffProfile.deleteMany({ where: { id: { in: profiles } } });
    await db.terraqoWorkspaceMember.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    assert.equal(await db.user.count({ where: { id: { in: users } } }), 0);
    assert.equal(await db.chatConversation.count({ where: { id: { in: conversations } } }), 0);
    console.log("PASS authenticated fixtures cleaned by exact IDs.");
  }
}
