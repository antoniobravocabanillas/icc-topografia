import { notFound } from "next/navigation";
import { DiscoveryNeedsConsole } from "@/components/admin/discovery-needs-console";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { requireDiscoveryWorkspaceActor } from "@/lib/server/discovery-needs-auth";
import { hasConfiguredEvidenceAnalysisDispatch } from "@/lib/server/evidence-analysis-dispatch";
import { hasConfiguredEvidenceAnalysisProvider } from "@/lib/terraqo/evidence-analysis";
import { getWorkspaceProductEntitlements } from "@/lib/terraqo/product-entitlements";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DiscoveryNeedsPage() {
  if (process.env.TERRAQO_DISCOVERY_NEEDS_V1 !== "true") notFound();
  await requireAdminPage(["ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  const { session, workspace } = await requireDiscoveryWorkspaceActor();
  const entitlements = await getWorkspaceProductEntitlements(session.user.id, workspace.id);
  const employerNeeds = entitlements.features.find((item) => item.feature === "employer_needs")!;
  const evidenceAnalysis = entitlements.features.find((item) => item.feature === "evidence_analysis")!;
  const evidenceAnalysisConfigured = hasConfiguredEvidenceAnalysisProvider() && hasConfiguredEvidenceAnalysisDispatch();
  return <DiscoveryNeedsConsole
    contextualMessagingEnabled={process.env.TERRAQO_CONTEXTUAL_MESSAGING_V1 === "true"}
    evidenceAnalysisEnabled={evidenceAnalysis.active && evidenceAnalysisConfigured}
    evidenceAnalysisUnavailableReason={evidenceAnalysis.active && !evidenceAnalysisConfigured ? "La asistencia automática aún no está configurada en este entorno. La evaluación manual continúa disponible." : null}
    employerNeedsEntitlement={{ status: employerNeeds.status, tier: entitlements.plan.tier, limit: employerNeeds.limit, remaining: employerNeeds.remaining }}
  />;
}
