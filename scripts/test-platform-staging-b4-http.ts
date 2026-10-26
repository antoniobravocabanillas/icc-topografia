import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { chromium, type APIRequestContext, type BrowserContext } from "playwright";
import { validatePlatformStagingEnvironment } from "./lib/platform-staging-environment";

const PILOT_WORKSPACE_ID = "cm00000000000000000000001";
let prisma: (typeof import("../lib/prisma"))["prisma"] | undefined;

function confirmedTarget() {
  assert.equal(
    process.env.TERRAQO_STAGING_MUTATING_TESTS,
    "mghdpciewbsowjrjwmwk:b4-http-fixtures",
    "El E2E HTTP exige consentimiento exacto para fixtures sinteticos B4.",
  );
  const target = validatePlatformStagingEnvironment(process.env);
  assert.equal(target.databaseProvider, "supabase");
  assert.equal(target.supabaseProjectRef, "mghdpciewbsowjrjwmwk");
  assert.equal(target.databaseRole, "terraqo_staging_runtime");
  assert.deepEqual(target.enabledFlags, [
    "TERRAQO_WORKLOG_FTS_V1",
    "TERRAQO_WORK_CASES_V1",
    "TERRAQO_SCOPED_SHARING_V1",
    "TERRAQO_SCOPED_ENDORSEMENTS_V1",
    "TERRAQO_DISCOVERY_NEEDS_V1",
    "TERRAQO_CONTEXTUAL_MESSAGING_V1",
    "TERRAQO_COLLABORATION_V1",
    "TERRAQO_CLOSURE_V1",
  ]);
  assert.deepEqual(target.pilotWorkspaceIds, [PILOT_WORKSPACE_ID]);
  const origin = new URL(process.env.TEST_PLATFORM_STAGING_URL ?? "");
  assert.equal(origin.origin, "https://terraqo-platform-staging.netlify.app");
  assert.equal(origin.pathname, "/");
  return origin;
}

async function signIn(context: BrowserContext, origin: URL, email: string, password: string) {
  const page = await context.newPage();
  await page.goto(new URL("/cuenta", origin).toString(), { waitUntil: "networkidle" });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await Promise.all([
    page.waitForURL((url) => url.origin === origin.origin && ["/portal", "/admin"].some((path) => url.pathname.startsWith(path)), { timeout: 60_000 }),
    page.getByRole("button", { name: "Iniciar sesión", exact: true }).click(),
  ]);
  const session = await context.request.get(new URL("/api/auth/session", origin).toString());
  assert.equal(session.status(), 200);
  assert.equal((await session.json()).user.email, email);
  await page.close();
}

async function jsonData<T>(response: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  const body = await response.json() as { data: unknown };
  return body.data as T;
}

async function main() {
  const origin = confirmedTarget();
  process.env.DATABASE_URL = process.env.B5_GATE_DATABASE_URL;
  ({ prisma } = await import("../lib/prisma"));
  const [existingUsers, existingWorkspaces] = await Promise.all([
    prisma.user.count(),
    prisma.terraqoWorkspace.count(),
  ]);
  assert.deepEqual(
    { existingUsers, existingWorkspaces },
    { existingUsers: 0, existingWorkspaces: 0 },
    "Staging dejo de estar vacio; el runner B4 se niega a tocar datos preexistentes.",
  );

  const suffix = randomBytes(6).toString("hex");
  const password = randomBytes(18).toString("base64url");
  const emails = [
    `b4-company-${suffix}@example.invalid`,
    `b4-professional-${suffix}@example.invalid`,
    `b4-outsider-${suffix}@example.invalid`,
  ];
  const userIds: string[] = [];
  const workspaceIds: string[] = [];
  const worklogIds: string[] = [];
  const browser = await chromium.launch({ headless: true });
  const contexts: BrowserContext[] = [];

  try {
    const users = [];
    for (const [index, email] of emails.entries()) {
      const user = await prisma.user.create({
        data: {
          email,
          name: ["B4 Empresa", "B4 Profesional", "B4 Aislado"][index],
          role: index === 0 ? "ADMIN" : "CUSTOMER",
          emailVerified: new Date(),
          passwordHash: await bcrypt.hash(password, 12),
          ...(index === 0 ? {} : {
            terraqoProfessionalProfile: {
              create: {
                username: `b4-${index}-${suffix}`,
                headline: index === 1 ? "Especialista en topografia y nivelacion" : "Perfil aislado B4",
                visibility: "PUBLIC",
                liveCvEnabled: true,
              },
            },
          }),
        },
        include: { terraqoProfessionalProfile: { select: { id: true } } },
      });
      userIds.push(user.id);
      users.push(user);
    }
    const [company, professional, outsider] = users;
    assert.ok(company && professional?.terraqoProfessionalProfile && outsider);

    const workspace = await prisma.terraqoWorkspace.create({
      data: {
        id: PILOT_WORKSPACE_ID,
        name: `B4 Workspace ${suffix}`,
        slug: `b4-pilot-${suffix}`,
        ownerUserId: company.id,
        modules: { create: { code: "PROFESSIONAL_MESSAGING", active: true, enabledAt: new Date() } },
        members: { create: { userId: company.id, role: "OWNER", active: true, joinedAt: new Date() } },
        subscriptions: { create: { tier: "PROFESSIONAL", status: "ACTIVE", seats: 3 } },
      },
      select: { id: true },
    });
    const isolatedWorkspace = await prisma.terraqoWorkspace.create({
      data: {
        name: `B4 Isolated ${suffix}`,
        slug: `b4-isolated-${suffix}`,
        ownerUserId: outsider.id,
        members: { create: { userId: outsider.id, role: "OWNER", active: true, joinedAt: new Date() } },
      },
      select: { id: true },
    });
    workspaceIds.push(workspace.id, isolatedWorkspace.id);

    const worklog = await prisma.terraqoWorklogEntry.create({
      data: {
        professionalProfileId: professional.terraqoProfessionalProfile.id,
        authorId: professional.id,
        title: "Control topografico y nivelacion de infraestructura",
        summary: "Levantamiento de campo con control de cotas y trazabilidad tecnica.",
        outcome: "Referencias verificadas para ejecucion de obra.",
        locationLabel: "Ubicacion sintetica B4",
        visibility: "PUBLIC",
        lifecycle: "PUBLISHED",
        skills: ["topografia", "nivelacion"],
        occurredAt: new Date(),
      },
      select: { id: true },
    });
    worklogIds.push(worklog.id);
    const revision = await prisma.terraqoWorklogRevision.create({
      data: {
        worklogId: worklog.id,
        revisionNo: 1,
        title: "Control topografico y nivelacion de infraestructura",
        summary: "Levantamiento de campo con control de cotas y trazabilidad tecnica.",
        outcome: "Referencias verificadas para ejecucion de obra.",
        contributionRole: "Especialista de campo",
        responsibilities: ["Control de cotas", "Registro trazable"],
        methods: ["Nivelacion geometrica"],
        tools: ["Estacion total"],
        contentHash: createHash("sha256").update(`${worklog.id}:b4`).digest("hex"),
        createdById: professional.id,
      },
      select: { id: true },
    });
    await prisma.terraqoWorklogEntry.update({ where: { id: worklog.id }, data: { currentRevisionId: revision.id } });

    const anonymous = await browser.newContext();
    const companyContext = await browser.newContext();
    const professionalContext = await browser.newContext();
    const outsiderContext = await browser.newContext();
    contexts.push(anonymous, companyContext, professionalContext, outsiderContext);
    await Promise.all([
      signIn(companyContext, origin, emails[0]!, password),
      signIn(professionalContext, origin, emails[1]!, password),
      signIn(outsiderContext, origin, emails[2]!, password),
    ]);

    assert.equal((await anonymous.request.get(new URL("/api/v1/work-needs", origin).toString())).status(), 401);
    assert.equal((await outsiderContext.request.get(new URL("/api/v1/work-needs", origin).toString())).status(), 403);

    const invalidNeed = await companyContext.request.post(new URL("/api/v1/work-needs", origin).toString(), {
      headers: { "Idempotency-Key": randomUUID() },
      data: { title: "B4", problem: "corto", activities: [], requiredTools: [], endorsementNeeded: false, requirements: [] },
    });
    assert.equal(invalidNeed.status(), 422);

    const needKey = randomUUID();
    const needPayload = {
      title: "Control topografico de infraestructura",
      problem: "Necesitamos verificar cotas y referencias de campo con evidencia profesional trazable.",
      activities: ["Nivelacion", "Control topografico"],
      context: "Piloto sintetico B4 sin datos reales.",
      locationLabel: "Lima sintetica",
      requiredTools: ["Estacion total"],
      endorsementNeeded: false,
      requirements: [{ label: "Experiencia documentada en nivelacion", priority: "REQUIRED" }],
    };
    const needResponse = await companyContext.request.post(new URL("/api/v1/work-needs", origin).toString(), {
      headers: { "Idempotency-Key": needKey }, data: needPayload,
    });
    assert.equal(needResponse.status(), 201, await needResponse.text());
    const need = await jsonData<{ id: string; version: number; currentRevision: { id: string } }>(needResponse);
    const needReplay = await companyContext.request.post(new URL("/api/v1/work-needs", origin).toString(), {
      headers: { "Idempotency-Key": needKey }, data: needPayload,
    });
    assert.equal(needReplay.status(), 201, await needReplay.text());
    assert.equal((await jsonData<{ id: string }>(needReplay)).id, need.id);
    const needCollision = await companyContext.request.post(new URL("/api/v1/work-needs", origin).toString(), {
      headers: { "Idempotency-Key": needKey }, data: { ...needPayload, title: "Colision de necesidad B4" },
    });
    assert.equal(needCollision.status(), 409);

    const discoveryResponse = await companyContext.request.get(new URL(`/api/v1/work-needs/${need.id}/discover`, origin).toString());
    assert.equal(discoveryResponse.status(), 200, await discoveryResponse.text());
    const matches = await jsonData<Array<{ revisionId: string; professionalProfileId: string; reasons: { hasEvidence: boolean } }>>(discoveryResponse);
    const match = matches.find((item) => item.revisionId === revision.id);
    assert.ok(match?.reasons.hasEvidence, "Discovery no encontro la evidencia publica sintetica.");

    const dossierResponse = await companyContext.request.post(new URL("/api/v1/evaluation-dossiers", origin).toString(), {
      headers: { "Idempotency-Key": randomUUID() },
      data: {
        needRevisionId: need.currentRevision.id,
        professionalProfileId: professional.terraqoProfessionalProfile.id,
        worklogRevisionIds: [revision.id],
        privateSummary: "Evaluacion sintetica privada B4.",
      },
    });
    assert.equal(dossierResponse.status(), 201, await dossierResponse.text());
    const dossier = await jsonData<{ id: string }>(dossierResponse);
    assert.equal((await professionalContext.request.get(new URL("/api/v1/evaluation-dossiers", origin).toString())).status(), 403);

    const requestResponse = await companyContext.request.post(new URL("/api/v1/conversation-requests", origin).toString(), {
      headers: { "Idempotency-Key": randomUUID() },
      data: { dossierId: dossier.id, note: "Solicitud sintetica para revisar el alcance tecnico." },
    });
    assert.equal(requestResponse.status(), 201, await requestResponse.text());
    const conversationRequest = await jsonData<{ id: string; version: number }>(requestResponse);
    const incomingResponse = await professionalContext.request.get(new URL("/api/v1/conversation-requests", origin).toString());
    assert.equal(incomingResponse.status(), 200, await incomingResponse.text());
    const incoming = (await jsonData<Array<{ id: string; context: { kind: string; title: string } }>>(incomingResponse))
      .find((item) => item.id === conversationRequest.id);
    assert.deepEqual(incoming?.context, { kind: "PROTECTED", title: "Contexto profesional protegido", revisionNo: null });

    const acceptRequest = await professionalContext.request.post(
      new URL(`/api/v1/conversation-requests/${conversationRequest.id}/decision`, origin).toString(),
      { data: { action: "ACCEPT", expectedVersion: conversationRequest.version } },
    );
    assert.equal(acceptRequest.status(), 200, await acceptRequest.text());
    const acceptedRequest = await jsonData<{ conversationId: string }>(acceptRequest);
    assert.ok(acceptedRequest.conversationId);

    const collaborationResponse = await companyContext.request.post(new URL("/api/v1/collaborations", origin).toString(), {
      headers: { "Idempotency-Key": randomUUID() },
      data: {
        conversationId: acceptedRequest.conversationId,
        scope: "Control topografico y nivelacion de referencias para infraestructura.",
        roleTitle: "Especialista de control topografico",
        deliverables: ["Reporte tecnico", "Registro de campo"],
        conditions: "Piloto sintetico sin efectos contractuales ni pagos.",
      },
    });
    assert.equal(collaborationResponse.status(), 201, await collaborationResponse.text());
    let collaboration = await jsonData<{ id: string; version: number; proposals: Array<{ revisionNo: number }> }>(collaborationResponse);

    const reviseResponse = await companyContext.request.post(
      new URL(`/api/v1/collaborations/${collaboration.id}/proposals`, origin).toString(),
      {
        headers: { "Idempotency-Key": randomUUID() },
        data: {
          expectedVersion: collaboration.version,
          scope: "Control topografico, nivelacion y entrega trazable de referencias de infraestructura.",
          roleTitle: "Especialista de control topografico",
          deliverables: ["Reporte tecnico validado", "Registro de campo"],
          conditions: "Piloto sintetico sin efectos contractuales ni pagos.",
        },
      },
    );
    assert.equal(reviseResponse.status(), 200, await reviseResponse.text());
    collaboration = await jsonData<typeof collaboration>(reviseResponse);
    assert.equal(collaboration.proposals[0]?.revisionNo, 2);

    const staleAccept = await professionalContext.request.post(
      new URL(`/api/v1/collaborations/${collaboration.id}/decision`, origin).toString(),
      { headers: { "Idempotency-Key": randomUUID() }, data: { action: "ACCEPT", expectedRevisionNo: 1 } },
    );
    assert.equal(staleAccept.status(), 409);
    const proposalAccept = await professionalContext.request.post(
      new URL(`/api/v1/collaborations/${collaboration.id}/decision`, origin).toString(),
      { headers: { "Idempotency-Key": randomUUID() }, data: { action: "ACCEPT", expectedRevisionNo: 2 } },
    );
    assert.equal(proposalAccept.status(), 200, await proposalAccept.text());

    const closureResponse = await companyContext.request.post(
      new URL(`/api/v1/collaborations/${collaboration.id}/closures`, origin).toString(),
      {
        headers: { "Idempotency-Key": randomUUID() },
        data: {
          contribution: "Ejecucion y control trazable del levantamiento topografico acordado.",
          deliverables: ["Reporte tecnico validado", "Registro de campo"],
          result: "Referencias topograficas verificadas.",
          authorizedExcerpt: "Participacion profesional validada en el piloto sintetico.",
          referenceRevisionIds: [revision.id],
          expectedVersion: null,
        },
      },
    );
    assert.equal(closureResponse.status(), 201, await closureResponse.text());
    const closure = await jsonData<{ id: string; currentRevision: { revisionNo: number } }>(closureResponse);
    const submitResponse = await companyContext.request.post(
      new URL(`/api/v1/collaborations/${collaboration.id}/closures/submit`, origin).toString(),
      { headers: { "Idempotency-Key": randomUUID() }, data: { expectedRevisionNo: closure.currentRevision.revisionNo } },
    );
    assert.equal(submitResponse.status(), 200, await submitResponse.text());
    const closureDecision = await professionalContext.request.post(
      new URL(`/api/v1/closures/${closure.id}/decision`, origin).toString(),
      { headers: { "Idempotency-Key": randomUUID() }, data: { action: "ACCEPT", expectedRevisionNo: closure.currentRevision.revisionNo } },
    );
    assert.equal(closureDecision.status(), 200, await closureDecision.text());
    const certificate = await prisma.terraqoCollaborationCertificate.findUnique({ where: { closureId: closure.id } });
    assert.ok(certificate?.privateByDefault, "La constancia B4 debe permanecer privada por defecto.");

    const adminPage = await companyContext.newPage();
    await adminPage.goto(new URL("/admin/necesidades", origin).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await adminPage.getByText("Necesidades y evaluación privada", { exact: true }).waitFor({ timeout: 60_000 });
    await mkdir("output/playwright", { recursive: true });
    await adminPage.screenshot({ path: "output/playwright/platform-staging-b4-needs.png", fullPage: true });
    await adminPage.close();
    const professionalPage = await professionalContext.newPage();
    await professionalPage.goto(new URL("/portal/mensajes", origin).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await professionalPage.getByText("Propuestas de colaboración", { exact: true }).waitFor({ timeout: 60_000 });
    await professionalPage.screenshot({ path: "output/playwright/platform-staging-b4-collaboration.png", fullPage: true });
    await professionalPage.close();

    console.log(JSON.stringify({
      outcome: "passed",
      authenticatedUsers: 3,
      isolatedWorkspaces: 2,
      needReplayEnforced: true,
      protectedContextEnforced: true,
      supersededProposalRejected: true,
      bilateralAcceptanceCompleted: true,
      privateCertificateIssued: true,
      b4UiVisible: true,
    }));
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
    await browser.close();
    if (prisma) {
      await prisma.terraqoCollaborationCertificate.deleteMany({ where: { issuedById: { in: userIds } } });
      await prisma.terraqoCollaboration.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.terraqoConversationRequest.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.terraqoConversation.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.terraqoEvaluationDossier.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.terraqoWorkNeed.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      if (worklogIds.length) await prisma.terraqoWorklogEntry.deleteMany({ where: { id: { in: worklogIds } } });
      if (workspaceIds.length) await prisma.terraqoWorkspace.deleteMany({ where: { id: { in: workspaceIds } } });
      await prisma.verificationToken.deleteMany({ where: { identifier: { in: userIds.map((id) => `web-cv-session:${id}`) } } });
      if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      assert.equal(await prisma.user.count(), 0);
      assert.equal(await prisma.terraqoWorkspace.count(), 0);
      assert.equal(await prisma.terraqoWorklogEntry.count(), 0);
      assert.equal(await prisma.terraqoWorkNeed.count(), 0);
      assert.equal(await prisma.terraqoEvaluationDossier.count(), 0);
      assert.equal(await prisma.terraqoConversationRequest.count(), 0);
      assert.equal(await prisma.terraqoCollaboration.count(), 0);
      assert.equal(await prisma.terraqoCollaborationCertificate.count(), 0);
      await prisma.$disconnect();
    }
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
