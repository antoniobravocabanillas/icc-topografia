import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { s24BlobRun } from "./lib/s24-blob-fixtures.mjs";
import { createS24Selection, checkReviewSnapshot, checkPublicSelection, checkReviewMedia, checkGrantBoundary, type ReadAs } from "./lib/s24-acceptance";
import { cleanupS24, s24Baseline } from "./lib/s24-cleanup";
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
  const csrf = await context.request.get(new URL("/api/auth/csrf", origin).href, { maxRedirects: 0 });
  assert.equal(csrf.status(), 200);
  const { csrfToken } = await csrf.json();
  assert.ok(typeof csrfToken === "string" && csrfToken.length);
  const callback = await context.request.post(new URL("/api/auth/callback/credentials", origin).href, {
    maxRedirects: 0, headers: { "X-Auth-Return-Redirect": "1", Origin: origin.origin },
    form: { csrfToken, email, password, callbackUrl: new URL("/admin/publicaciones", origin).href },
  });
  assert.equal(callback.status(), 200);
  const session = await context.request.get(new URL("/api/auth/session", origin).href, { maxRedirects: 0 });
  assert.equal(session.status(), 200);
  assert.equal((await session.json()).user.email, email, "Auth.js must issue a real session");
}

async function jsonData<T>(response: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  const body = await response.json() as { data: unknown };
  return body.data as T;
}

async function main() {
  const origin = confirmedTarget();
  const blobRun = s24BlobRun(process.env.PLATFORM_STAGING_S24_BLOB_RUN);
  process.env.DATABASE_URL = process.env.B5_GATE_DATABASE_URL;
  ({ prisma } = await import("../lib/prisma"));

  const before = await s24Baseline(prisma);
  const empty = before.users === 0 && before.workspaces === 0 && before.invitations === 0;
  const retained = before.users === 1 && before.workspaces === 1 && before.invitations === 1 &&
    await prisma.terraqoWorkspaceInvitation.count({ where: { role: "VIEWER" } }) === 1;
  assert.ok(empty || retained, "Unexpected staging baseline; refusing fixture writes");

  const suffix = randomBytes(6).toString("hex");
  const password = randomBytes(18).toString("base64url");
  const emails = [
    `s24-owner-${suffix}@example.invalid`,
    `s24-reviewer-${suffix}@example.invalid`,
    `s24-stranger-${suffix}@example.invalid`,
  ];
  const userIds = ["owner", "reviewer", "stranger"].map(role => `s24-${role}-${suffix}`);
  const workspaceIds = [`s24-a-${suffix}`, `s24-b-${suffix}`];
  const worklogIds: string[] = [];
  assert.equal(await prisma.user.count({ where: { id: { in: userIds } } }), 0);
  assert.equal(await prisma.terraqoWorkspace.count({ where: { id: { in: workspaceIds } } }), 0);
  const browser = await chromium.launch({ headless: true });
  const contexts: BrowserContext[] = [];
  let checked: { collectionId: string; reviewIds: string[]; projectionId: string; attachments: { id: string; sha256: string }[] } | undefined;

  try {
    const users = [];
    for (const [index, email] of emails.entries()) {
      const user = await prisma.user.create({
        data: {
          id: userIds[index], email,
          name: ["S24 Owner", "S24 Reviewer", "S24 Stranger"][index],
          role: index === 1 ? "ADMIN" : "CUSTOMER",
          emailVerified: new Date(),
          passwordHash: await bcrypt.hash(password, 12),
          terraqoProfessionalProfile: {
            create: {
              username: `s24-${index}-${suffix}`,
              headline: "Perfil sintetico de staging S24",
              visibility: "PRIVATE",
              liveCvEnabled: index === 0,
            },
          },
        },
        include: { terraqoProfessionalProfile: { select: { id: true } } },
      });
      users.push(user);
    }
    const [owner, reviewer, stranger] = users;
    assert.ok(owner?.terraqoProfessionalProfile && reviewer && stranger);

    const workspaceA = await prisma.terraqoWorkspace.create({
      data: {
        id: workspaceIds[0], name: `S24 Workspace A ${suffix}`,
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
    await prisma.terraqoWorkspace.create({
      data: {
        id: workspaceIds[1], name: `S24 Workspace B ${suffix}`,
        slug: `s24-b-${suffix}`,
        ownerUserId: stranger.id,
        members: { create: { userId: stranger.id, role: "OWNER", active: true, joinedAt: new Date() } },
      },
      select: { id: true },
    });

    const selection = await createS24Selection(prisma, { runId: blobRun, ownerId: owner.id, workspaceId: workspaceA.id,
      profileId: owner.terraqoProfessionalProfile.id, worklogIds });
    const { collection } = selection;
    async function isolatedContext() {
      const context = await browser.newContext({ serviceWorkers: "block" });
      contexts.push(context);
      await context.route("**/*", route => new URL(route.request().url()).origin === origin.origin
        ? route.continue() : route.abort());
      return context;
    }
    const anonymous = await isolatedContext();
    const ownerContext = await isolatedContext();
    const reviewerContext = await isolatedContext();
    const strangerContext = await isolatedContext();
    await Promise.all([
      signIn(ownerContext, origin, emails[0]!, password),
      signIn(reviewerContext, origin, emails[1]!, password),
      signIn(strangerContext, origin, emails[2]!, password),
    ]);
    const reviewsUrl = new URL('/api/v1/publication-reviews', origin).toString();
    const publicationUrl = new URL(`/api/v1/share-collections/${collection.id}/projection`, origin).toString();
    const headers = { Origin: origin.origin };
    assert.equal((await anonymous.request.get(reviewsUrl)).status(), 401);
    const read: ReadAs = async (actor, path) => {
      const context = { anonymous, reviewer: reviewerContext, owner: ownerContext, stranger: strangerContext }[actor];
      const result = await context.request.get(new URL(path, origin).href, { maxRedirects: 0 });
      return new Response(new Uint8Array(await result.body()), { status: result.status(), headers: result.headers() });
    };
    const first = await ownerContext.request.post(reviewsUrl, { headers, data: { collectionId: collection.id, expectedVersion: 1 } });
    assert.equal(first.status(), 200);
    const [stale] = await jsonData<Array<{ id: string; scopeHash: string }>>(first);
    await prisma.terraqoShareCollection.update({ where: { id: collection.id }, data: { version: { increment: 1 } } });
    assert.equal((await reviewerContext.request.patch(reviewsUrl, { headers, data: { reviewId: stale.id,
      payload: { decision: "APPROVED", confirmed: true, scopeHash: stale.scopeHash } } })).status(), 409);
    assert.equal((await ownerContext.request.post(reviewsUrl, { headers, data: { collectionId: collection.id, expectedVersion: 1 } })).status(), 409);
    assert.equal((await ownerContext.request.post(publicationUrl, { data: { expectedVersion: 1 } })).status(), 409);
    assert.equal((await prisma.terraqoPublicationReview.findUniqueOrThrow({ where: { id: stale.id } })).decision, "PENDING");
    for (const { selected } of selection.records)
      assert.equal((await read("reviewer", `/api/v1/publication-reviews/${stale.id}/media/${selected.id}`)).status, 404);
    const requested = await ownerContext.request.post(reviewsUrl, { headers, data: { collectionId: collection.id, expectedVersion: 2 } });
    assert.equal(requested.status(), 200);
    const [review] = await jsonData<Array<{ id: string; scopeHash: string }>>(requested);
    assert.ok(review);
    assert.notEqual(review.id, stale.id);
    await checkReviewMedia(read, review.id, selection);
    const queue = await reviewerContext.request.get(reviewsUrl);
    assert.equal(queue.status(), 200);
    const active = (await jsonData<Array<{ id: string; snapshot: { items: unknown[] } }>>(queue)).find(row => row.id === review.id);
    assert.ok(active);
    checkReviewSnapshot(active.snapshot, selection);
    assert.deepEqual(await jsonData(await strangerContext.request.get(reviewsUrl)), []);
    const approval = { reviewId: review.id, payload: { decision: 'APPROVED', confirmed: true, scopeHash: review.scopeHash } };
    assert.equal((await strangerContext.request.patch(reviewsUrl, { headers, data: approval })).status(), 403);
    const premature = await ownerContext.request.post(publicationUrl, { data: { expectedVersion: 2 } });
    assert.equal(premature.status(), 409, 'Missing approval must deny publication');
    const page = await reviewerContext.newPage();
    await page.goto(new URL('/admin/publicaciones', origin).toString(), { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Autorizaciones de publicación', exact: true }).waitFor();
    await page.getByRole('button').filter({ hasText: 'Selección de prueba S24' }).filter({ hasText: /versión 2/i }).click();
    assert.equal(new URL(page.url()).origin, origin.origin);
    const approve = page.getByRole('button', { name: 'Autorizar selección', exact: true });
    assert.equal(await approve.isEnabled(), false);
    const preview = page.getByRole("region", { name: "Vista previa del material solicitado" });
    const images = preview.locator("img");
    assert.equal(await images.count(), 2);
    for (const [index, record] of selection.records.entries()) {
      const img = images.nth(index);
      await img.scrollIntoViewIfNeeded(); // The second image may be lazy-loaded.
      const src = await img.getAttribute("src");
      assert.ok(src);
      const mediaUrl = new URL(src, origin);
      assert.equal(mediaUrl.origin, origin.origin);
      assert.equal(mediaUrl.pathname, `/api/v1/publication-reviews/${review.id}/media/${record.selected.id}`);
      await img.evaluate(node => (node as HTMLImageElement).decode());
    }
    assert.equal(await page.getByRole("checkbox").isChecked(), false);
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
    assert.equal(await prisma.terraqoPublicProjection.count({ where: { collectionId: collection.id } }), 0, 'Approval must not publish');
    const publication = await ownerContext.request.post(publicationUrl, { data: { expectedVersion: 2 } });
    assert.equal(publication.status(), 200);
    const { slug, id: projectionId } = await jsonData<{ slug: string; id: string }>(publication);
    await prisma.terraqoWorklogEntry.update({ where: { id: worklogIds[0]! }, data: { locationLabel: "Cambio posterior" } });
    await checkPublicSelection(read, slug, selection);
    await checkReviewMedia(read, review.id, selection);
    await checkGrantBoundary(prisma, read, selection, owner.id, reviewer.id, workspaceA.id);
    const { checkActiveReaders } = await import("./lib/s24-readers");
    const checkWithdrawnReaders = await checkActiveReaders({ userId: reviewer.id, workspaceId: workspaceA.id,
      profileId: owner.terraqoProfessionalProfile.id, ownerId: owner.id, selection, projectionId });
    assert.equal((await reviewerContext.request.delete(reviewsUrl, { headers, data: { reviewId: review.id, reason: 'Retiro de prueba S24' } })).status(), 200);
    await checkPublicSelection(read, slug, selection, true);
    await checkReviewMedia(read, review.id, selection, true);
    await checkWithdrawnReaders();
    const { checkHostedPublicWorkCase } = await import("./lib/hosted-public-work-case");
    await checkHostedPublicWorkCase({ db: prisma, origin, ownerContext, reviewerContext, anonymous, selection,
      workspaceId: workspaceA.id, priorReviewId: review.id });
    checked = { collectionId: collection.id, projectionId, reviewIds: [stale.id, review.id],
      attachments: selection.records.map(({ selected }) => ({ id: selected.id, sha256: createHash("sha256").update(selected.bytes).digest("hex") })) };
  } finally {
    // Blob lifecycle belongs to the local operator, including after a failed HTTP assertion.
    await Promise.allSettled(contexts.map(context => context.close()));
    const results = await Promise.allSettled([
      browser.close(),
      cleanupS24(prisma, { userIds, workspaceIds, worklogIds }),
    ]);
    if (results.some(result => result.status === "rejected")) {
      console.error(JSON.stringify({ runId: blobRun, databaseFixtureId: suffix, databaseCleanup: "failed", userIds, workspaceIds, worklogIds }));
      throw new Error("S24 fixture cleanup failed; inspect listed synthetic IDs before retrying");
    }
    assert.deepEqual(await s24Baseline(prisma), before, "Retained staging baseline changed");
    if (!checked) console.error(JSON.stringify({ runId: blobRun, databaseFixtureId: suffix, databaseCleanup: "matched", userIds, workspaceIds, worklogIds }));
  }
  console.log(JSON.stringify({ passed: true, runId: blobRun, databaseFixtureId: suffix, baseline: before, databaseCleanup: "matched",
    userIds, workspaceIds, worklogIds, ...checked, blobCleanup: "external",
    authenticatedUsers: 3, selectedAttachments: 2, excludedAttachments: 2,
    staleRequestDecisionPublish: 409, explicitUiApproval: true, expiredGrantDenied: true,
    publicAndReviewBytesRevoked: true, databaseReaders: ["discovery", "dossier", "context", "analysis"] }));
}
void main().catch(error => { console.error(error instanceof Error ? error.stack : "S24 gate failed"); process.exitCode = 1; })
  .finally(async () => { await prisma?.$disconnect(); });
