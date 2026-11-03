import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { chromium, type BrowserContext } from "playwright";
import { validatePlatformStagingEnvironment } from "./lib/platform-staging-environment";

async function main() {
  assert.equal(process.env.TERRAQO_STAGING_MUTATING_TESTS, "mghdpciewbsowjrjwmwk:s23-http-fixtures");
  assert.equal(process.env.TERRAQO_SELECTION_ACCESS_REQUESTS_V1, "true");
  const target = validatePlatformStagingEnvironment(process.env);
  assert.equal(target.supabaseProjectRef, "mghdpciewbsowjrjwmwk");
  assert.equal(target.databaseRole, "terraqo_staging_runtime");
  const origin = "https://terraqo-platform-staging.netlify.app";
  assert.equal(process.env.TEST_PLATFORM_STAGING_URL, origin);
  process.env.DATABASE_URL = process.env.B5_GATE_DATABASE_URL;
  const { prisma } = await import("../lib/prisma");
  assert.equal(await prisma.user.count(), 0, "Refuse to mutate staging with preexisting users");
  assert.equal(await prisma.terraqoWorkspace.count(), 0);
  const suffix = randomBytes(6).toString("hex"), password = randomBytes(24).toString("base64url");
  const ids: string[] = [], worklogs: string[] = [], contexts: BrowserContext[] = [];
  const browser = await chromium.launch();
  try {
    const users = [];
    for (let i = 0; i < 3; i++) {
      const user = await prisma.user.create({ data: { email: `s23-${i}-${suffix}@example.invalid`, name: `S23 Actor ${i}`, role: "CUSTOMER", emailVerified: new Date(), passwordHash: await bcrypt.hash(password, 12), terraqoProfessionalProfile: { create: { username: `s23-${i}-${suffix}`, visibility: "PRIVATE", liveCvEnabled: false } } }, include: { terraqoProfessionalProfile: true } });
      ids.push(user.id); users.push(user);
      const context = await browser.newContext(); contexts.push(context);
      const page = await context.newPage();
      await page.goto(`${origin}/cuenta`, { waitUntil: "networkidle" });
      await page.locator("#email").fill(user.email!); await page.locator("#password").fill(password);
      await Promise.all([page.waitForURL(url => url.origin === origin && /^\/(portal|admin)/.test(url.pathname), { timeout: 60_000 }), page.getByRole("button", { name: "Iniciar sesión", exact: true }).click()]);
      assert.equal((await (await context.request.get(`${origin}/api/auth/session`)).json()).user.id, user.id);
      await page.close();
    }
    const [owner, requester] = users;
    const log = await prisma.terraqoWorklogEntry.create({ data: { authorId: owner.id, professionalProfileId: owner.terraqoProfessionalProfile!.id, title: "Reserved source title", summary: "Allowed summary S23" } }); worklogs.push(log.id);
    const revision = await prisma.terraqoWorklogRevision.create({ data: { worklogId: log.id, revisionNo: 1, createdById: owner.id, title: log.title, summary: log.summary, contentHash: suffix } });
    const collection = await prisma.terraqoShareCollection.create({ data: { professionalProfileId: owner.terraqoProfessionalProfile!.id, createdById: owner.id, title: "S23 synthetic selection", operationKey: randomUUID(), operationFingerprint: suffix, items: { create: { revisionId: revision.id, allowedFields: ["summary"], sortOrder: 0 } } } });
    const [ownerContext, requesterContext, outsiderContext] = contexts;
    const api = `${origin}/api/v1/selection-access-requests`, headers = { Origin: origin };
    const page = await requesterContext.newPage();
    await page.goto(`${origin}/portal/selecciones/${collection.id}`);
    await page.getByLabel("Motivo (opcional)").fill("Solicitud sintética de revisión");
    const sent = page.waitForResponse(r => r.url() === api && r.request().method() === "POST");
    await page.getByRole("button", { name: "Enviar solicitud", exact: true }).click(); assert.equal((await sent).status(), 202);
    const pending = (await (await ownerContext.request.get(api)).json()).data;
    assert.equal(pending.length, 1);
    assert.deepEqual((await (await outsiderContext.request.get(api)).json()).data, []);
    const approval = { requestId: pending[0].id, expectedVersion: 1, expectedCollectionVersion: 1, decision: "APPROVED", confirmed: true, scopeChangeConfirmed: false, allowDownload: false, expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
    assert.equal((await outsiderContext.request.patch(api, { headers, data: approval })).status(), 404);
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto(`${origin}/portal/selecciones`);
    await ownerPage.getByLabel("Acceso hasta").fill(approval.expiresAt.slice(0, 16));
    await ownerPage.getByLabel("Confirmo el acceso").check();
    const approved = ownerPage.waitForResponse(r => r.url() === api && r.request().method() === "PATCH");
    await ownerPage.getByRole("button", { name: "Conceder acceso", exact: true }).click(); assert.equal((await approved).status(), 200);
    const lookup = `${api}?targetType=collection&target=${collection.id}`;
    assert.equal((await (await requesterContext.request.get(lookup)).json()).data.available, true);
    const privateApi = `${origin}/api/v1/shared-selections/${collection.id}`;
    const shared = await requesterContext.request.get(privateApi); assert.equal(shared.status(), 200);
    const item = (await shared.json()).data.items[0]; assert.equal(item.summary, "Allowed summary S23"); assert.equal(item.title, undefined);
    assert.equal((await outsiderContext.request.get(privateApi)).status(), 404);
    await prisma.terraqoAccessGrant.updateMany({ where: { collectionId: collection.id, subjectUserId: requester.id }, data: { lifecycle: "REVOKED", revokedAt: new Date() } });
    assert.equal((await requesterContext.request.get(privateApi)).status(), 404);
    assert.deepEqual((await (await requesterContext.request.get(lookup)).json()).data, { available: false });
    console.log(JSON.stringify({ passed: true, authenticatedUsers: 3, uiRequestAndApproval: true, scopedProjection: true, outsiderDenied: true, revokedReadDenied: true }));
  } finally {
    await Promise.all(contexts.map(context => context.close())); await browser.close();
    if (ids.length) {
      await prisma.terraqoSelectionAccessRequest.deleteMany({ where: { requesterId: { in: ids } } });
      await prisma.terraqoShareCollection.deleteMany({ where: { createdById: { in: ids } } });
      if (worklogs.length) await prisma.terraqoWorklogEntry.deleteMany({ where: { id: { in: worklogs } } });
      await prisma.verificationToken.deleteMany({ where: { identifier: { in: ids.map(id => `web-cv-session:${id}`) } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    assert.equal(await prisma.user.count(), 0); assert.equal(await prisma.terraqoSelectionAccessRequest.count(), 0);
    await prisma.$disconnect();
  }
}
void main().catch(error => { console.error(error instanceof Error ? error.stack : "S23 gate failed"); process.exitCode = 1; });
