import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
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
  assert.deepEqual(target.pilotWorkspaceIds, []);
  assert.equal(process.env.TERRAQO_EVIDENCE_ANALYSIS_V1, "false");
  assert.ok(!target.enabledFlags.includes("TERRAQO_EVIDENCE_ANALYSIS_V1"));
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

  const [{ prisma }, analysis] = await Promise.all([
    import("@/lib/prisma"),
    import("@/lib/terraqo/evidence-analysis"),
  ]);
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const userIds: string[] = [];
  let workspaceId: string | null = null;
  let professionalProfileId: string | null = null;

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
        name: `B5 dispatch ${runId}`,
        slug: `b5-dispatch-${runId}`,
        ownerUserId: admin.id,
        members: {
          create: { userId: admin.id, role: "OWNER", active: true, joinedAt: new Date() },
        },
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
        workspaceId: workspace.id,
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
    const source = await prisma.terraqoEvaluationSource.create({
      data: {
        dossierId: dossier.id,
        worklogRevisionId: revisionId,
        accessKind: "PUBLIC_CV",
        accessSnapshot: { fixture: "b5-staging-dispatch" },
        addedById: admin.id,
      },
      select: { id: true },
    });
    const job = await prisma.terraqoAnalysisJob.create({
      data: {
        workspaceId: workspace.id,
        dossierId: dossier.id,
        purpose: "EVIDENCE_SUMMARY",
        status: "QUEUED",
        policyVersion: analysis.EVIDENCE_ANALYSIS_POLICY_VERSION,
        promptVersion: analysis.EVIDENCE_ANALYSIS_PROMPT_VERSION,
        sourceSetHash: createHash("sha256").update(source.id).digest("hex"),
        cacheKey: createHash("sha256").update(`cache-${runId}`).digest("hex"),
        maxAttempts: 1,
        createdById: admin.id,
        operationKey: randomUUID(),
        operationFingerprint: `b5-dispatch-job-${runId}`,
        sources: {
          create: {
            evaluationSourceId: source.id,
            worklogRevisionId: revisionId,
            contentHash,
            accessKind: "PUBLIC_CV",
          },
        },
      },
      select: { id: true },
    });

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
    assert.equal(visible.sources.length, 1);
    assert.ok(visible.sources[0]?.availableFields.includes("summary"));
    if (visible.status === "READY") {
      assert.ok(Array.isArray(visible.claims) && visible.claims.length > 0);
    } else {
      assert.ok(Array.isArray(visible.missing) && visible.missing.length > 0);
    }

    console.log(
      `B5 staging provider/dispatcher gate: OK (${visible.status}; ${stored.provider}; tokens ${stored.inputTokens ?? "n/a"}/${stored.outputTokens ?? "n/a"}).`,
    );
  } finally {
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
