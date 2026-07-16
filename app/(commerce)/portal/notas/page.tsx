import { PrivateNotesManager } from "@/components/portal/private-notes-manager";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NotesPage() {
  const { memberships } = await requireProfessionalPortal();
  const workspaces = memberships.map((membership) => ({ id: membership.workspaceId, name: membership.workspace.brandName || membership.workspace.name }));
  return <div className="min-w-0 space-y-8 py-6 lg:py-8">
    <PortalPageHeading eyebrow="Notas personales" title="Captura lo importante. Protege lo sensible." description="Organiza recordatorios, decisiones e información privada. Usa la bóveda cifrada cuando el contenido requiera una capa adicional de protección." />
    <PrivateNotesManager workspaces={workspaces} />
  </div>;
}
