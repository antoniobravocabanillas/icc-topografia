import { ConversationHub } from "@/components/terraqo/conversation-hub";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getConversationHub } from "@/lib/terraqo/messaging";
import { getWorkspaceForUser } from "@/lib/terraqo/workspace-access";

export const dynamic = "force-dynamic";

export default async function WorkspaceMessagesPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const session = await requireAdminPage(["ADMIN", "SUPER_ADMIN"]);
  const params = await searchParams;
  const workspace = await getWorkspaceForUser(session.user.id, session.user.role as Role);
  const [data, projects] = await Promise.all([
    getConversationHub(session.user.id, params.conversation, workspace?.id),
    workspace ? prisma.project.findMany({
      where: { terraqoWorkspaceId: workspace.id, deletedAt: null },
      select: { id: true, title: true, terraqoWorkspaceId: true },
      orderBy: { updatedAt: "desc" }
    }) : []
  ]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Red Terraqo</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Mensajeria del workspace</h1>
        <p className="mt-2 text-muted-foreground">Conecta al equipo de {workspace?.name || "la empresa"} con profesionales autorizados sin mezclar conversaciones de otros clientes.</p>
      </header>
      <ConversationHub data={data} currentUserId={session.user.id} basePath="/admin/terraqo/mensajes" compactIntro projects={projects} />
    </div>
  );
}
