import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { chromium, type APIRequestContext, type BrowserContext } from "playwright";
import { validatePlatformStagingEnvironment } from "./lib/platform-staging-environment";

let prisma: (typeof import("../lib/prisma"))["prisma"] | undefined;

function confirmedTarget() {
  assert.equal(
    process.env.TERRAQO_STAGING_MUTATING_TESTS,
    "mghdpciewbsowjrjwmwk:b3-http-fixtures",
    "El E2E HTTP exige consentimiento exacto para fixtures sinteticos B3.",
  );
  const target = validatePlatformStagingEnvironment(process.env);
  assert.equal(target.databaseProvider, "supabase");
  assert.equal(target.supabaseProjectRef, "mghdpciewbsowjrjwmwk");
  assert.equal(target.databaseRole, "terraqo_staging_runtime");
  assert.deepEqual(
    target.enabledFlags,
    [
      "TERRAQO_WORKLOG_FTS_V1",
      "TERRAQO_WORK_CASES_V1",
      "TERRAQO_SCOPED_SHARING_V1",
      "TERRAQO_SCOPED_ENDORSEMENTS_V1",
    ],
  );
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
    page.waitForURL((url) => url.origin === origin.origin && url.pathname.startsWith("/portal"), { timeout: 60_000 }),
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

async function currentCollection(request: APIRequestContext, origin: URL, id: string) {
  const response = await request.get(new URL("/api/v1/share-collections", origin).toString());
  assert.equal(response.status(), 200, await response.text());
  const collection = (await jsonData<Array<{ id: string; version: number }>>(response)).find((item) => item.id === id);
  assert.ok(collection, `No se encontro la seleccion ${id}.`);
  return collection;
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
    "Staging dejo de estar vacio; el runner B3 se niega a tocar datos preexistentes.",
  );

  const suffix = randomBytes(6).toString("hex");
  const password = randomBytes(18).toString("base64url");
  const emails = [
    `b3-owner-${suffix}@example.invalid`,
    `b3-reviewer-${suffix}@example.invalid`,
    `b3-stranger-${suffix}@example.invalid`,
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
          name: ["B3 Owner", "B3 Reviewer", "B3 Stranger"][index],
          role: "CUSTOMER",
          emailVerified: new Date(),
          passwordHash: await bcrypt.hash(password, 12),
          terraqoProfessionalProfile: {
            create: {
              username: `b3-${index}-${suffix}`,
              headline: "Perfil sintetico de staging B3",
              visibility: "PRIVATE",
              liveCvEnabled: false,
            },
          },
        },
        include: { terraqoProfessionalProfile: { select: { id: true } } },
      });
      userIds.push(user.id);
      users.push(user);
    }
    const [owner, reviewer, stranger] = users;
    assert.ok(owner?.terraqoProfessionalProfile && reviewer && stranger);

    const workspaceA = await prisma.terraqoWorkspace.create({
      data: {
        name: `B3 Workspace A ${suffix}`,
        slug: `b3-a-${suffix}`,
        ownerUserId: owner.id,
        members: {
          create: [
            { userId: owner.id, role: "OWNER", active: true, joinedAt: new Date() },
            { userId: reviewer.id, role: "MANAGER", active: true, joinedAt: new Date() },
          ],
        },
      },
      select: { id: true },
    });
    const workspaceB = await prisma.terraqoWorkspace.create({
      data: {
        name: `B3 Workspace B ${suffix}`,
        slug: `b3-b-${suffix}`,
        ownerUserId: stranger.id,
        members: { create: { userId: stranger.id, role: "OWNER", active: true, joinedAt: new Date() } },
      },
      select: { id: true },
    });
    workspaceIds.push(workspaceA.id, workspaceB.id);

    const createRevisionFixture = async (workspaceId: string | null, title: string) => {
      const worklog = await prisma!.terraqoWorklogEntry.create({
        data: {
          professionalProfileId: owner.terraqoProfessionalProfile!.id,
          authorId: owner.id,
          workspaceId,
          title,
          summary: "Resumen sintetico que no debe filtrarse fuera del alcance autorizado.",
          outcome: "Resultado reservado de la evidencia sintetica.",
          locationLabel: "Ubicacion sintetica B3",
          visibility: "PRIVATE",
          lifecycle: "PUBLISHED",
          occurredAt: new Date(),
        },
        select: { id: true },
      });
      worklogIds.push(worklog.id);
      const revision = await prisma!.terraqoWorklogRevision.create({
        data: {
          worklogId: worklog.id,
          revisionNo: 1,
          title,
          summary: "Resumen sintetico que no debe filtrarse fuera del alcance autorizado.",
          outcome: "Resultado reservado de la evidencia sintetica.",
          contributionRole: "Responsable de control",
          responsibilities: ["Control geometrico"],
          methods: ["Nivelacion"],
          tools: ["Estacion total"],
          contentHash: createHash("sha256").update(`${worklog.id}:${title}`).digest("hex"),
          createdById: owner.id,
        },
        select: { id: true },
      });
      await prisma!.terraqoWorklogEntry.update({ where: { id: worklog.id }, data: { currentRevisionId: revision.id } });
      return revision.id;
    };

    const personalRevisionId = await createRevisionFixture(null, "Evidencia personal B3");
    const workspaceRevisionId = await createRevisionFixture(workspaceA.id, "Evidencia empresarial B3");

    const anonymous = await browser.newContext();
    const ownerContext = await browser.newContext();
    const reviewerContext = await browser.newContext();
    const strangerContext = await browser.newContext();
    contexts.push(anonymous, ownerContext, reviewerContext, strangerContext);
    await Promise.all([
      signIn(ownerContext, origin, emails[0]!, password),
      signIn(reviewerContext, origin, emails[1]!, password),
      signIn(strangerContext, origin, emails[2]!, password),
    ]);

    assert.equal((await anonymous.request.get(new URL("/api/v1/share-collections", origin).toString())).status(), 401);

    const invalidCollection = await ownerContext.request.post(new URL("/api/v1/share-collections", origin).toString(), {
      headers: { "Idempotency-Key": randomUUID() },
      data: { title: "Sin campos B3", items: [{ revisionId: personalRevisionId, allowedFields: [] }] },
    });
    assert.equal(invalidCollection.status(), 422);

    const selectionKey = randomUUID();
    const selectionPayload = {
      title: "Seleccion personal B3",
      description: "Prueba sintetica de alcance minimo.",
      items: [{ revisionId: personalRevisionId, allowedFields: ["title", "occurredAt"], includeMedia: false }],
    };
    const selectionResponse = await ownerContext.request.post(new URL("/api/v1/share-collections", origin).toString(), {
      headers: { "Idempotency-Key": selectionKey },
      data: selectionPayload,
    });
    assert.equal(selectionResponse.status(), 201, await selectionResponse.text());
    const selection = await jsonData<{ id: string; version: number }>(selectionResponse);

    const replayResponse = await ownerContext.request.post(new URL("/api/v1/share-collections", origin).toString(), {
      headers: { "Idempotency-Key": selectionKey },
      data: selectionPayload,
    });
    assert.equal(replayResponse.status(), 201, await replayResponse.text());
    assert.equal((await jsonData<{ id: string }>(replayResponse)).id, selection.id);
    const collisionResponse = await ownerContext.request.post(new URL("/api/v1/share-collections", origin).toString(), {
      headers: { "Idempotency-Key": selectionKey },
      data: { ...selectionPayload, title: "Colision B3" },
    });
    assert.equal(collisionResponse.status(), 409);

    const invalidDownload = await ownerContext.request.post(
      new URL(`/api/v1/share-collections/${selection.id}/grants`, origin).toString(),
      {
        headers: { "Idempotency-Key": randomUUID() },
        data: {
          expectedVersion: selection.version,
          subjectUserId: reviewer.id,
          scopes: ["VIEW_COLLECTION", "DOWNLOAD_MEDIA"],
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      },
    );
    assert.equal(invalidDownload.status(), 422);

    const grantResponse = await ownerContext.request.post(
      new URL(`/api/v1/share-collections/${selection.id}/grants`, origin).toString(),
      {
        headers: { "Idempotency-Key": randomUUID() },
        data: {
          expectedVersion: selection.version,
          subjectUserId: reviewer.id,
          scopes: ["VIEW_COLLECTION"],
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      },
    );
    assert.equal(grantResponse.status(), 201, await grantResponse.text());
    const grant = (await jsonData<{ grant: { id: string } }>(grantResponse)).grant;

    const grantedRead = await reviewerContext.request.get(
      new URL(`/api/v1/shared-selections/${selection.id}`, origin).toString(),
    );
    assert.equal(grantedRead.status(), 200, await grantedRead.text());
    const grantedItem = (await jsonData<{ items: Array<Record<string, unknown>> }>(grantedRead)).items[0]!;
    assert.equal(grantedItem.title, "Evidencia personal B3");
    assert.ok(grantedItem.occurredAt);
    assert.equal(grantedItem.summary, undefined);
    assert.equal(grantedItem.outcome, undefined);
    assert.equal(grantedItem.locationLabel, undefined);
    assert.equal(
      (await strangerContext.request.get(new URL(`/api/v1/shared-selections/${selection.id}`, origin).toString())).status(),
      404,
    );

    await prisma.terraqoAccessGrant.update({ where: { id: grant.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    assert.equal(
      (await reviewerContext.request.get(new URL(`/api/v1/shared-selections/${selection.id}`, origin).toString())).status(),
      404,
    );
    await prisma.terraqoAccessGrant.update({ where: { id: grant.id }, data: { expiresAt: new Date(Date.now() + 86_400_000) } });
    assert.equal(
      (await reviewerContext.request.get(new URL(`/api/v1/shared-selections/${selection.id}`, origin).toString())).status(),
      200,
    );

    let current = await currentCollection(ownerContext.request, origin, selection.id);
    const revokeGrant = await ownerContext.request.delete(
      new URL(`/api/v1/share-collections/${selection.id}/grants`, origin).toString(),
      { data: { grantId: grant.id, expectedVersion: current.version, reason: "Fin de prueba sintetica" } },
    );
    assert.equal(revokeGrant.status(), 200, await revokeGrant.text());
    assert.equal(
      (await reviewerContext.request.get(new URL(`/api/v1/shared-selections/${selection.id}`, origin).toString())).status(),
      404,
    );

    current = await currentCollection(ownerContext.request, origin, selection.id);
    const projectionResponse = await ownerContext.request.post(
      new URL(`/api/v1/share-collections/${selection.id}/projection`, origin).toString(),
      { data: { expectedVersion: current.version } },
    );
    assert.equal(projectionResponse.status(), 200, await projectionResponse.text());
    const projection = await jsonData<{ slug: string }>(projectionResponse);
    const publicUrl = new URL(`/api/v1/public/selections/${projection.slug}`, origin).toString();
    const publicRead = await anonymous.request.get(publicUrl);
    assert.equal(publicRead.status(), 200, await publicRead.text());
    const publicItem = (await jsonData<{ items: Array<Record<string, unknown>> }>(publicRead)).items[0]!;
    assert.equal(publicItem.title, "Evidencia personal B3");
    assert.equal(publicItem.summary, undefined);
    assert.equal(publicItem.outcome, undefined);

    current = await currentCollection(ownerContext.request, origin, selection.id);
    const revokeProjection = await ownerContext.request.delete(
      new URL(`/api/v1/share-collections/${selection.id}/projection`, origin).toString(),
      { data: { expectedVersion: current.version } },
    );
    assert.equal(revokeProjection.status(), 200, await revokeProjection.text());
    assert.equal((await anonymous.request.get(publicUrl)).status(), 404);

    const workspaceSelectionResponse = await ownerContext.request.post(
      new URL("/api/v1/share-collections", origin).toString(),
      {
        headers: { "Idempotency-Key": randomUUID() },
        data: {
          title: "Seleccion empresarial B3",
          items: [{ revisionId: workspaceRevisionId, allowedFields: ["title"], includeMedia: false }],
        },
      },
    );
    assert.equal(workspaceSelectionResponse.status(), 201, await workspaceSelectionResponse.text());
    const workspaceSelection = await jsonData<{ id: string; version: number }>(workspaceSelectionResponse);
    const forbiddenProjection = await ownerContext.request.post(
      new URL(`/api/v1/share-collections/${workspaceSelection.id}/projection`, origin).toString(),
      { data: { expectedVersion: workspaceSelection.version } },
    );
    assert.equal(forbiddenProjection.status(), 422);

    const endorsementResponse = await ownerContext.request.post(
      new URL("/api/v1/endorsement-requests", origin).toString(),
      {
        headers: { "Idempotency-Key": randomUUID() },
        data: {
          revisionId: personalRevisionId,
          reviewerUserId: reviewer.id,
          relationshipLabel: "Supervisor sintetico B3",
          requestedScope: ["title", "summary"],
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          sendNow: false,
        },
      },
    );
    assert.equal(endorsementResponse.status(), 201, await endorsementResponse.text());
    const endorsement = await jsonData<{ id: string; status: string; version: number }>(endorsementResponse);
    assert.equal(endorsement.status, "DRAFT");
    const reviewerDrafts = await reviewerContext.request.get(new URL("/api/v1/endorsement-requests", origin).toString());
    assert.equal(reviewerDrafts.status(), 200);
    assert.equal(
      (await jsonData<Array<{ id: string; status: string }>>(reviewerDrafts))
        .some((item) => item.id === endorsement.id),
      false,
    );

    const sentResponse = await ownerContext.request.patch(
      new URL(`/api/v1/endorsement-requests/${endorsement.id}`, origin).toString(),
      { data: { expectedVersion: endorsement.version } },
    );
    assert.equal(sentResponse.status(), 200, await sentResponse.text());
    const sent = await jsonData<{ status: string; version: number }>(sentResponse);
    assert.equal(sent.status, "PENDING");
    const reviewerSent = await reviewerContext.request.get(new URL("/api/v1/endorsement-requests", origin).toString());
    assert.equal(reviewerSent.status(), 200);
    const visibleEndorsement = (await jsonData<Array<{ id: string; revision: Record<string, unknown> }>>(reviewerSent))
      .find((item) => item.id === endorsement.id);
    assert.ok(visibleEndorsement);
    assert.equal(typeof visibleEndorsement.revision.title, "string");
    assert.equal(typeof visibleEndorsement.revision.summary, "string");
    assert.equal("outcome" in visibleEndorsement.revision, false);

    const incompleteDecision = await reviewerContext.request.post(
      new URL(`/api/v1/endorsement-requests/${endorsement.id}/decisions`, origin).toString(),
      {
        headers: { "Idempotency-Key": randomUUID() },
        data: { expectedVersion: sent.version, responses: [{ field: "title", decision: "CONFIRMED" }] },
      },
    );
    assert.equal(incompleteDecision.status(), 422);

    const decisionPayload = {
      expectedVersion: sent.version,
      responses: [
        { field: "title", decision: "CONFIRMED" },
        { field: "summary", decision: "UNABLE_TO_CONFIRM" },
      ],
      summaryComment: "Decision sintetica B3.",
    };
    const [decisionA, decisionB] = await Promise.all([
      reviewerContext.request.post(
        new URL(`/api/v1/endorsement-requests/${endorsement.id}/decisions`, origin).toString(),
        { headers: { "Idempotency-Key": randomUUID() }, data: decisionPayload },
      ),
      reviewerContext.request.post(
        new URL(`/api/v1/endorsement-requests/${endorsement.id}/decisions`, origin).toString(),
        { headers: { "Idempotency-Key": randomUUID() }, data: decisionPayload },
      ),
    ]);
    const decisionStatuses = [decisionA.status(), decisionB.status()].sort((a, b) => a - b);
    if (decisionStatuses[0] !== 200 || decisionStatuses[1] !== 409) {
      const responseBodies = await Promise.all([decisionA.text(), decisionB.text()]);
      assert.fail(`La decision concurrente devolvio ${decisionStatuses.join("/")}: ${responseBodies.join(" | ")}`);
    }
    const decisionWinner = decisionA.status() === 200 ? decisionA : decisionB;
    assert.equal((await jsonData<{ status: string }>(decisionWinner)).status, "PARTIAL");

    const enterpriseResponse = await ownerContext.request.post(
      new URL("/api/v1/endorsement-requests", origin).toString(),
      {
        headers: { "Idempotency-Key": randomUUID() },
        data: {
          revisionId: workspaceRevisionId,
          reviewerUserId: reviewer.id,
          organizationId: workspaceA.id,
          relationshipLabel: "Manager sintetico B3",
          requestedScope: ["title"],
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          sendNow: true,
        },
      },
    );
    assert.equal(enterpriseResponse.status(), 201, await enterpriseResponse.text());
    const enterprise = await jsonData<{ id: string; version: number }>(enterpriseResponse);
    await prisma.terraqoWorkspaceMember.updateMany({
      where: { workspaceId: workspaceA.id, userId: reviewer.id },
      data: { active: false },
    });
    const lostAuthority = await reviewerContext.request.post(
      new URL(`/api/v1/endorsement-requests/${enterprise.id}/decisions`, origin).toString(),
      {
        headers: { "Idempotency-Key": randomUUID() },
        data: { expectedVersion: enterprise.version, responses: [{ field: "title", decision: "CONFIRMED" }] },
      },
    );
    assert.equal(lostAuthority.status(), 403);

    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto(new URL("/portal/selecciones", origin).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await ownerPage.getByText("Selecciones compartidas", { exact: true }).waitFor({ timeout: 60_000 });
    await mkdir("output/playwright", { recursive: true });
    await ownerPage.screenshot({ path: "output/playwright/platform-staging-b3-selections.png", fullPage: true });
    await ownerPage.goto(new URL("/portal/respaldos", origin).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await ownerPage.getByText("Respaldos profesionales", { exact: true }).waitFor({ timeout: 60_000 });
    await ownerPage.screenshot({ path: "output/playwright/platform-staging-b3-endorsements.png", fullPage: true });
    await ownerPage.close();

    console.log(JSON.stringify({
      outcome: "passed",
      authenticatedUsers: 3,
      isolatedWorkspaces: 2,
      idempotentReplay: true,
      privateScopeEnforced: true,
      expiryEnforced: true,
      privateRevocationEnforced: true,
      publicRevocationEnforced: true,
      workspacePublicationRejected: true,
      endorsementConflictRejected: true,
      enterpriseAuthorityRechecked: true,
      b3UiVisible: true,
    }));
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
    await browser.close();
    if (prisma) {
      if (userIds.length) {
        await prisma.terraqoEndorsementDecision.deleteMany({ where: { reviewerId: { in: userIds } } });
        await prisma.terraqoEndorsementRequest.deleteMany({ where: { requesterId: { in: userIds } } });
        await prisma.terraqoShareCollection.deleteMany({ where: { createdById: { in: userIds } } });
      }
      if (worklogIds.length) await prisma.terraqoWorklogEntry.deleteMany({ where: { id: { in: worklogIds } } });
      if (workspaceIds.length) await prisma.terraqoWorkspace.deleteMany({ where: { id: { in: workspaceIds } } });
      await prisma.verificationToken.deleteMany({
        where: { identifier: { in: userIds.map((id) => `web-cv-session:${id}`) } },
      });
      if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      assert.equal(await prisma.user.count(), 0);
      assert.equal(await prisma.terraqoWorkspace.count(), 0);
      assert.equal(await prisma.terraqoWorklogEntry.count(), 0);
      assert.equal(await prisma.terraqoShareCollection.count(), 0);
      assert.equal(await prisma.terraqoEndorsementRequest.count(), 0);
      await prisma.$disconnect();
    }
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
