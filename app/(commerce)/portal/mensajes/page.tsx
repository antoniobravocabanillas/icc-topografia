import { ConversationHub } from "@/components/terraqo/conversation-hub";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { ProfessionalPortalNav } from "@/components/terraqo/professional-portal-nav";
import { getConversationHub } from "@/lib/terraqo/messaging";
import { getProfessionalProjects, requireProfessionalPortal } from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";

export default async function ProfessionalMessagesPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const { session, memberships, profile } = await requireProfessionalPortal();
  const params = await searchParams;
  const [data, projects] = await Promise.all([
    getConversationHub(session.user.id, params.conversation),
    getProfessionalProjects(profile.id, memberships.map((membership) => membership.workspace.id))
  ]);

  return (
    <main className="min-h-screen bg-[#f4f8f8] py-8">
      <div className="container space-y-6">
        <ProfessionalPortalNav current="/portal/mensajes" />
        <PortalPageHeading eyebrow="Red profesional" title="Mensajes" description="Conversa con profesionales y empresas dentro de espacios de trabajo autorizados." />
        <ConversationHub data={data} currentUserId={session.user.id} basePath="/portal/mensajes" compactIntro projects={projects} />
      </div>
    </main>
  );
}
