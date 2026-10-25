import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { chromium, type BrowserContext } from "playwright";
import { validatePlatformStagingEnvironment } from "./lib/platform-staging-environment";

let prisma: (typeof import("../lib/prisma"))["prisma"] | undefined;

function confirmedTarget() {
  assert.equal(
    process.env.TERRAQO_STAGING_MUTATING_TESTS,
    "mghdpciewbsowjrjwmwk:b1-b2-http-fixtures",
    "El E2E HTTP exige consentimiento exacto para fixtures sinteticos B1/B2.",
  );
  const target = validatePlatformStagingEnvironment(process.env);
  assert.equal(target.databaseProvider, "supabase");
  assert.equal(target.supabaseProjectRef, "mghdpciewbsowjrjwmwk");
  assert.equal(target.databaseRole, "terraqo_staging_runtime");
  assert.equal(target.applicationHost, "terraqo-platform-staging.netlify.app");
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
    "Staging dejo de estar vacio; el runner se niega a tocar datos preexistentes.",
  );

  const suffix = randomBytes(6).toString("hex");
  const password = randomBytes(18).toString("base64url");
  const emails = [`b1b2-owner-${suffix}@example.invalid`, `b1b2-outsider-${suffix}@example.invalid`];
  const userIds: string[] = [];
  const browser = await chromium.launch({ headless: true });
  const contexts: BrowserContext[] = [];

  try {
    for (const [index, email] of emails.entries()) {
      const user = await prisma.user.create({
        data: {
          email,
          name: index === 0 ? "B1 B2 Owner" : "B1 B2 Outsider",
          role: "CUSTOMER",
          emailVerified: new Date(),
          passwordHash: await bcrypt.hash(password, 12),
          terraqoProfessionalProfile: {
            create: {
              username: `b1b2-${index}-${suffix}`,
              headline: "Perfil sintetico de staging",
              visibility: "PRIVATE",
              liveCvEnabled: false,
            },
          },
        },
        include: { terraqoProfessionalProfile: { select: { id: true } } },
      });
      userIds.push(user.id);
      assert.ok(user.terraqoProfessionalProfile);
      await prisma.terraqoWorklogEntry.create({
        data: {
          professionalProfileId: user.terraqoProfessionalProfile.id,
          authorId: user.id,
          title: `Registro B1 B2 ${index + 1}`,
          summary: "Fixture sintetico para validar aislamiento HTTP en el entorno exclusivo de staging.",
          visibility: "PRIVATE",
          lifecycle: "PUBLISHED",
          occurredAt: new Date(),
        },
      });
    }

    const owner = await prisma.user.findUniqueOrThrow({
      where: { id: userIds[0] },
      include: { terraqoProfessionalProfile: { include: { worklogs: { select: { id: true } } } } },
    });
    const outsider = await prisma.user.findUniqueOrThrow({
      where: { id: userIds[1] },
      include: { terraqoProfessionalProfile: { include: { worklogs: { select: { id: true } } } } },
    });
    const ownerWorklogId = owner.terraqoProfessionalProfile!.worklogs[0]!.id;
    const outsiderWorklogId = outsider.terraqoProfessionalProfile!.worklogs[0]!.id;

    const anonymous = await browser.newContext();
    contexts.push(anonymous);
    assert.equal((await anonymous.request.get(new URL("/api/v1/work-cases", origin).toString())).status(), 401);

    const ownerContext = await browser.newContext();
    const outsiderContext = await browser.newContext();
    contexts.push(ownerContext, outsiderContext);
    await signIn(ownerContext, origin, emails[0], password);
    await signIn(outsiderContext, origin, emails[1], password);

    const ownerList = await ownerContext.request.get(new URL("/api/v1/work-cases", origin).toString());
    assert.equal(ownerList.status(), 200);
    assert.deepEqual((await ownerList.json()).data, []);

    const createdResponse = await ownerContext.request.post(new URL("/api/v1/work-cases", origin).toString(), {
      data: {
        title: "Trabajo sintetico B1 B2",
        description: "Validacion HTTP de agrupacion y aislamiento.",
        records: [{ worklogId: ownerWorklogId, phase: "EXECUTION" }],
      },
    });
    assert.equal(createdResponse.status(), 201, await createdResponse.text());
    const created = (await createdResponse.json()).data;
    assert.equal(created.records.length, 1);
    assert.equal(created.records[0].worklogId, ownerWorklogId);

    const duplicate = await ownerContext.request.post(new URL("/api/v1/work-cases", origin).toString(), {
      data: { title: "Duplicado rechazado", records: [{ worklogId: ownerWorklogId }] },
    });
    assert.equal(duplicate.status(), 409);

    const outsiderList = await outsiderContext.request.get(new URL("/api/v1/work-cases", origin).toString());
    assert.equal(outsiderList.status(), 200);
    assert.deepEqual((await outsiderList.json()).data, []);
    const foreignMutation = await outsiderContext.request.post(
      new URL(`/api/v1/work-cases/${created.id}/records`, origin).toString(),
      { data: { expectedVersion: created.version, worklogId: outsiderWorklogId, phase: "RESULT" } },
    );
    assert.equal(foreignMutation.status(), 404);

    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto(new URL("/portal/bitacora", origin).toString(), { waitUntil: "networkidle" });
    await ownerPage.getByText("Continuidad del trabajo", { exact: true }).first().waitFor({ timeout: 60_000 });
    await mkdir("output/playwright", { recursive: true });
    await ownerPage.screenshot({ path: "output/playwright/platform-staging-b1-b2.png", fullPage: true });
    await ownerPage.close();

    console.log(JSON.stringify({
      outcome: "passed",
      authenticatedUsers: 2,
      anonymousRejected: true,
      workCaseCreated: true,
      duplicateRejected: true,
      crossUserReadIsolated: true,
      crossUserMutationRejected: true,
      workCaseUiVisible: true,
    }));
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
    await browser.close();
    if (prisma) {
      await prisma.verificationToken.deleteMany({
        where: { identifier: { in: userIds.map((id) => `web-cv-session:${id}`) } },
      });
      if (userIds.length) {
        // TerraqoWorkCase conserva createdById con FK restrictiva. Elimina
        // primero los agregados sinteticos y despues sus autores.
        await prisma.terraqoWorkCase.deleteMany({ where: { createdById: { in: userIds } } });
        await prisma.terraqoWorklogEntry.deleteMany({ where: { authorId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
      assert.equal(await prisma.user.count({ where: { id: { in: userIds } } }), 0);
      assert.equal(await prisma.terraqoWorkspace.count(), 0);
      assert.equal(await prisma.terraqoWorklogEntry.count(), 0);
      assert.equal(await prisma.terraqoWorkCase.count(), 0);
      await prisma.$disconnect();
    }
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
