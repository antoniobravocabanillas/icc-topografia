import { ConversationHub } from "@/components/terraqo/conversation-hub";
import { getConversationHub } from "@/lib/terraqo/messaging";
import { startConversation } from "@/lib/terraqo/messaging";
import { redirect } from "next/navigation";
import {
  getProfessionalProjects,
  requireProfessionalPortal,
} from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";

export default async function ProfessionalMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string; recipient?: string }>;
}) {
  const { session, memberships, profile } = await requireProfessionalPortal();
  const params = await searchParams;
  if (params.recipient) {
    const conversation = await startConversation({
      actorUserId: session.user.id,
      recipientUserId: params.recipient,
    });
    redirect(`/portal/mensajes?conversation=${conversation.id}`);
  }
  const [data, projects] = await Promise.all([
    getConversationHub(session.user.id, params.conversation),
    getProfessionalProjects(
      profile.id,
      memberships.map((membership) => membership.workspace.id),
    ),
  ]);

  return (
    <div className="min-w-0 space-y-6 py-6 lg:py-8">
      <ConversationHub
        data={data}
        currentUserId={session.user.id}
        basePath="/portal/mensajes"
        projects={projects}
      />
    </div>
  );
}
