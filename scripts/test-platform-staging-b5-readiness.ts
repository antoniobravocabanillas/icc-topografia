import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { chromium, type APIRequestContext, type BrowserContext } from "playwright";
import { validatePlatformStagingEnvironment } from "./lib/platform-staging-environment";

const PILOT_WORKSPACE_ID = "cm00000000000000000000001";
const ENABLED_B1_B4_FLAGS = [
  "TERRAQO_WORKLOG_FTS_V1",
  "TERRAQO_WORK_CASES_V1",
  "TERRAQO_SCOPED_SHARING_V1",
  "TERRAQO_SCOPED_ENDORSEMENTS_V1",
  "TERRAQO_DISCOVERY_NEEDS_V1",
  "TERRAQO_CONTEXTUAL_MESSAGING_V1",
  "TERRAQO_COLLABORATION_V1",
  "TERRAQO_CLOSURE_V1",
] as const;

let prisma: (typeof import("../lib/prisma"))["prisma"] | undefined;

type Feature = {
  feature: "employer_needs" | "collaboration_closure" | "evidence_analysis";
  status: "DISABLED" | "PENDING_PILOT" | "ACTIVE" | "LIMIT_REACHED";
  active: boolean;
  readPreserved: boolean;
};

function confirmedTarget() {
  assert.equal(
    process.env.TERRAQO_STAGING_MUTATING_TESTS,
    "mghdpciewbsowjrjwmwk:b5-http-readiness-fixtures",
    "El gate B5 HTTP exige consentimiento exacto para fixtures sinteticos.",
  );
  const target = validatePlatformStagingEnvironment(process.env);
  assert.equal(target.databaseProvider, "supabase");
  assert.equal(target.supabaseProjectRef, "mghdpciewbsowjrjwmwk");
  assert.equal(target.databaseRole, "terraqo_staging_runtime");
  assert.deepEqual(target.enabledFlags, [...ENABLED_B1_B4_FLAGS]);
  assert.deepEqual(target.pilotWorkspaceIds, [PILOT_WORKSPACE_ID]);
  assert.equal(process.env.TERRAQO_EVIDENCE_ANALYSIS_V1, "false");
  assert.equal(process.env.TERRAQO_EVIDENCE_ANALYSIS_PROVIDER, "off");
  const origin = new URL(process.env.TEST_PLATFORM_STAGING_URL ?? "");
  assert.equal(origin.origin, "https://terraqo-platform-staging.netlify.app");
  assert.equal(origin.pathname, "/");
  return origin;
}

async function signIn(context: BrowserContext, origin: URL, email: string, password: string) {
  const page = await context.newPage();
  await page.goto(new URL("/cuenta", origin).toString(), { waitUntil: "networkidle", timeout: 60_000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await Promise.all([
    page.waitForURL((url) => url.origin === origin.origin && url.pathname.startsWith("/admin"), { timeout: 60_000 }),
    page.getByRole("button", { name: "Iniciar sesión", exact: true }).click(),
  ]);
  const session = await context.request.get(new URL("/api/auth/session", origin).toString());
  assert.equal(session.status(), 200);
  assert.equal((await session.json()).user.email, email);
  await page.close();
}

async function data<T>(response: Awaited<ReturnType<APIRequestContext["get"]>>) {
  const envelope = await response.json() as { data: T };
  return envelope.data;
}

function feature(features: Feature[], name: Feature["feature"]) {
  const value = features.find((item) => item.feature === name);
  assert.ok(value, `No se devolvio el entitlement ${name}.`);
  return value;
}

async function main() {
  const origin = confirmedTarget();
  process.env.DATABASE_URL = process.env.B5_GATE_DATABASE_URL;
  ({ prisma } = await import("../lib/prisma"));
  assert.deepEqual(
    { users: await prisma.user.count(), workspaces: await prisma.terraqoWorkspace.count() },
    { users: 0, workspaces: 0 },
    "Staging dejo de estar vacio; el gate B5 se niega a tocar datos preexistentes.",
  );

  const suffix = randomBytes(6).toString("hex");
  const password = randomBytes(18).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 12);
  const emails = [`b5-http-pilot-${suffix}@example.invalid`, `b5-http-control-${suffix}@example.invalid`];
  const userIds: string[] = [];
  const workspaceIds: string[] = [];
  const browser = await chromium.launch({ headless: true });
  const contexts: BrowserContext[] = [];

  try {
    const users = await Promise.all(emails.map((email, index) => prisma!.user.create({
      data: {
        email,
        name: index === 0 ? "B5 Pilot" : "B5 Control",
        role: "ADMIN",
        emailVerified: new Date(),
        passwordHash,
      },
      select: { id: true },
    })));
    userIds.push(...users.map((user) => user.id));

    const workspaces = await Promise.all(users.map((user, index) => prisma!.terraqoWorkspace.create({
      data: {
        ...(index === 0 ? { id: PILOT_WORKSPACE_ID } : {}),
        name: index === 0 ? `B5 HTTP Pilot ${suffix}` : `B5 HTTP Control ${suffix}`,
        slug: index === 0 ? `b5-http-pilot-${suffix}` : `b5-http-control-${suffix}`,
        ownerUserId: user.id,
        members: { create: { userId: user.id, role: "OWNER", active: true, joinedAt: new Date() } },
        subscriptions: { create: { tier: "PROFESSIONAL", status: "ACTIVE", seats: 2 } },
      },
      select: { id: true },
    })));
    workspaceIds.push(...workspaces.map((workspace) => workspace.id));

    const anonymous = await browser.newContext();
    const pilotContext = await browser.newContext();
    const controlContext = await browser.newContext();
    contexts.push(anonymous, pilotContext, controlContext);
    await Promise.all([
      signIn(pilotContext, origin, emails[0]!, password),
      signIn(controlContext, origin, emails[1]!, password),
    ]);

    assert.equal((await anonymous.request.post(new URL("/api/v1/analysis-jobs", origin).toString())).status(), 404);
    const [pilotResponse, controlResponse] = await Promise.all([
      pilotContext.request.get(new URL("/api/v1/entitlements", origin).toString()),
      controlContext.request.get(new URL("/api/v1/entitlements", origin).toString()),
    ]);
    assert.equal(pilotResponse.status(), 200, await pilotResponse.text());
    assert.equal(controlResponse.status(), 200, await controlResponse.text());
    const pilot = await data<{ workspaceId: string; features: Feature[] }>(pilotResponse);
    const control = await data<{ workspaceId: string; features: Feature[] }>(controlResponse);
    assert.equal(pilot.workspaceId, PILOT_WORKSPACE_ID);
    assert.equal(feature(pilot.features, "employer_needs").status, "ACTIVE");
    assert.equal(feature(pilot.features, "collaboration_closure").status, "ACTIVE");
    const pilotAnalysis = feature(pilot.features, "evidence_analysis");
    assert.equal(pilotAnalysis.status, "DISABLED");
    assert.equal(pilotAnalysis.active, false);
    assert.equal(pilotAnalysis.readPreserved, true);
    assert.equal(feature(control.features, "employer_needs").status, "PENDING_PILOT");
    assert.equal(feature(control.features, "collaboration_closure").status, "PENDING_PILOT");
    assert.equal(feature(control.features, "evidence_analysis").status, "DISABLED");

    const disabledMutation = await pilotContext.request.post(new URL("/api/v1/analysis-jobs", origin).toString(), {
      headers: { "Idempotency-Key": randomUUID() },
      data: { purpose: "EVIDENCE_SUMMARY", dossierId: "synthetic-disabled-b5" },
    });
    assert.equal(disabledMutation.status(), 404);

    const pilotPage = await pilotContext.newPage();
    await pilotPage.goto(new URL("/admin/necesidades", origin).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await pilotPage.getByRole("heading", { level: 1, name: "De una necesidad real a evidencia explicable" }).waitFor({ timeout: 60_000 });
    await pilotPage.getByRole("button", { name: "Crear necesidad privada" }).waitFor({ timeout: 60_000 });
    assert.equal(await pilotPage.getByText("T18 · Asistencia con evidencia", { exact: true }).count(), 0);
    await mkdir("output/playwright", { recursive: true });
    await pilotPage.screenshot({ path: "output/playwright/platform-staging-b5-readiness-pilot.png", fullPage: true });
    await pilotPage.close();

    const controlPage = await controlContext.newPage();
    await controlPage.goto(new URL("/admin/necesidades", origin).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await controlPage.getByText("Consulta conservada.", { exact: true }).waitFor({ timeout: 60_000 });
    await assert.doesNotReject(async () => {
      assert.equal(await controlPage.getByRole("button", { name: "Crear necesidad privada" }).isDisabled(), true);
    });
    await controlPage.screenshot({ path: "output/playwright/platform-staging-b5-readiness-control.png", fullPage: true });
    await controlPage.close();

    assert.equal(await prisma.terraqoAnalysisJob.count(), 0);
    console.log(JSON.stringify({
      outcome: "passed",
      pilotB1B4Active: true,
      controlOutsidePilot: true,
      evidenceAnalysisDisabled: true,
      providerOff: true,
      automaticAnalysisHidden: true,
      manualWorkflowAvailable: true,
    }));
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
    await browser.close();
    if (prisma) {
      if (workspaceIds.length) await prisma.terraqoWorkspace.deleteMany({ where: { id: { in: workspaceIds } } });
      if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      assert.deepEqual(
        { users: await prisma.user.count(), workspaces: await prisma.terraqoWorkspace.count(), jobs: await prisma.terraqoAnalysisJob.count() },
        { users: 0, workspaces: 0, jobs: 0 },
      );
      await prisma.$disconnect();
    }
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
