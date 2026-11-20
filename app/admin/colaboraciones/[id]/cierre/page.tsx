import { notFound } from "next/navigation";
import { ClosurePanel } from "@/components/terraqo/closure-panel";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { requireDiscoveryWorkspaceActor } from "@/lib/server/discovery-needs-auth";
import { listCollaborations } from "@/lib/terraqo/collaboration";
import { DiscoveryNeedsError } from "@/lib/terraqo/discovery-needs";
import { hasWorkspaceModule } from "@/lib/terraqo/workspace-scope";

export const dynamic = "force-dynamic";

export default async function WorkspaceClosurePage({ params }: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage(["ADMIN", "SUPER_ADMIN"]);
  if (process.env.TERRAQO_COLLABORATION_V1 !== "true" || process.env.TERRAQO_CLOSURE_V1 !== "true") notFound();
  const { session, workspace } = await requireDiscoveryWorkspaceActor().catch((error: unknown) => {
    if (error instanceof DiscoveryNeedsError && error.status === 403) notFound();
    throw error;
  });
  if (!workspace?.active || !await hasWorkspaceModule("PROFESSIONAL_MESSAGING", workspace.id)) notFound();
  const { id } = await params;
  // Use the backend's authorized audience projection, never its unscoped internal getter.
  const collaborations = await listCollaborations({ userId: session.user.id, workspaceId: workspace.id, collaborationId: id });
  const collaboration = collaborations.find((item) => item.id === id);
  if (!collaboration || collaboration.acceptedRevisionNo == null) notFound();
  return <ClosurePanel key={id} mode="workspace" collaborationId={id} presentation="dedicated" disclosureEnabled={process.env.TERRAQO_CERTIFICATE_DISCLOSURE_V1 === "true"} />;
}
