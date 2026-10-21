import "server-only";

import { prisma } from "@/lib/prisma";
import { EvidenceAnalysisError, processEvidenceAnalysisJob } from "@/lib/terraqo/evidence-analysis";

export function hasConfiguredEvidenceAnalysisDispatch() {
  if (process.env.NETLIFY !== "true") return true;
  const secret = process.env.EVIDENCE_ANALYSIS_DISPATCH_SECRET?.trim();
  const siteUrl = (process.env.DEPLOY_PRIME_URL || process.env.URL)?.trim();
  if (!secret || !siteUrl) return false;
  try {
    return new URL(siteUrl).protocol === "https:";
  } catch {
    return false;
  }
}

export async function dispatchEvidenceAnalysisJob(jobId: string) {
  if (process.env.NETLIFY !== "true") {
    await processEvidenceAnalysisJob(jobId);
    return;
  }
  const secret = process.env.EVIDENCE_ANALYSIS_DISPATCH_SECRET?.trim();
  const siteUrl = (process.env.DEPLOY_PRIME_URL || process.env.URL)?.trim();
  if (!secret || !siteUrl) throw new EvidenceAnalysisError("DISPATCH_NOT_CONFIGURED", "El worker de análisis no está configurado.", 503);
  const target = new URL("/.netlify/functions/evidence-analysis-background", siteUrl);
  if (target.protocol !== "https:") throw new EvidenceAnalysisError("DISPATCH_INSECURE", "El worker de análisis requiere HTTPS.", 503);
  const response = await fetch(target, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ jobId }),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 202) throw new EvidenceAnalysisError("DISPATCH_FAILED", "No pudimos iniciar el análisis. Inténtalo nuevamente.", 503);
}

export async function failEvidenceAnalysisDispatch(jobId: string, error: unknown) {
  const code = error instanceof EvidenceAnalysisError ? error.code : "DISPATCH_FAILED";
  await prisma.$transaction(async (tx) => {
    const job = await tx.terraqoAnalysisJob.findUnique({ where: { id: jobId }, select: { dossierId: true, status: true } });
    if (!job || job.status !== "QUEUED") return;
    await tx.terraqoAnalysisJob.update({ where: { id: jobId }, data: { status: "FAILED", failureCode: code, completedAt: new Date() } });
    await tx.terraqoEvaluationDossier.update({ where: { id: job.dossierId }, data: { analysisStatus: "FAILED", analysisFailureCode: code, analysisUpdatedAt: new Date() } });
  });
}
