import Link from "next/link";
import { Prisma, Role } from "@prisma/client";
import { MessageCircle, Trash2, UserRoundCheck } from "lucide-react";
import { AdminChatReplyForm } from "@/components/admin/chat/admin-chat-reply-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import {
  assignChatProfileAction,
  closeChatConversationAction,
  deleteChatConversationAction,
  sendAdminChatMessageAction,
  takeChatConversationAction
} from "@/lib/server/admin-actions";
import { canManageAdmin, requireAdminPage } from "@/lib/server/admin-page-auth";

const statusLabels = {
  WAITING: "Esperando respuesta",
  ACTIVE: "En linea",
  CLOSED: "Cerrada"
};

type StaffTools = {
  whatsappTemplate?: string;
  checklist?: string[];
  nextSteps?: string[];
};

type ChatConversationWithDetails = Prisma.ChatConversationGetPayload<{
  include: {
    assignedTo: true;
    assignedProfile: true;
    messages: true;
  };
}>;

type StaffProfileItem = Prisma.StaffProfileGetPayload<Record<string, never>>;

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminChatPage() {
  const session = await requireAdminPage(["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SUPPORT"]);
  const role = session.user.role as Role;
  const canManage = canManageAdmin(role);
  const currentProfile = await prisma.staffProfile.findUnique({
    where: { userId: session.user.id }
  });
  const conversationWhere = canManage
    ? {}
    : currentProfile
      ? { OR: [{ assignedProfileId: currentProfile.id }, { assignedToId: session.user.id }] }
      : { id: "__no_profile__" };

  let conversations: ChatConversationWithDetails[];
  let profiles: StaffProfileItem[];

  try {
    [conversations, profiles] = await Promise.all([
      prisma.chatConversation.findMany({
        where: conversationWhere,
        include: {
          assignedTo: true,
          assignedProfile: true,
          messages: { orderBy: { createdAt: "asc" } }
        },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        take: 80
      }),
      canManage
        ? prisma.staffProfile.findMany({
            where: { active: true },
            orderBy: [{ department: "asc" }, { displayName: "asc" }]
          })
        : Promise.resolve([])
    ]);
  } catch (error) {
    console.error("Admin chat load failed", error);
    return (
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase text-primary">Atencion comercial</p>
          <h1 className="font-display text-3xl font-bold">Chat en linea</h1>
        </div>
        <Card>
          <CardContent className="p-8">
            <p className="font-semibold">No se pudo cargar el chat administrativo.</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              La pagina ya no se cae completa. Revisa que Netlify use la base de ICC con `schema=icc` y que la ultima migracion este aplicada.
            </p>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-8">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-sm font-semibold uppercase text-primary">Atencion comercial</p>
          <h1 className="font-display text-3xl font-bold">Chat en linea</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Toma conversaciones iniciadas desde el front, asigna el perfil correcto segun el tema y responde en vivo.
          </p>
        </div>
        {canManage ? (
          <Button asChild variant="outline">
            <Link href="/admin/equipo">Gestionar perfiles</Link>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="grid gap-5">
          {conversations.length ? conversations.map((conversation) => {
            const takeAction = takeChatConversationAction.bind(null, conversation.id);
            const closeAction = closeChatConversationAction.bind(null, conversation.id);
            const deleteAction = deleteChatConversationAction.bind(null, conversation.id);
            const replyAction = sendAdminChatMessageAction.bind(null, conversation.id);
            const assignAction = assignChatProfileAction.bind(null, conversation.id);
            const hasAdminReply = conversation.messages.some((message) => message.sender === "admin");
            const canReply = canManage || conversation.assignedProfileId === currentProfile?.id || conversation.assignedToId === session.user.id;

            return (
              <Card key={conversation.id}>
                <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle>{conversation.customerName}</CardTitle>
                    <CardDescription>
                      {[conversation.customerEmail, conversation.customerPhone].filter(Boolean).join(" | ") || "Sin datos adicionales"}
                    </CardDescription>
                    {conversation.topic ? <p className="mt-2 text-xs font-semibold uppercase text-primary">{conversation.topic}</p> : null}
                  </div>
                  <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                    <Badge variant={conversation.status === "ACTIVE" ? "accent" : "outline"}>
                      {statusLabels[conversation.status]}
                    </Badge>
                    {conversation.assignedProfile ? (
                      <Badge variant="secondary">{conversation.assignedProfile.displayName}</Badge>
                    ) : conversation.assignedTo ? (
                      <Badge variant="secondary">{conversation.assignedTo.name || conversation.assignedTo.email}</Badge>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {canManage ? (
                    <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 lg:grid-cols-[1fr_auto]">
                      <form action={assignAction} className="grid gap-2 md:grid-cols-[1fr_auto]">
                        <select name="profileId" defaultValue={conversation.assignedProfileId || ""} className="h-11 rounded-md border bg-background px-3 text-sm">
                          <option value="">Sin perfil asignado</option>
                          {profiles.map((profile) => (
                            <option key={profile.id} value={profile.id}>
                              {profile.displayName} - {profile.roleTitle}
                            </option>
                          ))}
                        </select>
                        <Button type="submit" variant="outline">
                          <UserRoundCheck className="h-4 w-4" />
                          Asignar perfil
                        </Button>
                      </form>
                      <form action={takeAction}>
                        <Button type="submit" variant="secondary">
                          <MessageCircle className="h-4 w-4" />
                          Tomar chat
                        </Button>
                      </form>
                    </div>
                  ) : null}

                  <div className="max-h-[360px] space-y-3 overflow-auto rounded-lg border bg-muted/30 p-4">
                    {conversation.messages.map((message) => (
                      <div key={message.id} className={message.sender === "admin" ? "ml-auto max-w-[78%] rounded-lg bg-primary p-3 text-primary-foreground" : "max-w-[78%] rounded-lg bg-background p-3"}>
                        <p className="text-xs font-semibold uppercase opacity-70">{message.sender === "admin" ? conversation.assignedProfile?.displayName || "Admin" : "Cliente"}</p>
                        <p className="mt-1 whitespace-pre-line text-sm leading-6">{message.body}</p>
                        <p className="mt-2 text-[11px] opacity-60">{message.createdAt.toLocaleString("es-PE")}</p>
                      </div>
                    ))}
                  </div>

                  {!hasAdminReply && conversation.status !== "CLOSED" ? (
                    <p className="rounded-md bg-primary/10 p-3 text-xs font-medium leading-5 text-primary">
                      El cliente ve un aviso de espera. Al responder, el estado cambia a en linea y se muestra el perfil asignado.
                    </p>
                  ) : null}

                  <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                    {canReply ? <AdminChatReplyForm replyAction={replyAction} /> : <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">Este chat no esta asignado a tu perfil.</p>}
                    <div className="flex flex-wrap gap-2">
                      {conversation.status !== "CLOSED" ? (
                        <form action={closeAction}>
                          <Button type="submit" variant="outline">Cerrar</Button>
                        </form>
                      ) : null}
                      {canManage ? (
                        <form action={deleteAction}>
                          <Button type="submit" variant="destructive" size="icon" aria-label="Eliminar conversacion">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          }) : (
          <Card>
            <CardContent className="p-8 text-muted-foreground">
              {canManage ? "Todavia no hay conversaciones iniciadas desde el front." : currentProfile ? "Todavia no tienes chats asignados a tu perfil." : "Tu usuario no tiene un perfil de equipo vinculado. Pide a un administrador que lo vincule en Equipo."}
            </CardContent>
          </Card>
        )}
      </div>

        {canManage ? <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Perfiles disponibles</CardTitle>
              <CardDescription>Vendedores y tecnicos que pueden tomar chats segun especialidad.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {profiles.map((profile) => {
                const tools = (profile.tools || {}) as StaffTools;
                const specialties = Array.isArray(profile.specialties) ? profile.specialties : [];
                return (
                  <div key={profile.id} className="rounded-lg border bg-background p-3">
                    <p className="font-semibold">{profile.displayName}</p>
                    <p className="text-xs text-muted-foreground">{profile.roleTitle}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {specialties.slice(0, 3).map((specialty) => <Badge key={specialty} variant="outline">{specialty}</Badge>)}
                    </div>
                    {tools.nextSteps?.length ? (
                      <p className="mt-3 text-xs leading-5 text-muted-foreground">Siguiente accion: {tools.nextSteps[0]}</p>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </aside> : null}
      </div>
    </section>
  );
}
