import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

let prisma: (typeof import("../lib/prisma"))["prisma"];

const origin = "https://portal.terraqoglobal.com";
const adminOrigin = "https://admin.terraqoglobal.com";
const local = "http://127.0.0.1:3881";
// The portal host exposes clean paths; middleware rewrites this internally to
// /portal/mensajes. Starting from the internal path would correctly redirect,
// but would also make a local reverse-proxy gate test an irrelevant redirect.
const targetPath = "/mensajes";
const outputDirectory = "output/playwright/b5-accessibility";
const fixturePrefix = "b5-browser-gate";
let phase = "guard";

function assertLocalDisposableDatabase() {
  const value = process.env.DATABASE_URL;
  assert.ok(value, "DATABASE_URL is required.");
  const url = new URL(value);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "Browser gate refuses non-local databases.");
  assert.equal(url.pathname.slice(1), "terraqo_b5_browser_gate", "Browser gate requires its dedicated disposable database.");
  assert.ok(process.env.AUTH_SECRET, "AUTH_SECRET is required.");
}

async function seedFixture() {
  const suffix = randomBytes(5).toString("hex");
  const password = randomBytes(24).toString("hex");
  const professional = await prisma.user.create({
    data: {
      email: `${fixturePrefix}-professional-${suffix}@example.test`,
      name: "Lucía Ramos",
      role: "CUSTOMER",
      emailVerified: new Date(),
      passwordHash: await bcrypt.hash(password, 12),
      terraqoProfessionalProfile: {
        create: {
          username: `${fixturePrefix}-${suffix}`,
          headline: "Especialista en levantamiento técnico",
          visibility: "PUBLIC",
        },
      },
    },
  });
  const companyPassword = randomBytes(24).toString("hex");
  const company = await prisma.user.create({
    data: {
      email: `${fixturePrefix}-company-${suffix}@example.test`,
      name: "Equipo técnico Andina",
      role: "ADMIN",
      emailVerified: new Date(),
      passwordHash: await bcrypt.hash(companyPassword, 12),
    },
  });
  const workspace = await prisma.terraqoWorkspace.create({
    data: {
      name: "Andina Ingeniería",
      slug: `${fixturePrefix}-${suffix}`,
      ownerUserId: company.id,
      modules: { create: { code: "PROFESSIONAL_MESSAGING", active: true, enabledAt: new Date() } },
      members: {
        create: [
          { userId: professional.id, role: "PROFESSIONAL", active: true, title: "Especialista de campo" },
          { userId: company.id, role: "ADMIN", active: true, title: "Coordinación técnica" },
        ],
      },
      subscriptions: { create: { tier: "PROFESSIONAL", status: "ACTIVE", seats: 3 } },
    },
  });
  const professionalProfile = await prisma.terraqoProfessionalProfile.findUniqueOrThrow({ where: { userId: professional.id } });
  const worklog = await prisma.terraqoWorklogEntry.create({
    data: {
      professionalProfileId: professionalProfile.id,
      authorId: professional.id,
      title: "Control de puntos de referencia",
      summary: "Registro sintético autorizado para comprobar la evaluación privada en navegador.",
      outcome: "Trazabilidad de puntos consolidada.",
      visibility: "PUBLIC",
      lifecycle: "PUBLISHED",
      occurredAt: new Date("2026-10-18T14:00:00.000Z"),
      locationLabel: "Ubicación sintética",
      skills: ["topografía", "control"],
    },
  });
  const worklogRevision = await prisma.terraqoWorklogRevision.create({
    data: {
      worklogId: worklog.id,
      revisionNo: 1,
      title: worklog.title,
      summary: worklog.summary,
      outcome: worklog.outcome,
      contributionRole: "Especialista de campo",
      responsibilities: ["Control de referencias"],
      methods: ["Levantamiento técnico"],
      tools: ["Estación total"],
      contentHash: randomBytes(32).toString("hex"),
      createdById: professional.id,
    },
  });
  await prisma.terraqoWorklogEntry.update({ where: { id: worklog.id }, data: { currentRevisionId: worklogRevision.id } });
  const need = await prisma.terraqoWorkNeed.create({
    data: {
      workspaceId: workspace.id,
      createdById: company.id,
      operationKey: randomUUID(),
      operationFingerprint: randomBytes(32).toString("hex"),
    },
  });
  const needRevision = await prisma.terraqoWorkNeedRevision.create({
    data: {
      needId: need.id,
      revisionNo: 1,
      title: "Control topográfico de infraestructura",
      problem: "Comprobar referencias de campo con evidencia trazable y revisión humana.",
      activities: ["Control de puntos", "Levantamiento técnico"],
      context: "Fixture privado del gate B5.",
      locationLabel: "Ubicación sintética",
      requiredTools: ["Estación total"],
      contentHash: randomBytes(32).toString("hex"),
      createdById: company.id,
      operationKey: randomUUID(),
      operationFingerprint: randomBytes(32).toString("hex"),
      requirements: { create: [{ label: "Experiencia documentada en control", priority: "REQUIRED", sortOrder: 0 }] },
    },
  });
  await prisma.terraqoWorkNeed.update({ where: { id: need.id }, data: { currentRevisionId: needRevision.id } });
  await prisma.terraqoEvaluationDossier.create({
    data: {
      workspaceId: workspace.id,
      needRevisionId: needRevision.id,
      professionalProfileId: professionalProfile.id,
      createdById: company.id,
      operationKey: randomUUID(),
      operationFingerprint: randomBytes(32).toString("hex"),
      sources: {
        create: {
          worklogRevisionId: worklogRevision.id,
          accessKind: "PUBLIC_CV",
          accessSnapshot: { source: "synthetic-browser-gate", visibility: "PUBLIC" },
          addedById: company.id,
        },
      },
    },
  });
  const request = await prisma.terraqoConversationRequest.create({
    data: {
      requestKey: `${workspace.id}:${professional.id}:protected`,
      workspaceId: workspace.id,
      requesterId: company.id,
      recipientId: professional.id,
      note: "Queremos conversar sobre un levantamiento nacional con alcance protegido.",
      operationKey: randomUUID(),
      operationFingerprint: randomBytes(32).toString("hex"),
    },
  });

  const proposalConversation = await prisma.terraqoConversation.create({
    data: {
      title: "Levantamiento de infraestructura",
      workspaceId: workspace.id,
      createdById: company.id,
      participants: { create: [{ userId: company.id, role: "OWNER" }, { userId: professional.id, role: "MEMBER" }] },
      messages: { create: { senderId: company.id, body: "Compartimos una propuesta privada para tu revisión." } },
      lastMessageAt: new Date(),
    },
  });
  await prisma.terraqoCollaboration.create({
    data: {
      workspaceId: workspace.id,
      conversationId: proposalConversation.id,
      professionalUserId: professional.id,
      proposals: {
        create: {
          revisionNo: 1,
          scope: "Levantamiento técnico, control de campo y entrega trazable de resultados.",
          roleTitle: "Especialista de levantamiento",
          deliverables: ["Informe técnico", "Registro de campo"],
          status: "PENDING",
          createdById: company.id,
          operationKey: randomUUID(),
          operationFingerprint: randomBytes(32).toString("hex"),
        },
      },
    },
  });

  const closureConversation = await prisma.terraqoConversation.create({
    data: {
      title: "Cierre de control topográfico",
      workspaceId: workspace.id,
      createdById: company.id,
      participants: { create: [{ userId: company.id, role: "OWNER" }, { userId: professional.id, role: "MEMBER" }] },
      messages: { create: { senderId: company.id, body: "El cierre privado está listo para revisión." } },
      lastMessageAt: new Date(),
    },
  });
  const closureCollaboration = await prisma.terraqoCollaboration.create({
    data: {
      workspaceId: workspace.id,
      conversationId: closureConversation.id,
      professionalUserId: professional.id,
      status: "CLOSURE_PROPOSED",
      acceptedRevisionNo: 1,
      acceptedAt: new Date(),
      proposals: {
        create: {
          revisionNo: 1,
          scope: "Control y validación de puntos de referencia en campo.",
          roleTitle: "Supervisor de control topográfico",
          deliverables: ["Reporte validado", "Acta de control"],
          status: "ACCEPTED",
          createdById: company.id,
          decidedById: professional.id,
          decidedAt: new Date(),
          operationKey: randomUUID(),
          operationFingerprint: randomBytes(32).toString("hex"),
        },
      },
    },
  });
  const closure = await prisma.terraqoCollaborationClosure.create({
    data: { collaborationId: closureCollaboration.id },
  });
  const closureRevision = await prisma.terraqoClosureRevision.create({
    data: {
      closureId: closure.id,
      revisionNo: 1,
      contribution: "Verificación de puntos de control y consolidación de observaciones de campo.",
      deliverables: ["Matriz de control", "Informe de incidencias"],
      result: "Control concluido con trazabilidad completa.",
      authorizedExcerpt: "Control técnico concluido y documentado.",
      status: "SUBMITTED",
      createdById: company.id,
      operationKey: randomUUID(),
      operationFingerprint: randomBytes(32).toString("hex"),
      submitOperationKey: randomUUID(),
      submitFingerprint: randomBytes(32).toString("hex"),
      submittedAt: new Date(),
    },
  });
  await prisma.terraqoCollaborationClosure.update({
    where: { id: closure.id },
    data: { currentRevisionId: closureRevision.id },
  });
  return { workspaceId: workspace.id, professionalId: professional.id, companyId: company.id, worklogId: worklog.id, requestId: request.id, email: professional.email, password, companyEmail: company.email, companyPassword };
}

async function login(context: BrowserContext, email: string, password: string, authOrigin = origin, callbackPath = targetPath) {
  const jar = new Map<string, string>();
  const send = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(local + path, {
      ...init,
      redirect: "manual",
      headers: {
        host: new URL(authOrigin).host,
        origin: authOrigin,
        cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
        ...init.headers,
      },
    });
    for (const item of response.headers.getSetCookie()) {
      const pair = item.split(";", 1)[0];
      const index = pair.indexOf("=");
      if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  };
  const csrf = await (await send("/api/auth/csrf")).json() as { csrfToken: string };
  const response = await send("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-auth-return-redirect": "1" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, callbackUrl: authOrigin + callbackPath }),
  });
  assert.equal(response.status, 200);
  await response.body?.cancel();
  assert.ok([...jar.keys()].some((key) => key.startsWith("__Secure-authjs.session-token")));
  await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: authOrigin, secure: true, httpOnly: true, sameSite: "Lax" as const })));
}

async function waitForServer() {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const response = await fetch(local + "/api/health");
      if (response.ok) return;
    } catch { /* owned server is warming */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Owned Next server did not become ready.");
}

async function assertNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(dimensions.scroll <= dimensions.client + 1, `Horizontal overflow: ${dimensions.scroll}px > ${dimensions.client}px.`);
}

async function assertKeyboardFocus(page: Page) {
  let focusVisible = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    await page.keyboard.press("Tab");
    const state = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element) return { visible: false, outline: "", shadow: "" };
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        visible: box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight,
        outline: style.outlineStyle,
        shadow: style.boxShadow,
      };
    });
    if (state.visible && (state.outline !== "none" || state.shadow !== "none")) {
      focusVisible = true;
      break;
    }
  }
  assert.equal(focusVisible, true, "Keyboard navigation did not expose a visible focus indicator.");
}

async function exerciseViewport(browser: Browser, fixture: Awaited<ReturnType<typeof seedFixture>>, width: number, zoom: number) {
  phase = `viewport-${width}-zoom-${zoom}`;
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  let page: Page | undefined;
  let simulateFailure = true;
  await context.route(origin + "/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (simulateFailure && ["/api/v1/conversation-requests", "/api/v1/collaborations"].includes(url.pathname)) {
      await route.abort("connectionfailed");
      return;
    }
    try {
      const response = await route.fetch({
        url: local + url.pathname + url.search,
        headers: {
          ...request.headers(),
          host: new URL(local).host,
          "x-forwarded-host": new URL(origin).host,
          "x-forwarded-proto": "http",
        },
        maxRedirects: 0,
      });
      const headers = { ...response.headers() };
      delete headers["content-encoding"];
      delete headers["content-length"];
      await route.fulfill({ response, headers, body: await response.body() });
    } catch {
      await route.abort("failed").catch(() => undefined);
    }
  });
  try {
    await login(context, fixture.email, fixture.password);
    page = await context.newPage();
    if (zoom > 1) {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: zoom });
    }
    await page.goto(origin + targetPath, { waitUntil: "domcontentloaded" });
    await page.getByRole("alert").filter({ hasText: "No hay conexión" }).first().waitFor();
    const busySections = page.locator("section[aria-busy='true']");
    for (let attempt = 0; attempt < 100 && await busySections.count(); attempt++)
      await page.waitForTimeout(30);
    assert.equal(await busySections.count(), 0, "Panels must leave their busy state after a network failure.");
    simulateFailure = false;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Solicitudes de conversación", exact: true }).waitFor();
    await page.getByRole("heading", { name: "Propuestas de colaboración", exact: true }).waitFor();
    await page.getByRole("heading", { name: "Cierre y constancia privada", exact: true }).waitFor();
    await page.getByText("Andina Ingeniería quiere conversar", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Aceptar esta versión", exact: true }).waitFor();
    await page.getByRole("button", { name: "Aceptar y emitir constancia", exact: true }).waitFor();
    await assertNoHorizontalOverflow(page);
    await assertKeyboardFocus(page);

    const block = page.getByRole("button", { name: "Bloquear", exact: true });
    const blockBox = await block.boundingBox();
    assert.ok(blockBox && blockBox.height >= 36, "Compact action must remain comfortably operable.");
    await block.click();
    await page.getByRole("alert").filter({ hasText: "Indica el motivo" }).waitFor();
    const focusedId = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.id || "");
    assert.equal(focusedId, `conversation-request-reason-${fixture.requestId}`);
    const reasonBox = await page.locator(`#${focusedId}`).boundingBox();
    assert.ok(reasonBox && reasonBox.height >= 44, "Required reason field must meet the 44px touch target.");
    await page.screenshot({ path: `${outputDirectory}/portal-messages-${width}-zoom-${zoom}.png`, fullPage: true });
    console.log(JSON.stringify({ width, zoom, noHorizontalOverflow: true, keyboardFocus: true, recovery: true, reasonFocus: true }));
  } catch (error) {
    if (page) {
      await page.screenshot({ path: `${outputDirectory}/failure-${width}-zoom-${zoom}.png`, fullPage: true }).catch(() => undefined);
      console.error(JSON.stringify({ phase, url: page.url(), body: (await page.locator("body").innerText().catch(() => "")).slice(0, 500) }));
    }
    throw error;
  } finally {
    await context.unrouteAll({ behavior: "ignoreErrors" });
    await context.close();
  }
}

async function exerciseAdminViewport(browser: Browser, fixture: Awaited<ReturnType<typeof seedFixture>>, width: number, zoom: number) {
  phase = `admin-viewport-${width}-zoom-${zoom}`;
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  let page: Page | undefined;
  let simulateFailure = true;
  await context.route(adminOrigin + "/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (simulateFailure && ["/api/v1/work-needs", "/api/v1/evaluation-dossiers"].includes(url.pathname)) {
      await route.abort("connectionfailed");
      return;
    }
    try {
      const response = await route.fetch({
        url: local + url.pathname + url.search,
        headers: {
          ...request.headers(),
          host: new URL(local).host,
          "x-forwarded-host": new URL(adminOrigin).host,
          "x-forwarded-proto": "http",
        },
        maxRedirects: 0,
      });
      const headers = { ...response.headers() };
      delete headers["content-encoding"];
      delete headers["content-length"];
      await route.fulfill({ response, headers, body: await response.body() });
    } catch {
      await route.abort("failed").catch(() => undefined);
    }
  });
  try {
    await login(context, fixture.companyEmail, fixture.companyPassword, adminOrigin, "/admin/necesidades");
    page = await context.newPage();
    if (zoom > 1) {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: zoom });
    }
    await page.goto(adminOrigin + "/admin/necesidades", { waitUntil: "domcontentloaded" });
    await page.getByRole("alert").first().waitFor();
    simulateFailure = false;
    await page.getByRole("button", { name: "Reintentar carga", exact: true }).click();
    await page.getByRole("heading", { name: "De una necesidad real a evidencia explicable", exact: true }).waitFor();
    await page.getByRole("button", { name: /^Control topográfico de infraestructura v1/ }).waitFor();
    await page.getByText("Evaluación manual activa.", { exact: false }).waitFor();
    await page.getByText("Plan PROFESSIONAL", { exact: true }).waitFor();
    await page.getByRole("heading", { name: "Criterios de la necesidad", exact: true }).waitFor();
    await page.getByLabel("Conclusión y sustento", { exact: true }).waitFor();
    await page.getByLabel("Observación del equipo", { exact: true }).waitFor();
    await page.getByLabel("Pregunta interna", { exact: true }).waitFor();
    await assertNoHorizontalOverflow(page);
    await assertKeyboardFocus(page);
    const retryBox = await page.getByRole("button", { name: "Crear necesidad privada", exact: true }).boundingBox();
    assert.ok(retryBox && retryBox.height >= 44, "Primary action must preserve a 44px touch target.");
    await page.screenshot({ path: `${outputDirectory}/admin-needs-${width}-zoom-${zoom}.png`, fullPage: true });
    console.log(JSON.stringify({ surface: "admin-needs", width, zoom, noHorizontalOverflow: true, keyboardFocus: true, recoveryWithoutReload: true, entitlementVisible: true, manualEvaluationVisible: true }));
  } catch (error) {
    if (page) {
      await page.screenshot({ path: `${outputDirectory}/admin-failure-${width}-zoom-${zoom}.png`, fullPage: true }).catch(() => undefined);
      console.error(JSON.stringify({ phase, url: page.url(), body: (await page.locator("body").innerText().catch(() => "")).slice(0, 700) }));
    }
    throw error;
  } finally {
    await context.unrouteAll({ behavior: "ignoreErrors" });
    await context.close();
  }
}

async function cleanupFixture(fixture: Awaited<ReturnType<typeof seedFixture>> | undefined) {
  if (!fixture) return;
  await prisma.terraqoWorkspace.delete({ where: { id: fixture.workspaceId } });
  await prisma.terraqoWorklogEntry.delete({ where: { id: fixture.worklogId } });
  await prisma.user.deleteMany({ where: { id: { in: [fixture.professionalId, fixture.companyId] } } });
  assert.equal(await prisma.user.count({ where: { email: { startsWith: fixturePrefix } } }), 0);
  assert.equal(await prisma.terraqoWorkspace.count({ where: { slug: { startsWith: fixturePrefix } } }), 0);
  assert.equal(await prisma.terraqoWorklogEntry.count({ where: { id: fixture.worklogId } }), 0);
}

async function main() {
  assertLocalDisposableDatabase();
  ({ prisma } = await import("../lib/prisma"));
  let fixture: Awaited<ReturnType<typeof seedFixture>> | undefined;
  let browser: Browser | undefined;
  let server: ChildProcess | undefined;
  try {
    phase = "seed";
    fixture = await seedFixture();
    phase = "server";
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3881"], {
      env: {
        ...process.env,
        NODE_ENV: "production",
        AUTH_TRUST_HOST: "true",
        AUTH_URL: origin,
        NEXTAUTH_URL: origin,
        TERRAQO_CONTEXTUAL_MESSAGING_V1: "true",
        TERRAQO_COLLABORATION_V1: "true",
        TERRAQO_CLOSURE_V1: "true",
        TERRAQO_DISCOVERY_NEEDS_V1: "true",
        TERRAQO_EVIDENCE_ANALYSIS_V1: "true",
        TERRAQO_EVIDENCE_ANALYSIS_PROVIDER: "off",
        EVIDENCE_ANALYSIS_DISPATCH_SECRET: "",
        TERRAQO_B5_PILOT_WORKSPACE_IDS: fixture.workspaceId,
        TERRAQO_EMPLOYER_NEEDS_MONTHLY_LIMIT: "25",
        TERRAQO_EVIDENCE_ANALYSIS_MONTHLY_LIMIT: "100",
      },
      stdio: "ignore",
      windowsHide: true,
    });
    await waitForServer();
    await mkdir(outputDirectory, { recursive: true });
    browser = await chromium.launch({ headless: true });
    await exerciseViewport(browser, fixture, 320, 1);
    await exerciseViewport(browser, fixture, 640, 2);
    await exerciseAdminViewport(browser, fixture, 320, 1);
    await exerciseAdminViewport(browser, fixture, 640, 2);
    console.log("B5 browser accessibility gate: OK (T13-T17/T20, 320px + 200% zoom, real Next/Auth/API/PostgreSQL). Screenshots require visual review.");
  } finally {
    await browser?.close().catch(() => undefined);
    server?.kill();
    await cleanupFixture(fixture);
    await prisma?.$disconnect();
  }
}

main().catch((error) => {
  console.error(`B5 browser accessibility gate failed at ${phase}: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
