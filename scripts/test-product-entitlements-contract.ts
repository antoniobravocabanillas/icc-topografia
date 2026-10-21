import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { featureMonthlyLimit, TerraqoEntitlementError } from "@/lib/terraqo/product-entitlements";
import { fail } from "@/lib/server/api";

async function main() {
  process.env.TERRAQO_EMPLOYER_NEEDS_MONTHLY_LIMIT = "17";
  process.env.TERRAQO_EVIDENCE_ANALYSIS_MONTHLY_LIMIT = "41";
  assert.equal(featureMonthlyLimit("employer_needs"), 17);
  assert.equal(featureMonthlyLimit("evidence_analysis"), 41);
  assert.equal(featureMonthlyLimit("collaboration_closure"), null);

  const limited = new TerraqoEntitlementError("FEATURE_LIMIT_REACHED", "Límite", 429, 3600);
  assert.equal(limited.status, 429);
  assert.equal(limited.retryAfterSeconds, 3600);
  const limitedResponse = fail(limited.message, limited.status, { code: limited.code, retryAfterSeconds: limited.retryAfterSeconds });
  assert.equal(limitedResponse.headers.get("Retry-After"), "3600");

  const root = process.cwd();
  const source = (path: string) => readFile(join(root, path), "utf8");
  const [service, needsRoute, discoveryRoute, dossierRoute, analysisRoute, analysisRetryRoute, analysisDomain, needsPage] = await Promise.all([
    source("lib/terraqo/product-entitlements.ts"),
    source("app/api/v1/work-needs/route.ts"),
    source("app/api/v1/work-needs/[id]/discover/route.ts"),
    source("app/api/v1/evaluation-dossiers/route.ts"),
    source("app/api/v1/analysis-jobs/route.ts"),
    source("app/api/v1/analysis-jobs/[id]/retry/route.ts"),
    source("lib/terraqo/evidence-analysis.ts"),
    source("app/admin/necesidades/page.tsx"),
  ]);

  assert.match(service, /mode:"live"|effectivePlan/, "La proyección debe partir del plan efectivo servidor.");
  assert.match(service, /readPreserved: true/);
  assert.match(service, /TERRAQO_B5_PILOT_WORKSPACE_IDS/);
  assert.match(needsRoute, /requireWorkspacePilotFeature\(session\.user\.id, workspace\.id, "employer_needs"\)/);
  assert.match(discoveryRoute, /requireWorkspacePilotFeature/);
  assert.match(dossierRoute, /requireWorkspacePilotFeature/);
  assert.match(analysisRoute, /requireWorkspacePilotFeature\(session\.user\.id, workspace\.id, "evidence_analysis"\)/);
  assert.match(analysisRetryRoute, /requireWorkspacePilotFeature\(session\.user\.id, workspace\.id, "evidence_analysis"\)/, "Los reintentos también consumen capacidad del piloto vigente.");
  assert.match(analysisDomain, /FOR UPDATE/);
  const queueDomain = analysisDomain.slice(analysisDomain.indexOf("export async function queueEvidenceAnalysisJob"));
  assert.ok(queueDomain.indexOf("const replay =") < queueDomain.indexOf("FEATURE_LIMIT_REACHED"), "Un replay idempotente no debe consumir un uso adicional.");
  assert.ok(queueDomain.indexOf("const replay =") < queueDomain.indexOf("PROVIDER_NOT_CONFIGURED"), "Un replay idempotente debe poder consultar su job aunque el proveedor haya sido desactivado.");
  assert.match(needsPage, /hasConfiguredEvidenceAnalysisProvider\(\) && hasConfiguredEvidenceAnalysisDispatch\(\)/, "La interfaz no debe ofrecer análisis sin proveedor y dispatcher operativos.");
  assert.match(needsPage, /evidenceAnalysis\.active && evidenceAnalysisConfigured/, "El entitlement y la disponibilidad técnica deben comprobarse por separado.");

  const employerMutationRoutes = [
    "app/api/v1/work-needs/[id]/revisions/route.ts",
    "app/api/v1/evaluation-dossiers/[id]/assessments/route.ts",
    "app/api/v1/evaluation-dossiers/[id]/notes/route.ts",
    "app/api/v1/evaluation-dossiers/[id]/questions/route.ts",
    "app/api/v1/conversation-requests/route.ts",
  ];
  for (const path of employerMutationRoutes) {
    assert.match(await source(path), /requireWorkspacePilotFeature\(session\.user\.id, workspace\.id, "employer_needs"\)/, `${path} debe aplicar el entitlement empresarial.`);
  }

  const collaborationMutationRoutes = [
    "app/api/v1/collaborations/route.ts",
    "app/api/v1/collaborations/[id]/proposals/route.ts",
    "app/api/v1/collaborations/[id]/closures/route.ts",
    "app/api/v1/collaborations/[id]/closures/submit/route.ts",
  ];
  for (const path of collaborationMutationRoutes) {
    assert.match(await source(path), /requireWorkspacePilotFeature\(session\.user\.id, workspace\.id, "collaboration_closure"\)/, `${path} debe aplicar el entitlement de colaboración.`);
  }

  const professionalDecisionRoutes = [
    "app/api/v1/conversation-requests/[id]/decision/route.ts",
    "app/api/v1/collaborations/[id]/decision/route.ts",
    "app/api/v1/closures/[id]/decision/route.ts",
  ];
  for (const path of professionalDecisionRoutes) {
    assert.doesNotMatch(await source(path), /requireWorkspacePilotFeature/, `${path} debe permitir resolver una decisión profesional pendiente.`);
  }

  console.log("T20 product entitlement contract: OK");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
