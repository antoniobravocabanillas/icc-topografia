import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

function localGateUrl() {
  const value = process.env.B5_GATE_DATABASE_URL?.trim();
  const expected = process.env.B5_GATE_EXPECTED_DATABASE?.trim();
  assert.ok(value && expected, "Define B5_GATE_DATABASE_URL y B5_GATE_EXPECTED_DATABASE.");
  const parsed = new URL(value);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(parsed.hostname), "El gate mutante solo admite PostgreSQL local.");
  assert.equal(decodeURIComponent(parsed.pathname.replace(/^\//, "")), expected);
  assert.match(expected, /(?:gate|test|staging|disposable)/i);
  return value;
}

function localOllamaUrl() {
  const value = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").trim().replace(/\/+$/, "");
  const parsed = new URL(value);
  assert.equal(parsed.protocol, "http:", "El gate local de Ollama debe usar HTTP loopback.");
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(parsed.hostname), "El gate no puede enviar fixtures a un proveedor remoto.");
  return value;
}

async function main() {
  process.env.DATABASE_URL = localGateUrl();
  process.env.OLLAMA_BASE_URL = localOllamaUrl();
  process.env.TERRAQO_EVIDENCE_ANALYSIS_PROVIDER = "ollama";
  process.env.OLLAMA_EVIDENCE_ANALYSIS_MODEL ||= "qwen2.5:7b-instruct";
  process.env.TERRAQO_EVIDENCE_ANALYSIS_TIMEOUT_MS = "90000";
  process.env.TERRAQO_EVIDENCE_ANALYSIS_MAX_OUTPUT_TOKENS = "900";

  const tagsResponse = await fetch(`${process.env.OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(5_000) });
  assert.equal(tagsResponse.ok, true, "Ollama local no está disponible.");
  const tags = await tagsResponse.json() as { models?: Array<{ name?: string }> };
  assert.ok(tags.models?.some((item) => item.name === process.env.OLLAMA_EVIDENCE_ANALYSIS_MODEL), "El modelo configurado no está instalado.");

  const [{ prisma }, analysis] = await Promise.all([
    import("@/lib/prisma"),
    import("@/lib/terraqo/evidence-analysis"),
  ]);
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const userIds: string[] = [];
  let workspaceId: string | null = null;
  let professionalProfileId: string | null = null;

  try {
    const [admin, professional] = await Promise.all([
      prisma.user.create({ data: { email: `b5-ollama-admin-${runId}@example.invalid`, name: "B5 Ollama admin", emailVerified: new Date() }, select: { id: true } }),
      prisma.user.create({ data: { email: `b5-ollama-professional-${runId}@example.invalid`, name: "B5 Ollama professional", emailVerified: new Date() }, select: { id: true } }),
    ]);
    userIds.push(admin.id, professional.id);
    const workspace = await prisma.terraqoWorkspace.create({
      data: {
        name: `B5 Ollama ${runId}`,
        slug: `b5-ollama-${runId}`,
        ownerUserId: admin.id,
        members: { create: { userId: admin.id, role: "OWNER", active: true, joinedAt: new Date() } },
      },
      select: { id: true },
    });
    workspaceId = workspace.id;
    const profile = await prisma.terraqoProfessionalProfile.create({
      data: { userId: professional.id, username: `b5-ollama-${runId}`, visibility: "PUBLIC", liveCvEnabled: true, liveCvVisibility: "PUBLIC" },
      select: { id: true },
    });
    professionalProfileId = profile.id;

    const summary = "Se replantearon ejes A y B con estación total antes del vaciado de concreto.";
    const contentHash = createHash("sha256").update(summary).digest("hex");
    const worklog = await prisma.terraqoWorklogEntry.create({
      data: {
        professionalProfileId: profile.id,
        authorId: professional.id,
        workspaceId: workspace.id,
        title: "Replanteo sintético de ejes",
        summary,
        outcome: "Ejes A y B señalizados para revisión.",
        lifecycle: "PUBLISHED",
        visibility: "PUBLIC",
        locationLabel: "Ubicación sintética",
        revisions: {
          create: {
            revisionNo: 1,
            title: "Replanteo sintético de ejes",
            summary,
            outcome: "Ejes A y B señalizados para revisión.",
            contributionRole: "Apoyo topográfico",
            responsibilities: ["Replanteo de ejes A y B"],
            methods: ["Radiación"],
            tools: ["Estación total"],
            contentHash,
            createdById: professional.id,
          },
        },
      },
      include: { revisions: { select: { id: true } } },
    });
    const revisionId = worklog.revisions[0]?.id;
    assert.ok(revisionId);
    await prisma.terraqoWorklogEntry.update({ where: { id: worklog.id }, data: { currentRevisionId: revisionId } });

    const need = await prisma.terraqoWorkNeed.create({
      data: {
        workspaceId: workspace.id,
        createdById: admin.id,
        operationKey: randomUUID(),
        operationFingerprint: `b5-ollama-need-${runId}`,
        revisions: {
          create: {
            revisionNo: 1,
            title: "Control topográfico de obra",
            problem: "Se requiere evidencia de replanteo antes del vaciado.",
            activities: ["Replanteo"],
            requiredTools: ["Estación total"],
            endorsementNeeded: false,
            contentHash: createHash("sha256").update(`need-${runId}`).digest("hex"),
            createdById: admin.id,
            operationKey: randomUUID(),
            operationFingerprint: `b5-ollama-need-revision-${runId}`,
            requirements: { create: { label: "Evidencia de replanteo", priority: "REQUIRED", sortOrder: 0 } },
          },
        },
      },
      include: { revisions: { select: { id: true } } },
    });
    const needRevisionId = need.revisions[0]?.id;
    assert.ok(needRevisionId);
    await prisma.terraqoWorkNeed.update({ where: { id: need.id }, data: { currentRevisionId: needRevisionId } });

    const dossier = await prisma.terraqoEvaluationDossier.create({
      data: {
        workspaceId: workspace.id,
        needRevisionId,
        professionalProfileId: profile.id,
        lifecycle: "ACTIVE",
        analysisStatus: "PROCESSING",
        createdById: admin.id,
        operationKey: randomUUID(),
        operationFingerprint: `b5-ollama-dossier-${runId}`,
      },
      select: { id: true },
    });
    const source = await prisma.terraqoEvaluationSource.create({
      data: {
        dossierId: dossier.id,
        worklogRevisionId: revisionId,
        accessKind: "PUBLIC_CV",
        accessSnapshot: { fixture: "b5-local-ollama" },
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
        operationFingerprint: `b5-ollama-job-${runId}`,
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

    await analysis.processEvidenceAnalysisJob(job.id);
    const result = await prisma.terraqoAnalysisJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.ok(["READY", "INSUFFICIENT"].includes(result.status), `Estado inesperado: ${result.status}/${result.failureCode}`);
    assert.equal(result.provider, "ollama");
    assert.equal(result.model, process.env.OLLAMA_EVIDENCE_ANALYSIS_MODEL);
    assert.equal(result.attemptCount, 1);
    assert.ok(result.completedAt);
    if (result.status === "READY") assert.ok(Array.isArray(result.claims) && result.claims.length > 0);
    if (result.status === "INSUFFICIENT") assert.ok(Array.isArray(result.missing) && result.missing.length > 0);

    console.log(`B5 Ollama provider gate: OK (${result.status}; tokens ${result.inputTokens ?? "n/a"}/${result.outputTokens ?? "n/a"}).`);
  } finally {
    if (workspaceId) await prisma.terraqoWorkspace.deleteMany({ where: { id: workspaceId } });
    if (professionalProfileId) await prisma.terraqoProfessionalProfile.deleteMany({ where: { id: professionalProfileId } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
