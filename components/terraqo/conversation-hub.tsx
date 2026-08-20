import Link from "next/link";
import { Building2, Download, MessageSquareText, MoreVertical, Paperclip, Phone, Search, Send, Smile, UserPlus, Video } from "lucide-react";
import type { ConversationHubData } from "@/lib/terraqo/messaging";
import { sendMessageAction, startConversationAction } from "@/lib/terraqo/messaging-actions";
import { createMeetingAction } from "@/lib/terraqo/meet-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/terraqo/user-avatar";

type ConversationHubProps = {
  data: ConversationHubData;
  currentUserId: string;
  basePath: "/portal/mensajes" | "/admin/terraqo/mensajes";
  compactIntro?: boolean;
  projects?: Array<{ id: string; title: string; terraqoWorkspaceId: string | null }>;
};

function otherParticipant(conversation: ConversationHubData["conversations"][number], currentUserId: string) {
  return conversation.participants.find((participant) => participant.userId !== currentUserId)?.user;
}

function participantLabel(conversation: ConversationHubData["conversations"][number], currentUserId: string) {
  const others = conversation.participants.filter((participant) => participant.userId !== currentUserId);
  return conversation.title || others.map((participant) => participant.user.name || participant.user.email).join(", ") || "Conversacion";
}

function conversationAvatar(conversation: ConversationHubData["conversations"][number], currentUserId: string) {
  const other = otherParticipant(conversation, currentUserId);
  return { name: other?.name || participantLabel(conversation, currentUserId), image: other?.image };
}

function formatTime(value?: Date | string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function unreadCount(conversation: ConversationHubData["conversations"][number], currentUserId: string) {
  const ownParticipant = conversation.participants.find((participant) => participant.userId === currentUserId);
  const lastReadAt = ownParticipant?.lastReadAt ? new Date(ownParticipant.lastReadAt).getTime() : 0;
  return conversation.messages.filter((message) => message.senderId !== currentUserId && new Date(message.createdAt).getTime() > lastReadAt).length;
}

export function ConversationHub({ data, currentUserId, basePath, compactIntro, projects = [] }: ConversationHubProps) {
  const startAction = startConversationAction.bind(null, basePath);
  const replyAction = sendMessageAction.bind(null, basePath);
  const meetingAction = createMeetingAction.bind(null, basePath);
  const selected = data.selected;
  const selectedOther = selected ? otherParticipant(selected, currentUserId) : null;
  const selectedWorkspace = selected?.workspace?.name || "Terraqo";
  const selectedHeadline = selectedOther?.terraqoProfessionalProfile?.headline || selectedWorkspace;
  const selectedAvatar = selected ? conversationAvatar(selected, currentUserId) : { name: "Terraqo", image: null };

  return (
    <div className="space-y-6">
      {!compactIntro ? (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">Red profesional</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-[#0e1a26]">Mensajes</h2>
            <p className="mt-2 max-w-2xl text-sm text-[#46576a]">Conversa con profesionales y empresas dentro de espacios de trabajo autorizados.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="inline-flex h-11 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-bold text-[#2f4154] shadow-[0_12px_24px_rgba(15,59,67,0.06)]">
              <Search className="h-4 w-4" /> Buscar
            </button>
            <Link href="/portal/red" className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white shadow-[0_16px_30px_rgba(0,143,135,0.2)]">
              <UserPlus className="h-4 w-4" /> Nueva conexion
            </Link>
          </div>
        </div>
      ) : null}

      <div className="grid min-h-[690px] overflow-hidden rounded-xl border border-[#d8e0ec] bg-white shadow-[0_24px_70px_rgba(10,45,52,0.08)] xl:grid-cols-[390px_minmax(0,1fr)_360px]">
        <aside className="min-w-0 border-b border-[#d8e0ec] bg-white xl:border-b-0 xl:border-r">
          <div className="border-b border-[#d8e0ec] p-5">
            <div className="flex flex-wrap gap-2">
              {["Todos", "No leidos", "Grupos", "Empresas"].map((tab, index) => (
                <button
                  key={tab}
                  type="button"
                  className={`h-10 rounded-lg border px-4 text-sm font-semibold transition ${index === 0 ? "border-primary bg-primary text-white" : "border-[#d8e0ec] bg-white text-[#506773] hover:bg-[#e8eef7]"}`}
                >
                  {tab}
                </button>
              ))}
            </div>
            {data.recipients.length ? (
              <details className="mt-4 rounded-lg border border-[#d8e0ec] bg-[#f3f3f3]">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-[#0e1a26]">Nueva conversacion</summary>
                <div className="max-h-72 space-y-2 overflow-y-auto border-t border-[#d8e0ec] p-3">
                  {data.recipients.map((recipient) => (
                    <form key={recipient.userId} action={startAction} className="min-w-0">
                      <input type="hidden" name="recipientUserId" value={recipient.userId} />
                      <input type="hidden" name="workspaceId" value={recipient.workspaceId} />
                      <button className="flex w-full items-center gap-3 rounded-lg border border-transparent bg-white p-3 text-left transition hover:border-primary/40 hover:bg-primary/5">
                        {recipient.professional ? (
                          <UserAvatar name={recipient.name} image={recipient.image} size="md" />
                        ) : (
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Building2 className="h-4 w-4" /></span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold">{recipient.name}</span>
                          <span className="block truncate text-xs text-[#607083]">{recipient.headline}</span>
                        </span>
                      </button>
                      {projects.some((project) => project.terraqoWorkspaceId === recipient.workspaceId) ? (
                        <select name="projectId" aria-label={`Proyecto para conversar con ${recipient.name}`} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-xs text-[#607083]">
                          <option value="">Conversacion general</option>
                          {projects.filter((project) => project.terraqoWorkspaceId === recipient.workspaceId).map((project) => (
                            <option key={project.id} value={project.id}>{project.title}</option>
                          ))}
                        </select>
                      ) : null}
                    </form>
                  ))}
                </div>
              </details>
            ) : null}
          </div>

          <nav aria-label="Conversaciones" className="max-h-[560px] overflow-y-auto p-3">
            {data.conversations.map((conversation) => {
              const active = selected?.id === conversation.id;
              const lastMessage = conversation.messages.at(-1);
              const avatar = conversationAvatar(conversation, currentUserId);
              const count = unreadCount(conversation, currentUserId);
              const other = otherParticipant(conversation, currentUserId);
              return (
                <Link
                  key={conversation.id}
                  href={`${basePath}?conversation=${conversation.id}`}
                  className={`block rounded-xl border p-4 transition ${active ? "border-primary bg-[#e8eef7] shadow-[0_12px_30px_rgba(0,143,135,0.12)]" : "border-transparent hover:border-[#d8e0ec] hover:bg-[#f3f3f3]"}`}
                >
                  <div className="flex gap-3">
                    <UserAvatar name={avatar.name} image={avatar.image} size="lg" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="block truncate text-sm font-bold text-[#0e1a26]">{participantLabel(conversation, currentUserId)}</span>
                        <span className="shrink-0 text-xs text-[#7b9099]">{formatTime(lastMessage?.createdAt || conversation.updatedAt)}</span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-primary">{other?.terraqoProfessionalProfile?.headline || conversation.workspace?.name || "Terraqo"}</span>
                      <span className="mt-1 flex items-center justify-between gap-2">
                        <span className="block truncate text-xs text-[#607083]">{lastMessage?.body || conversation.project?.title || "Conversacion iniciada"}</span>
                        {count ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">{count}</span> : null}
                      </span>
                    </span>
                  </div>
                </Link>
              );
            })}
            {!data.conversations.length ? (
              <div className="rounded-xl border border-dashed border-[#d8e0ec] p-6 text-center text-sm text-[#607083]">Aun no tienes conversaciones activas.</div>
            ) : null}
          </nav>
        </aside>

        <section className="flex min-h-[690px] min-w-0 flex-col border-b border-[#d8e0ec] xl:border-b-0">
          {selected ? (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8e0ec] bg-white px-6 py-5">
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar {...selectedAvatar} size="lg" />
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-lg font-bold text-[#0e1a26]">{participantLabel(selected, currentUserId)}</h3>
                    <p className="text-xs text-[#607083]">{selectedWorkspace} <span className="text-primary">• Conectado</span></p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {selected.workspaceId && data.meetWorkspaceIds.includes(selected.workspaceId) ? (
                    selected.meetings[0] ? (
                      <Button asChild variant="outline" size="icon" title="Entrar a reunion">
                        <Link href={`/reuniones/${selected.meetings[0].id}?volver=${encodeURIComponent(basePath)}`}><Video className="h-4 w-4" /></Link>
                      </Button>
                    ) : (
                      <form action={meetingAction}>
                        <input type="hidden" name="conversationId" value={selected.id} />
                        <Button type="submit" variant="outline" size="icon" title="Iniciar reunion"><Video className="h-4 w-4" /></Button>
                      </form>
                    )
                  ) : null}
                  <Button type="button" variant="outline" size="icon" title="Llamada"><Phone className="h-4 w-4" /></Button>
                  <Button type="button" variant="outline" size="icon" title="Mas opciones"><MoreVertical className="h-4 w-4" /></Button>
                </div>
              </header>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-[#f3f3f3] px-6 py-7">
                {selected.messages.length ? (
                  <>
                    <div className="text-center text-xs font-semibold text-[#7b9099]">Hoy</div>
                    {selected.messages.map((message) => {
                      const mine = message.senderId === currentUserId;
                      return (
                        <article key={message.id} className={`flex items-end gap-3 ${mine ? "justify-end" : "justify-start"}`}>
                          {!mine ? <UserAvatar name={message.sender.name} image={message.sender.image} size="sm" /> : null}
                          <div className={`max-w-[78%] rounded-xl border px-4 py-3 shadow-[0_10px_28px_rgba(10,45,52,0.05)] ${mine ? "border-primary/20 bg-[#e8eef7]" : "border-[#d8e0ec] bg-white"}`}>
                            <div className="mb-1 flex items-center gap-2 text-xs">
                              <span className="font-bold text-primary">{mine ? "Tu" : message.sender.name || "Participante"}</span>
                              <time className="text-[#7b9099]">{formatTime(message.createdAt)}</time>
                            </div>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#0e1a26]">{message.body}</p>
                          </div>
                        </article>
                      );
                    })}
                  </>
                ) : (
                  <div className="grid h-full place-items-center text-center">
                    <div>
                      <MessageSquareText className="mx-auto h-9 w-9 text-primary" />
                      <p className="mt-3 font-display text-xl font-bold text-[#0e1a26]">Inicia la conversacion</p>
                      <p className="mt-1 text-sm text-[#607083]">Escribe el primer mensaje dentro de este espacio seguro.</p>
                    </div>
                  </div>
                )}
              </div>

              <form action={replyAction} className="border-t border-[#d8e0ec] bg-white p-5">
                <input type="hidden" name="conversationId" value={selected.id} />
                <div className="flex min-w-0 items-end gap-3">
                  <button type="button" className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-[#d8e0ec] text-[#46576a]" title="Adjuntar archivo"><Paperclip className="h-5 w-5" /></button>
                  <Textarea name="body" required maxLength={4000} rows={1} placeholder="Escribe un mensaje..." className="min-h-12 resize-none rounded-lg" />
                  <button type="button" className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-[#d8e0ec] text-[#46576a]" title="Reaccion"><Smile className="h-5 w-5" /></button>
                  <Button type="submit" className="h-12 w-14 rounded-lg bg-primary" title="Enviar mensaje"><Send className="h-5 w-5" /></Button>
                </div>
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div><MessageSquareText className="mx-auto h-10 w-10 text-primary" /><h3 className="mt-4 font-display text-xl font-bold">Tu red empieza con una conversacion</h3><p className="mt-2 max-w-md text-sm text-muted-foreground">Selecciona un profesional o miembro autorizado del workspace. Nadie fuera del espacio puede acceder.</p></div>
            </div>
          )}
        </section>

        <aside className="min-w-0 bg-white p-6">
          {selected ? (
            <div className="space-y-7">
              <div>
                <p className="font-display text-lg font-bold text-[#0e1a26]">Informacion del contacto</p>
                <div className="mt-5 flex items-center gap-4">
                  <UserAvatar {...selectedAvatar} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-[#0e1a26]">{participantLabel(selected, currentUserId)}</p>
                    <p className="truncate text-sm text-[#607083]">{selectedWorkspace}</p>
                    <p className="mt-1 text-xs text-primary">Conectado</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-[#46576a]">{selectedHeadline || "Contacto autorizado dentro del espacio profesional Terraqo."}</p>
              </div>
              <div className="border-t border-[#d8e0ec] pt-6">
                <p className="mb-3 font-bold text-[#0e1a26]">Datos de contacto</p>
                <p className="text-sm text-[#46576a]">{selectedOther?.email || "Correo no visible"}</p>
                <p className="mt-2 text-sm text-[#46576a]">{selected.project?.title || selectedWorkspace}</p>
              </div>
              <div className="border-t border-[#d8e0ec] pt-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="font-bold text-[#0e1a26]">Archivos compartidos</p>
                  <button type="button" className="text-sm font-bold text-primary">Ver todos</button>
                </div>
                {["Levantamiento_sector_A.dwg", "Plano_referencia.pdf", "Informe_topografico.docx"].map((file, index) => (
                  <div key={file} className="flex items-center justify-between gap-3 border-b border-[#edf3f2] py-3 last:border-b-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#0e1a26]">{file}</p>
                      <p className="text-xs text-[#7b9099]">{index + 1}.{index + 8} MB</p>
                    </div>
                    <Download className="h-4 w-4 shrink-0 text-primary" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#d8e0ec] p-6 text-sm text-[#607083]">Selecciona una conversacion para ver el contexto del contacto, archivos y proyectos en comun.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
