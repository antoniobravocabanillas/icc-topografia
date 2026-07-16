import { PrivateFilesManager } from "@/components/portal/private-files-manager";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FilesPage() {
  const { session, memberships } = await requireProfessionalPortal();
  const workspaces = memberships.map((membership) => ({ id: membership.workspaceId, name: membership.workspace.brandName || membership.workspace.name }));
  return <div className="min-w-0 space-y-8 py-6 lg:py-8">
    <PortalPageHeading eyebrow="Archivos de trabajo" title="Un espacio para todo lo que produces." description="Guarda archivos de cualquier especialidad y conserva el control sobre quién puede consultarlos." />
    <PrivateFilesManager workspaces={workspaces} userId={session.user.id} />
  </div>;
}
