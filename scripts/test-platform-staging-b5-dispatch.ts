import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { chromium, type Browser, type BrowserContext } from "playwright";
import {
  platformFlags,
  validatePlatformStagingEnvironment,
} from "./lib/platform-staging-environment";

const stagingProjectRef = "mghdpciewbsowjrjwmwk";
const stagingOrigin = "https://terraqo-platform-staging.netlify.app";
const mutationConsent = `${stagingProjectRef}:b5-provider-dispatch-fixtures`;

function confirmedStagingTarget() {
  assert.equal(
    process.env.TERRAQO_STAGING_B5_PROVIDER_TESTS,
    mutationConsent,
    "El gate exige consentimiento exacto para el fixture B5 de proveedor y dispatcher.",
  );
  assert.equal(
    process.env.TERRAQO_STAGING_MUTATING_TESTS,
    `${stagingProjectRef}:b5-synthetic-fixtures`,
    "El gate exige el consentimiento mutante general de Terraqo Platform Staging.",
  );

  const origin = new URL(process.env.TEST_PLATFORM_STAGING_URL ?? "");
  assert.equal(origin.origin, stagingOrigin, "El gate solo admite el Site ID aislado de staging.");

  const target = validatePlatformStagingEnvironment(process.env);
  assert.equal(target.databaseProvider, "supabase");
  assert.equal(target.supabaseProjectRef, stagingProjectRef);
  assert.equal(target.databaseRole, "terraqo_staging_runtime");
  assert.equal(target.databaseName, "postgres");
  assert.equal(target.applicationHost, origin.hostname);
  assert.ok(["groq", "openai"].includes(target.evidenceAnalysisProvider));
  const enabled = process.env.TERRAQO_EVIDENCE_ANALYSIS_V1 === "true";
  assert.deepEqual(target.pilotWorkspaceIds, enabled ? ["cm00000000000000000000001"] : []);
  assert.equal(target.enabledFlags.includes("TERRAQO_EVIDENCE_ANALYSIS_V1"), enabled);
  for (const flag of platformFlags.filter((item) => item !== "TERRAQO_EVIDENCE_ANALYSIS_V1")) {
    assert.ok(target.enabledFlags.includes(flag), `El gate de dispatcher exige ${flag}.`);
  }

  const databaseUrl = process.env.B5_GATE_DATABASE_URL?.trim();
  assert.ok(databaseUrl, "Define B5_GATE_DATABASE_URL con el rol runtime de staging.");
  const parsedDatabase = new URL(databaseUrl);
  parsedDatabase.searchParams.set("connection_limit", "2");
  parsedDatabase.searchParams.set("pool_timeout", "30");

  const dispatchSecret = process.env.EVIDENCE_ANALYSIS_DISPATCH_SECRET?.trim();
  assert.ok(dispatchSecret && dispatchSecret.length >= 32, "Falta el secreto efimero del dispatcher B5.");

  return {
    databaseUrl: parsedDatabase.toString(),
    dispatchSecret,
    origin,
    provider: target.evidenceAnalysisProvider,
    enabled,
  };
}

async function waitForTerminalJob(
  read: () => Promise<{ status: string; failureCode: string | null }>,
) {
  const deadline = Date.now() + 120_000;
  const terminal = new Set(["READY", "INSUFFICIENT", "FAILED", "SOURCE_REVOKED", "CANCELLED"]);
  while (Date.now() < deadline) {
    const current = await read();
    if (terminal.has(current.status)) return current;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("El worker B5 no alcanzo un estado terminal dentro de 120 segundos.");
}

async function main() {
  const target = confirmedStagingTarget();
  process.env.DATABASE_URL = target.databaseUrl;
  process.env.TERRAQO_EVIDENCE_ANALYSIS_MAX_ATTEMPTS = "1";

  const [{ prisma }, analysis] = await Promise.all([
    import("@/lib/prisma"),
    import("@/lib/terraqo/evidence-analysis"),
  ]);
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const userIds: string[] = [];
  let workspaceId: string | null = null;
  let professionalProfileId: string | null = null;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let controlWorkspaceId: string | undefined;
  const password = randomUUID();

  try {
    const initialCounts = {
      users: await prisma.user.count(),
      workspaces: await prisma.terraqoWorkspace.count(),
      jobs: await prisma.terraqoAnalysisJob.count(),
    };
    assert.deepEqual(
      initialCounts,
      { users: 0, workspaces: 0, jobs: 0 },
      "Staging dejo de estar vacio; el gate se niega a tocar datos preexistentes.",
    );

    const [admin, professional] = await Promise.all([
      prisma.user.create({
        data: {
          email: `b5-dispatch-admin-${runId}@example.invalid`,
          name: "B5 dispatch admin",
          emailVerified: new Date(),
          role: "ADMIN",
          passwordHash: await bcrypt.hash(password, 12),
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          email: `b5-dispatch-professional-${runId}@example.invalid`,
          name: "B5 dispatch professional",
          emailVerified: new Date(),
        },
        select: { id: true },
      }),
    ]);
    userIds.push(admin.id, professional.id);

    const workspace = await prisma.terraqoWorkspace.create({
      data: {
        ...(target.enabled ? { id: "cm00000000000000000000001" } : {}),
        name: `B5 dispatch ${runId}`,
        slug: `b5-dispatch-${runId}`,
        ownerUserId: admin.id,
        members: {
          create: { userId: admin.id, role: "OWNER", active: true, joinedAt: new Date() },
        },
        subscriptions: { create: { tier: "PROFESSIONAL", status: "ACTIVE", seats: 2 } },
      },
      select: { id: true },
    });
    workspaceId = workspace.id;

    const profile = await prisma.terraqoProfessionalProfile.create({
      data: {
        userId: professional.id,
        username: `b5-dispatch-${runId}`,
        visibility: "PUBLIC",
        liveCvEnabled: true,
        liveCvVisibility: "PUBLIC",
      },
      select: { id: true },
    });
    professionalProfileId = profile.id;

    const summary = "Se replantearon ejes A y B con estacion total antes del vaciado de concreto.";
    const contentHash = createHash("sha256").update(summary).digest("hex");
    const worklog = await prisma.terraqoWorklogEntry.create({
      data: {
        professionalProfileId: profile.id,
        authorId: professional.id,
        title: "Replanteo sintetico de ejes",
        summary,
        outcome: "Ejes A y B senalizados para revision.",
        lifecycle: "PUBLISHED",
        visibility: "PUBLIC",
        locationLabel: "Ubicacion sintetica",
        revisions: {
          create: {
            revisionNo: 1,
            title: "Replanteo sintetico de ejes",
            summary,
            outcome: "Ejes A y B senalizados para revision.",
            contributionRole: "Apoyo topografico",
            responsibilities: ["Replanteo de ejes A y B"],
            methods: ["Radiacion"],
            tools: ["Estacion total"],
            contentHash,
            createdById: professional.id,
          },
        },
      },
      include: { revisions: { select: { id: true } } },
    });
    const revisionId = worklog.revisions[0]?.id;
    assert.ok(revisionId);
    await prisma.terraqoWorklogEntry.update({
      where: { id: worklog.id },
      data: { currentRevisionId: revisionId },
    });

    const need = await prisma.terraqoWorkNeed.create({
      data: {
        workspaceId: workspace.id,
        createdById: admin.id,
        operationKey: randomUUID(),
        operationFingerprint: `b5-dispatch-need-${runId}`,
        revisions: {
          create: {
            revisionNo: 1,
            title: "Control topografico de obra",
            problem: "Se requiere evidencia de replanteo antes del vaciado.",
            activities: ["Replanteo"],
            requiredTools: ["Estacion total"],
            endorsementNeeded: false,
            contentHash: createHash("sha256").update(`need-${runId}`).digest("hex"),
            createdById: admin.id,
            operationKey: randomUUID(),
            operationFingerprint: `b5-dispatch-need-revision-${runId}`,
            requirements: {
              create: { label: "Evidencia de replanteo", priority: "REQUIRED", sortOrder: 0 },
            },
          },
        },
      },
      include: { revisions: { select: { id: true } } },
    });
    const needRevisionId = need.revisions[0]?.id;
    assert.ok(needRevisionId);
    await prisma.terraqoWorkNeed.update({
      where: { id: need.id },
      data: { currentRevisionId: needRevisionId },
    });

    const dossier = await prisma.terraqoEvaluationDossier.create({
      data: {
        workspaceId: workspace.id,
        needRevisionId,
        professionalProfileId: profile.id,
        lifecycle: "ACTIVE",
        analysisStatus: "PROCESSING",
        createdById: admin.id,
        operationKey: randomUUID(),
        operationFingerprint: `b5-dispatch-dossier-${runId}`,
      },
      select: { id: true },
    });
    await prisma.terraqoEvaluationSource.create({
      data: {
        dossierId: dossier.id,
        worklogRevisionId: revisionId,
        accessKind: "PUBLIC_CV",
        accessSnapshot: { fixture: "b5-staging-dispatch" },
        addedById: admin.id,
      },
      select: { id: true },
    });
    // Use the real queue path: its source hash covers the authorized projection,
    // not just a fixture ID. A fabricated hash is correctly rejected by the worker.
    const operationKey = randomUUID();
    const payload = {
        dossierId: dossier.id,
        purpose: "EVIDENCE_SUMMARY" as const,
        sourceRevisionIds: [revisionId],
        expectedPolicies: [{ sourceRevisionId: revisionId, contentHash, accessKind: "PUBLIC_CV" as const }],
    };
    let job: { id: string };
    if (target.enabled) {
      browser = await chromium.launch({ headless: true });
      context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(new URL("/cuenta", target.origin).toString(), { waitUntil: "networkidle", timeout: 60_000 });
      await page.locator("#email").fill(`b5-dispatch-admin-${runId}@example.invalid`);
      await page.locator("#password").fill(password);
      await Promise.all([
        page.waitForURL((url) => url.origin === target.origin.origin && url.pathname.startsWith("/admin"), { timeout: 60_000 }),
        page.getByRole("button", { name: "Iniciar sesión", exact: true }).click(),
      ]);
      const session = await context.request.get(new URL("/api/auth/session", target.origin).toString());
      assert.equal((await session.json()).user.id, admin.id);
      const endpoint = new URL("/api/v1/analysis-jobs", target.origin).toString();
      assert.equal((await fetch(endpoint, { method: "POST" })).status, 401);
      assert.equal((await fetch(`${endpoint}/${dossier.id}`)).status, 401);
      assert.equal((await fetch(`${endpoint}/${dossier.id}/retry`, { method: "POST" })).status, 401);
      const response = await context.request.post(endpoint, { headers: { "Idempotency-Key": operationKey }, data: payload });
      assert.equal(response.status(), 201, "La API autenticada debe crear y despachar el analisis.");
      job = (await response.json()).data;
      assert.ok(job.id);
      const replay = await context.request.post(endpoint, { headers: { "Idempotency-Key": operationKey }, data: payload });
      assert.equal(replay.status(), 201);
      assert.equal((await replay.json()).data.id, job.id);
      assert.equal(await prisma.terraqoAnalysisJob.count({ where: { workspaceId: workspace.id } }), 1);
    } else {
    const queued = await analysis.queueEvidenceAnalysisJob({ actorId: admin.id, workspaceId: workspace.id, operationKey, payload });
    job = queued.job;
    assert.equal(queued.dispatchRequired, true);
    assert.equal(queued.job.maxAttempts, 1);
    assert.equal(queued.job.status, "QUEUED");

    const dispatchResponse = await fetch(
      new URL("/.netlify/functions/evidence-analysis-background", target.origin),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${target.dispatchSecret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ jobId: job.id }),
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      },
    );
    assert.equal(dispatchResponse.status, 202, "Netlify no acepto el background worker B5.");
    }

    const terminal = await waitForTerminalJob(async () => {
      const current = await prisma.terraqoAnalysisJob.findUniqueOrThrow({
        where: { id: job.id },
        select: { status: true, failureCode: true },
      });
      return current;
    });
    assert.ok(
      ["READY", "INSUFFICIENT"].includes(terminal.status),
      `El worker termino en ${terminal.status}/${terminal.failureCode ?? "sin-codigo"}.`,
    );

    const stored = await prisma.terraqoAnalysisJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(stored.provider, target.provider);
    assert.equal(stored.attemptCount, 1);
    assert.ok(stored.model);
    assert.ok(stored.completedAt);
    assert.ok(stored.latencyMs !== null && stored.latencyMs >= 0);

    const visible = await analysis.getEvidenceAnalysisJob({
      actorId: admin.id,
      workspaceId: workspace.id,
      jobId: job.id,
    });
    assert.equal(visible.status, terminal.status);
    if (context) {
      const response = await context.request.get(new URL(`/api/v1/analysis-jobs/${job.id}`, target.origin).toString());
      assert.equal(response.status(), 200);
      assert.equal((await response.json()).data.status, terminal.status);
      // Move only the synthetic actor to another synthetic company. The existing
      // authenticated session must not keep authority over the previous company.
      const control = await prisma.terraqoWorkspace.create({ data: {
        name: `B5 isolation ${runId}`, slug: `b5-isolation-${runId}`, ownerUserId: admin.id,
        members: { create: { userId: admin.id, role: "OWNER", active: true, joinedAt: new Date() } },
      }, select: { id: true } });
      controlWorkspaceId = control.id;
      await prisma.terraqoWorkspaceMember.updateMany({ where: { workspaceId: workspace.id, userId: admin.id }, data: { active: false } });
      await prisma.terraqoWorkspace.update({ where: { id: workspace.id }, data: { ownerUserId: professional.id } });
      const denied = await context.request.get(new URL(`/api/v1/analysis-jobs/${job.id}`, target.origin).toString());
      assert.ok([403, 404].includes(denied.status()), "Otra empresa no debe leer el analisis.");
    }
    assert.equal(visible.sources.length, 1);
    assert.ok(visible.sources[0]?.availableFields.includes("summary"));
    if (visible.status === "READY") {
      assert.ok(Array.isArray(visible.claims) && visible.claims.length > 0);
    } else {
      assert.ok(Array.isArray(visible.missing) && visible.missing.length > 0);
    }

    console.log(
      `B5 staging ${target.enabled ? "authenticated API" : "provider/dispatcher"} gate: OK (${visible.status}; ${stored.provider}; tokens ${stored.inputTokens ?? "n/a"}/${stored.outputTokens ?? "n/a"}).`,
    );
  } finally {
    await browser?.close();
    if (controlWorkspaceId) await prisma.terraqoWorkspace.deleteMany({ where: { id: controlWorkspaceId } });
    if (workspaceId) await prisma.terraqoWorkspace.deleteMany({ where: { id: workspaceId } });
    if (professionalProfileId) {
      await prisma.terraqoProfessionalProfile.deleteMany({ where: { id: professionalProfileId } });
    }
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });

    assert.equal(await prisma.terraqoWorkspace.count(), 0);
    assert.equal(await prisma.terraqoAnalysisJob.count(), 0);
    assert.equal(await prisma.user.count(), 0);
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
