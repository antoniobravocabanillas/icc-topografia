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
    "mghdpciewbsowjrjwmwk:s24-http-fixtures",
    "El E2E HTTP exige consentimiento exacto para fixtures sinteticos S24.",
  );
  assert.equal(process.env.TERRAQO_WORKSPACE_PUBLICATION_V1, "true");
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
    page.waitForURL((url) => url.origin === origin.origin && /^\/(portal|admin)/.test(url.pathname), { timeout: 60_000 }),
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
    "Staging dejo de estar vacio; el runner S24 se niega a tocar datos preexistentes.",
  );

  const suffix = randomBytes(6).toString("hex");
  const password = randomBytes(18).toString("base64url");
  const emails = [
    `s24-owner-${suffix}@example.invalid`,
    `s24-reviewer-${suffix}@example.invalid`,
    `s24-stranger-${suffix}@example.invalid`,
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
          name: ["S24 Owner", "S24 Reviewer", "S24 Stranger"][index],
          role: index === 1 ? "ADMIN" : "CUSTOMER",
          emailVerified: new Date(),
          passwordHash: await bcrypt.hash(password, 12),
          terraqoProfessionalProfile: {
            create: {
              username: `s24-${index}-${suffix}`,
              headline: "Perfil sintetico de staging S24",
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
        name: `S24 Workspace A ${suffix}`,
        slug: `s24-a-${suffix}`,
        ownerUserId: owner.id,
        members: {
          create: [
            { userId: owner.id, role: "MEMBER", active: true, joinedAt: new Date() },
            { userId: reviewer.id, role: "ADMIN", active: true, joinedAt: new Date() },
          ],
        },
      },
      select: { id: true },
    });
    const workspaceB = await prisma.terraqoWorkspace.create({
      data: {
        name: `S24 Workspace B ${suffix}`,
        slug: `s24-b-${suffix}`,
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
          locationLabel: "Ubicacion sintetica S24",
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

    const revisionId = await createRevisionFixture(workspaceA.id, "Título reservado S24");
    const collection = await prisma.terraqoShareCollection.create({ data: {
      professionalProfileId: owner.terraqoProfessionalProfile.id, createdById: owner.id,
      title: "Selección de prueba S24", operationKey: randomUUID(), operationFingerprint: suffix,
      items: { create: { revisionId, allowedFields: ["summary", "locationLabel"], sortOrder: 0 } },
    } });
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
    const reviewsUrl = new URL('/api/v1/publication-reviews', origin).toString();
    const publicationUrl = new URL(`/api/v1/share-collections/${collection.id}/projection`, origin).toString();
    const headers = { Origin: origin.origin };
    assert.equal((await anonymous.request.get(reviewsUrl)).status(), 401);
    const requested = await ownerContext.request.post(reviewsUrl, { headers, data: { collectionId: collection.id, expectedVersion: 1 } });
    assert.equal(requested.status(), 200);
    const [review] = await jsonData<Array<{ id: string; scopeHash: string }>>(requested);
    assert.ok(review);
    assert.deepEqual(await jsonData(await strangerContext.request.get(reviewsUrl)), []);
    const approval = { reviewId: review.id, payload: { decision: 'APPROVED', confirmed: true, scopeHash: review.scopeHash } };
    assert.equal((await strangerContext.request.patch(reviewsUrl, { headers, data: approval })).status(), 403);
    const premature = await ownerContext.request.post(publicationUrl, { data: { expectedVersion: 1 } });
    assert.ok(premature.status() >= 400 && premature.status() < 500, 'Missing approval must deny publication');
    const page = await reviewerContext.newPage();
    await page.goto(new URL('/admin/publicaciones', origin).toString(), { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Autorizaciones de publicación', exact: true }).waitFor();
    await page.getByRole('button').filter({ hasText: 'Selección de prueba S24' }).click();
    const approve = page.getByRole('button', { name: 'Autorizar selección', exact: true });
    assert.equal(await approve.isEnabled(), false);
    await mkdir('output/playwright', { recursive: true });
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `output/playwright/platform-staging-s24-${width}.png`, fullPage: true });
    }
    await page.getByRole('checkbox').check();
    const decision = page.waitForResponse(r => r.url() === reviewsUrl && r.request().method() === 'PATCH');
    await approve.click();
    assert.equal((await decision).status(), 200);
    assert.equal(await prisma.terraqoPublicProjection.count(), 0, 'Approval must not publish');
    const publication = await ownerContext.request.post(publicationUrl, { data: { expectedVersion: 1 } });
    assert.equal(publication.status(), 200);
    const { slug } = await jsonData<{ slug: string }>(publication);
    const publicUrl = new URL(`/api/v1/public/selections/${slug}`, origin).toString();
    await prisma.terraqoWorklogEntry.update({ where: { id: worklogIds[0]! }, data: { locationLabel: 'Cambio posterior' } });
    const publicResponse = await anonymous.request.get(publicUrl);
    assert.equal(publicResponse.status(), 200);
    const projection = await jsonData<{ items: Array<Record<string, unknown>> }>(publicResponse);
    assert.equal(projection.items[0]?.locationLabel, 'Ubicacion sintetica S24');
    assert.equal(projection.items[0]?.title, undefined);
    assert.equal((await reviewerContext.request.delete(reviewsUrl, { headers, data: { reviewId: review.id, reason: 'Retiro de prueba S24' } })).status(), 200);
    assert.equal((await anonymous.request.get(publicUrl)).status(), 404);
    console.log(JSON.stringify({ passed: true, authenticatedUsers: 3, isolatedWorkspaces: 2,
      explicitUiApproval: true, publicSnapshot: true, unrelatedWorkspaceDenied: true, revokedPublicReadDenied: true }));
  } finally {
    await Promise.all(contexts.map(context => context.close().catch(() => undefined)));
    await browser.close();
    if (prisma) {
      if (userIds.length) {
        await prisma.terraqoPublicationReview.deleteMany({ where: { requestedById: { in: userIds } } });
        await prisma.terraqoShareCollection.deleteMany({ where: { createdById: { in: userIds } } });
      }
      if (worklogIds.length) await prisma.terraqoWorklogEntry.deleteMany({ where: { id: { in: worklogIds } } });
      if (workspaceIds.length) await prisma.terraqoWorkspace.deleteMany({ where: { id: { in: workspaceIds } } });
      await prisma.verificationToken.deleteMany({ where: { identifier: { in: userIds.map(id => `web-cv-session:${id}`) } } });
      if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      assert.equal(await prisma.user.count(), 0);
      assert.equal(await prisma.terraqoWorkspace.count(), 0);
      assert.equal(await prisma.terraqoPublicationReview.count(), 0);
      assert.equal(await prisma.terraqoShareCollection.count(), 0);
      await prisma.$disconnect();
    }
  }
}
void main().catch(error => { console.error(error instanceof Error ? error.stack : 'S24 gate failed'); process.exitCode = 1; });

