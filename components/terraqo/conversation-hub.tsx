import Link from "next/link";
import { Building2, MessageSquareText, Send, UserRound, Video } from "lucide-react";
import type { ConversationHubData } from "@/lib/terraqo/messaging";
import { sendMessageAction, startConversationAction } from "@/lib/terraqo/messaging-actions";
import { createMeetingAction } from "@/lib/terraqo/meet-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ConversationHubProps = {
  data: ConversationHubData;
  currentUserId: string;
  basePath: "/portal/mensajes" | "/admin/terraqo/mensajes";
  compactIntro?: boolean;
  projects?: Array<{ id: string; title: string; terraqoWorkspaceId: string | null }>;
};

function participantLabel(conversation: ConversationHubData["conversations"][number], currentUserId: string) {
  const others = conversation.participants.filter((participant) => participant.userId !== currentUserId);
  return conversation.title || others.map((participant) => participant.user.name || participant.user.email).join(", ") || "Conversacion";
}

export function ConversationHub({ data, currentUserId, basePath, compactIntro, projects = [] }: ConversationHubProps) {
  const startAction = startConversationAction.bind(null, basePath);
  const replyAction = sendMessageAction.bind(null, basePath);
  const meetingAction = createMeetingAction.bind(null, basePath);

  return (
    <div className="space-y-6">
      {!compactIntro ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-white p-5 md:col-span-2">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Mensajeria Terraqo</p>
            <h2 className="mt-2 font-display text-2xl font-bold">Conversaciones vinculadas al trabajo real</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Conversa con profesionales y equipos de empresa dentro del contexto autorizado. Las conversaciones permanecen separadas por workspace.</p>
          </div>
          <div className="rounded-lg border bg-[#082f32] p-5 text-white">
            <p className="text-3xl font-bold">{data.conversations.length}</p>
            <p className="mt-1 text-sm text-white/70">conversaciones activas</p>
          </div>
        </div>
      ) : null}

      <div className="grid w-full min-w-0 min-h-[620px] overflow-hidden rounded-lg border bg-white shadow-technical lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="w-full min-w-0 border-b bg-[#f7fbfb] lg:border-b-0 lg:border-r">
          <div className="border-b p-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Nueva conversacion</p>
            {data.recipients.length ? (
              <div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
                {data.recipients.map((recipient) => (
                  <form key={recipient.userId} action={startAction} className="min-w-0">
                    <input type="hidden" name="recipientUserId" value={recipient.userId} />
                    <input type="hidden" name="workspaceId" value={recipient.workspaceId} />
                    <button className="flex w-full items-center gap-3 rounded-md border bg-white p-3 text-left transition hover:border-primary/50 hover:bg-primary/5">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">{recipient.professional ? <UserRound className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{recipient.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{recipient.headline}</span>
                      </span>
                    </button>
                    {projects.some((project) => project.terraqoWorkspaceId === recipient.workspaceId) ? (
                      <select name="projectId" aria-label={`Proyecto para conversar con ${recipient.name}`} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-xs text-muted-foreground">
                        <option value="">Conversacion general</option>
                        {projects.filter((project) => project.terraqoWorkspaceId === recipient.workspaceId).map((project) => (
                          <option key={project.id} value={project.id}>{project.title}</option>
                        ))}
                      </select>
                    ) : null}
                  </form>
                ))}
              </div>
            ) : <p className="mt-3 text-sm text-muted-foreground">No hay participantes habilitados en este workspace.</p>}
          </div>

          <nav aria-label="Conversaciones" className="max-h-[360px] overflow-y-auto p-2">
            {data.conversations.map((conversation) => {
              const active = data.selected?.id === conversation.id;
              const lastMessage = conversation.messages.at(-1);
              return (
                <Link key={conversation.id} href={`${basePath}?conversation=${conversation.id}`} className={`block rounded-md p-3 transition ${active ? "bg-[#063D63] text-white" : "hover:bg-white"}`}>
                  <div className="flex items-center gap-2">
                    <MessageSquareText className="h-4 w-4 shrink-0" />
                    <span className="truncate text-sm font-semibold">{participantLabel(conversation, currentUserId)}</span>
                  </div>
                  <p className={`mt-1 truncate text-xs ${active ? "text-white/70" : "text-muted-foreground"}`}>{lastMessage?.body || conversation.workspace?.name || "Conversacion iniciada"}</p>
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="flex w-full min-w-0 min-h-[620px] flex-col">
          {data.selected ? (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-lg font-bold">{participantLabel(data.selected, currentUserId)}</h3>
                  <p className="text-xs text-muted-foreground">{data.selected.project?.title || data.selected.workspace?.name} | {data.selected.type.toLowerCase()}</p>
                </div>
                {data.selected.workspaceId && data.meetWorkspaceIds.includes(data.selected.workspaceId) ? (
                  data.selected.meetings[0] ? (
                    <Button asChild className="gap-2 bg-[#008f87] hover:bg-[#00766f]">
                      <Link href={`/reuniones/${data.selected.meetings[0].id}?volver=${encodeURIComponent(basePath)}`}><Video className="h-4 w-4" /> Entrar a reunion</Link>
                    </Button>
                  ) : (
                    <form action={meetingAction}>
                      <input type="hidden" name="conversationId" value={data.selected.id} />
                      <Button type="submit" variant="outline" className="gap-2"><Video className="h-4 w-4" /> Iniciar reunion</Button>
                    </form>
                  )
                ) : null}
              </header>
              <div className="flex-1 space-y-3 overflow-y-auto bg-[#fbfdfd] p-5">
                {data.selected.messages.length ? data.selected.messages.map((message) => {
                  const mine = message.senderId === currentUserId;
                  return (
                    <article key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[82%] rounded-lg px-4 py-3 ${mine ? "bg-[#063D63] text-white" : "border bg-white"}`}>
                        {!mine ? <p className="mb-1 text-xs font-semibold text-primary">{message.sender.name || "Participante"}</p> : null}
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
                        <time className={`mt-2 block text-[11px] ${mine ? "text-white/60" : "text-muted-foreground"}`}>{new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short" }).format(message.createdAt)}</time>
                      </div>
                    </article>
                  );
                }) : <div className="grid h-full place-items-center text-center"><div><MessageSquareText className="mx-auto h-8 w-8 text-primary" /><p className="mt-3 font-semibold">Inicia la conversacion</p><p className="mt-1 text-sm text-muted-foreground">Escribe el primer mensaje dentro de este espacio seguro.</p></div></div>}
              </div>
              <form action={replyAction} className="min-w-0 border-t bg-white p-4">
                <input type="hidden" name="conversationId" value={data.selected.id} />
                <div className="flex min-w-0 gap-3">
                  <Textarea name="body" required maxLength={4000} rows={2} placeholder="Escribe un mensaje relacionado con el trabajo o proyecto..." className="min-h-14 resize-none" />
                  <Button type="submit" className="h-auto min-w-14 px-4" title="Enviar mensaje"><Send className="h-5 w-5" /></Button>
                </div>
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div><MessageSquareText className="mx-auto h-10 w-10 text-primary" /><h3 className="mt-4 font-display text-xl font-bold">Tu red empieza con una conversacion</h3><p className="mt-2 max-w-md text-sm text-muted-foreground">Selecciona un profesional o miembro autorizado del workspace. Nadie fuera del espacio puede acceder.</p></div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
