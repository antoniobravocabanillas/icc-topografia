"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Building2,
  CheckCheck,
  Download,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  MessageSquareText,
  Mic,
  Paperclip,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Square,
  UserRound,
  Video,
  X,
} from "lucide-react";
import type { ConversationHubData } from "@/lib/terraqo/messaging";
import { createMeetingAction } from "@/lib/terraqo/meet-actions";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/terraqo/user-avatar";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import {
  ComposerEmojiPicker,
  WritingAssistantTrigger,
  composerToolClass,
} from "@/components/terraqo/composer-tools";
import styles from "./conversation-hub.module.css";

type Conversation = ConversationHubData["conversations"][number];
type Message = Conversation["messages"][number];
type Attachment = Message["attachmentItems"][number];
type Filter = "all" | "unread" | "groups" | "companies";
type DetailTab = "chat" | "files" | "profile";

type ConversationHubProps = {
  data: ConversationHubData;
  currentUserId: string;
  basePath: "/portal/mensajes" | "/admin/terraqo/mensajes";
  compactIntro?: boolean;
  projects?: Array<{
    id: string;
    title: string;
    terraqoWorkspaceId: string | null;
  }>;
};

function otherParticipant(conversation: Conversation, currentUserId: string) {
  return conversation.participants.find(
    (participant) => participant.userId !== currentUserId,
  )?.user;
}
function participantLabel(conversation: Conversation, currentUserId: string) {
  const others = conversation.participants.filter(
    (participant) => participant.userId !== currentUserId,
  );
  return (
    conversation.title ||
    others
      .map((participant) => participant.user.name || participant.user.email)
      .join(", ") ||
    "Conversación"
  );
}
function conversationAvatar(conversation: Conversation, currentUserId: string) {
  const other = otherParticipant(conversation, currentUserId);
  return {
    name: other?.name || participantLabel(conversation, currentUserId),
    image: other?.image,
  };
}
function formatTime(value?: Date | string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
function formatDate(value?: Date | string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
function unreadCount(conversation: Conversation, currentUserId: string) {
  const own = conversation.participants.find(
    (participant) => participant.userId === currentUserId,
  );
  const lastRead = own?.lastReadAt ? new Date(own.lastReadAt).getTime() : 0;
  return conversation.messages.filter(
    (message) =>
      message.senderId !== currentUserId &&
      new Date(message.createdAt).getTime() > lastRead,
  ).length;
}
function attachmentLabel(message: Message) {
  const first = message.attachmentItems[0];
  if (!first) return message.body || "Conversación iniciada";
  if (first.kind === "AUDIO") return "Mensaje de voz";
  if (first.kind === "IMAGE") return "Imagen compartida";
  return first.fileName;
}
function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function ConversationHub(props: ConversationHubProps) {
  // Never carry an attachment or pending recording to a different recipient.
  return (
    <ConversationWorkspace
      key={props.data.selected?.id || "inbox"}
      {...props}
    />
  );
}

function ConversationWorkspace({
  data,
  currentUserId,
  basePath,
  compactIntro,
}: ConversationHubProps) {
  const router = useRouter();
  const selected = data.selected;
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [detailTab, setDetailTab] = useState<DetailTab>("chat");
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [recipientQuery, setRecipientQuery] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [durationMs, setDurationMs] = useState(0);
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStartedRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const mountedRef = useRef(true);
  const acquiringRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [contactOpen, setContactOpen] = useState(true);
  const [showConversation, setShowConversation] = useState(Boolean(selected));
  const newMessageRef = useRef<HTMLDialogElement>(null);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const [imagePreview, setImagePreview] = useState("");
  useEffect(() => {
    if (newMessageOpen) newMessageRef.current?.showModal();
    else newMessageRef.current?.close();
  }, [newMessageOpen]);
  useEffect(() => {
    if (!file?.type.startsWith("image/")) {
      setImagePreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
      if (recorderRef.current?.state === "recording")
        recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );
  useEffect(() => {
    const list = messagesRef.current;
    if (list && detailTab === "chat") list.scrollTop = list.scrollHeight;
  }, [selected?.id, selected?.messages.length, detailTab]);

  function selectFile(next: File | null) {
    if (!next) return;
    if (next.size > 20 * 1024 * 1024) {
      setError("El archivo supera los 20 MB. Selecciona uno más pequeño.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }
    clearAttachment();
    setError("");
    setFile(next);
  }

  function insertEmoji(emoji: string) {
    const field = composerRef.current;
    if (!field) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const next = body.slice(0, start) + emoji + body.slice(end);
    if (next.length > 4000)
      return setError("El mensaje admite hasta 4000 caracteres.");
    setBody(next);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  const conversations = useMemo(
    () =>
      data.conversations.filter((conversation) => {
        const text =
          `${participantLabel(conversation, currentUserId)} ${conversation.messages.at(-1)?.body || ""}`.toLowerCase();
        if (query && !text.includes(query.toLowerCase())) return false;
        if (filter === "unread" && !unreadCount(conversation, currentUserId))
          return false;
        if (filter === "groups" && conversation.type !== "GROUP") return false;
        if (filter === "companies" && conversation.type !== "COMPANY")
          return false;
        return true;
      }),
    [currentUserId, data.conversations, filter, query],
  );

  const selectedOther = selected
    ? otherParticipant(selected, currentUserId)
    : null;
  const selectedAvatar = selected
    ? conversationAvatar(selected, currentUserId)
    : { name: "Terraqo", image: null };
  const online = Boolean(
    selectedOther?.onlineUntil &&
    new Date(selectedOther.onlineUntil) > new Date(),
  );
  const allAttachments =
    selected?.messages.flatMap((message) =>
      message.attachmentItems.map((attachment) => ({
        ...attachment,
        sender: message.sender,
        sentAt: message.createdAt,
      })),
    ) || [];
  const otherReadAt = selected?.participants.find(
    (participant) => participant.userId !== currentUserId,
  )?.lastReadAt;

  async function startConversation(
    recipientUserId: string,
    workspaceId?: string,
  ) {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setError("");
    try {
      const response = await fetch("/api/terraqo/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "start",
          recipientUserId,
          workspaceId: workspaceId || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        return setError(
          payload?.error?.message || "No pudimos iniciar la conversación.",
        );
      setNewMessageOpen(false);
      router.push(`${basePath}?conversation=${payload.data.id}`);
      router.refresh();
    } catch {
      setError(
        "No se pudo conectar. Revisa tu conexión y vuelve a iniciar la conversación.",
      );
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  function clearAttachment() {
    setFile(null);
    setDurationMs(0);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (!selected || sendingRef.current || recording || (!body.trim() && !file))
      return;
    sendingRef.current = true;
    setSending(true);
    setError("");
    try {
      const response = file
        ? await fetch("/api/terraqo/messages/attachments", {
            method: "POST",
            body: (() => {
              const form = new FormData();
              form.set("conversationId", selected.id);
              form.set("body", body);
              form.set("file", file);
              if (durationMs) form.set("durationMs", String(durationMs));
              return form;
            })(),
          })
        : await fetch("/api/terraqo/messages", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "send",
              conversationId: selected.id,
              body,
            }),
          });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload?.error?.message || "No pudimos enviar el mensaje.",
        );
      setBody("");
      clearAttachment();
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos enviar el mensaje.",
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function toggleRecording() {
    if (sendingRef.current || acquiringRef.current) return;
    if (recording) {
      if (recorderRef.current?.state === "recording")
        recorderRef.current.stop();
      return;
    }
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
      return setError(
        "La grabación de audio no está disponible en este navegador.",
      );
    try {
      acquiringRef.current = true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
        "audio/webm",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      clearAttachment();
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
        if (!mountedRef.current) return;
        const blob = new Blob(chunks, {
          type: recorder.mimeType || "audio/webm",
        });
        const extension = blob.type.includes("ogg")
          ? "ogg"
          : blob.type.includes("mp4")
            ? "m4a"
            : "webm";
        const audio = new File(
          [blob],
          `audio-terraqo-${Date.now()}.${extension}`,
          { type: blob.type },
        );
        if (audio.size > 20 * 1024 * 1024) {
          setRecording(false);
          setError("El audio supera los 20 MB. Graba uno más corto.");
          return;
        }
        setFile(audio);
        setAudioUrl(URL.createObjectURL(blob));
        setDurationMs(Date.now() - recordingStartedRef.current);
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
      };
      recorderRef.current = recorder;
      recordingStartedRef.current = Date.now();
      recorder.start(250);
      recordingTimerRef.current = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 180_000);
      setRecording(true);
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setError(
        "Necesitamos permiso para usar el micrófono. Puedes habilitarlo desde el navegador.",
      );
    } finally {
      acquiringRef.current = false;
    }
  }

  function handleComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <div className="space-y-5">
      {!compactIntro ? (
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="mt-2 font-display text-3xl font-bold">Mensajes</h2>
            <p className="mt-1 text-sm text-slate-500">
              Comunicación privada con personas y equipos autorizados.
            </p>
          </div>
          <button
            onClick={() => setNewMessageOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0b6f68] px-4 text-sm font-bold text-white"
          >
            <Plus className="h-4 w-4" />
            Nuevo mensaje
          </button>
        </header>
      ) : null}

      <div data-contact-open={contactOpen} className={styles.workspace}>
        <aside
          className={`${selected && showConversation ? "max-lg:hidden" : ""} flex min-h-0 min-w-0 flex-col border-r bg-white`}
        >
          <div className="border-b p-4">
            <div className="flex flex-wrap gap-1.5 pb-1">
              {(
                [
                  ["all", "Todos"],
                  ["unread", "No leídos"],
                  ["groups", "Grupos"],
                  ["companies", "Empresas"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={`min-h-11 shrink-0 rounded-xl px-3 text-xs font-bold ${filter === value ? "bg-[#0b6f68] text-white" : "border bg-white text-slate-600"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="relative mt-3 block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                aria-label="Buscar conversaciones"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar conversaciones"
                className="h-10 w-full rounded-xl border bg-slate-50 pl-9 pr-3 text-xs"
              />
            </label>
            <button
              onClick={() => setNewMessageOpen(true)}
              className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed text-xs font-bold text-[#315f9f]"
            >
              <Plus className="h-4 w-4" />
              Nueva conversación
            </button>
          </div>
          <nav
            aria-label="Conversaciones"
            className="min-h-0 flex-1 overflow-y-auto p-2"
          >
            {conversations.map((conversation) => {
              const active = selected?.id === conversation.id;
              const last = conversation.messages.at(-1);
              const avatar = conversationAvatar(conversation, currentUserId);
              const count = unreadCount(conversation, currentUserId);
              return (
                <Link
                  key={conversation.id}
                  href={`${basePath}?conversation=${conversation.id}`}
                  onClick={() => setShowConversation(true)}
                  aria-current={active ? "page" : undefined}
                  className={`mb-1 flex gap-3 rounded-2xl p-3 transition ${active ? "bg-[#e9f6f5]" : "hover:bg-slate-50"}`}
                >
                  <div className="relative">
                    <UserAvatar {...avatar} size="lg" />
                    {otherParticipant(conversation, currentUserId)
                      ?.onlineUntil &&
                    new Date(
                      otherParticipant(conversation, currentUserId)!
                        .onlineUntil!,
                    ) > new Date() ? (
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
                    ) : null}
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="flex justify-between gap-2">
                      <b className="truncate text-sm">
                        {participantLabel(conversation, currentUserId)}
                      </b>
                      <small className="shrink-0 text-[10px] text-slate-400">
                        {formatTime(last?.createdAt || conversation.updatedAt)}
                      </small>
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2">
                      <small className="truncate text-slate-500">
                        {last
                          ? attachmentLabel(last)
                          : conversation.project?.title ||
                            "Conversación iniciada"}
                      </small>
                      {count ? (
                        <i className="grid h-5 min-w-5 place-items-center rounded-full bg-[#0b6f68] px-1 text-[10px] font-bold not-italic text-white">
                          {count}
                        </i>
                      ) : null}
                    </span>
                  </span>
                </Link>
              );
            })}
            {!conversations.length ? (
              <p className="p-8 text-center text-xs text-slate-500">
                No hay conversaciones con este filtro.
              </p>
            ) : null}
          </nav>
        </aside>

        <section
          className={`${!selected || !showConversation ? "max-lg:hidden" : ""} flex min-h-0 min-w-0 flex-col bg-[#f7f9fb]`}
        >
          {selected ? (
            <>
              <header className="flex min-h-[76px] items-center justify-between gap-3 border-b bg-white px-4 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowConversation(false)}
                    aria-label="Volver a conversaciones"
                    className="grid h-11 w-11 shrink-0 place-items-center lg:hidden"
                  >
                    ←
                  </button>
                  <UserAvatar {...selectedAvatar} size="md" />
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold">
                      {participantLabel(selected, currentUserId)}
                    </h3>
                    <p className="truncate text-[11px] text-slate-500">
                      {selected.workspace?.name ||
                        selectedOther?.terraqoProfessionalProfile?.headline ||
                        "Red personal"}{" "}
                      ·{" "}
                      <span className={online ? "text-emerald-600" : ""}>
                        {online ? "En línea" : "Disponible por mensaje"}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selected.workspaceId &&
                  data.meetWorkspaceIds.includes(selected.workspaceId) ? (
                    selected.meetings[0] ? (
                      <Button asChild variant="outline" size="icon">
                        <Link
                          href={`/reuniones/${selected.meetings[0].id}?volver=${encodeURIComponent(basePath)}`}
                          title="Entrar a videollamada"
                        >
                          <Video className="h-4 w-4" />
                        </Link>
                      </Button>
                    ) : (
                      <form action={createMeetingAction.bind(null, basePath)}>
                        <input
                          type="hidden"
                          name="conversationId"
                          value={selected.id}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          title="Iniciar videollamada"
                        >
                          <Video className="h-4 w-4" />
                        </Button>
                      </form>
                    )
                  ) : null}
                  <button
                    onClick={() => {
                      if (window.matchMedia("(min-width: 1536px)").matches)
                        setContactOpen(!contactOpen);
                      else
                        setDetailTab(
                          detailTab === "profile" ? "chat" : "profile",
                        );
                    }}
                    className="grid h-11 w-11 place-items-center rounded-xl border"
                    aria-label="Información del contacto"
                    title="Información"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                  </button>
                </div>
              </header>
              <div className="flex border-b bg-white px-4">
                {(
                  [
                    ["chat", "Chat"],
                    [
                      "files",
                      `Archivos ${allAttachments.length ? `(${allAttachments.length})` : ""}`,
                    ],
                    ["profile", "Perfil"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={detailTab === value}
                    onClick={() => setDetailTab(value)}
                    className={`relative min-h-11 px-4 text-xs font-bold ${detailTab === value ? "text-[#0b6f68]" : "text-slate-500"}`}
                  >
                    {label}
                    {detailTab === value ? (
                      <span className="absolute inset-x-3 bottom-0 h-0.5 bg-[#0b6f68]" />
                    ) : null}
                  </button>
                ))}
              </div>

              {detailTab === "chat" ? (
                <>
                  <div
                    ref={messagesRef}
                    aria-label="Historial de mensajes"
                    className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-6"
                  >
                    <div className="text-center">
                      <span className="rounded-full bg-white px-3 py-1 text-[10px] font-semibold text-slate-500 shadow-sm">
                        Conversación privada
                      </span>
                    </div>
                    {selected.messages.map((message) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        mine={message.senderId === currentUserId}
                        read={Boolean(
                          message.senderId === currentUserId &&
                          otherReadAt &&
                          new Date(otherReadAt) >= new Date(message.createdAt),
                        )}
                      />
                    ))}
                    {!selected.messages.length ? (
                      <div className="grid h-full place-items-center text-center">
                        <div>
                          <MessageSquareText className="mx-auto h-9 w-9 text-[#0b6f68]" />
                          <b className="mt-3 block">Inicia la conversación</b>
                          <p className="mt-1 text-xs text-slate-500">
                            Este espacio solo es visible para sus participantes.
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <form
                    onSubmit={send}
                    className="border-t bg-white p-3 sm:p-4"
                  >
                    {file ? (
                      <div className="mb-3 flex items-center gap-3 rounded-2xl border bg-slate-50 p-3">
                        {audioUrl ? (
                          <audio
                            src={audioUrl}
                            controls
                            className="h-9 min-w-0 flex-1"
                          />
                        ) : imagePreview ? (
                          <Image
                            src={imagePreview}
                            alt="Vista previa del adjunto"
                            width={56}
                            height={56}
                            unoptimized
                            className="h-14 w-14 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <FileText className="h-5 w-5 text-[#4374ba]" />
                        )}
                        <span className="min-w-0 flex-1">
                          <b className="block truncate text-xs">{file.name}</b>
                          <small className="text-slate-500">
                            {formatBytes(file.size)}
                          </small>
                        </span>
                        <button
                          type="button"
                          disabled={sending}
                          aria-label="Quitar adjunto"
                          className={composerToolClass}
                          onClick={clearAttachment}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                    <div className={styles.composer}>
                      <AutoGrowTextarea
                        ref={composerRef}
                        name="message"
                        data-ai-writing="manual"
                        aria-label="Escribe un mensaje"
                        disabled={sending}
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        onKeyDown={handleComposerKey}
                        rows={2}
                        maxLength={4000}
                        placeholder="Escribe un mensaje…"
                        className="border-0 bg-transparent px-2 py-2 text-slate-900 placeholder:text-slate-500 focus-visible:outline-none"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                        <div className="flex gap-1">
                          <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,audio/*"
                            disabled={sending || recording}
                            onChange={(event) =>
                              selectFile(event.target.files?.[0] || null)
                            }
                          />
                          <input
                            ref={imageInputRef}
                            type="file"
                            className="hidden"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={sending || recording}
                            onChange={(event) =>
                              selectFile(event.target.files?.[0] || null)
                            }
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className={composerToolClass}
                            disabled={sending || recording}
                            aria-label="Adjuntar archivo"
                            title="Adjuntar archivo"
                          >
                            <Paperclip className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={sending || recording}
                            className={composerToolClass}
                            aria-label="Adjuntar imagen"
                            title="Adjuntar imagen"
                            onClick={() => imageInputRef.current?.click()}
                          >
                            <ImageIcon className="h-5 w-5" />
                          </button>
                          <ComposerEmojiPicker
                            disabled={sending}
                            onSelect={insertEmoji}
                          />
                          <WritingAssistantTrigger
                            disabled={sending || recording}
                            field={composerRef}
                          />
                          <button
                            type="button"
                            onClick={toggleRecording}
                            className={`${composerToolClass} ${recording ? "bg-rose-50 text-rose-700" : ""}`}
                            disabled={sending}
                            aria-label={
                              recording ? "Detener grabación" : "Grabar audio"
                            }
                            title={
                              recording ? "Detener grabación" : "Grabar audio"
                            }
                          >
                            {recording ? (
                              <Square className="h-4 w-4 fill-current" />
                            ) : (
                              <Mic className="h-4 w-4" />
                            )}
                          </button>
                          {recording ? (
                            <span
                              role="status"
                              className="self-center text-xs font-bold text-rose-700"
                            >
                              Grabando…
                            </span>
                          ) : null}
                        </div>
                        <button
                          disabled={
                            sending || recording || (!body.trim() && !file)
                          }
                          className="ml-auto inline-flex h-11 items-center gap-2 rounded-xl bg-[#0b6f68] px-4 text-sm font-bold text-white disabled:opacity-45"
                        >
                          <Send className="h-4 w-4" />
                          {sending ? "Enviando…" : "Enviar"}
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Enter para enviar · Shift + Enter para nueva línea ·
                      máximo 20 MB
                    </p>
                    {error ? (
                      <p
                        role="alert"
                        className="mt-2 text-sm font-medium text-rose-700"
                      >
                        {error}
                      </p>
                    ) : null}
                  </form>
                </>
              ) : null}

              {detailTab === "files" ? (
                <FilesPanel attachments={allAttachments} />
              ) : null}
              {detailTab === "profile" ? (
                <ContactPanel
                  conversation={selected}
                  currentUserId={currentUserId}
                  attachments={allAttachments}
                />
              ) : null}
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div>
                <MessageSquareText className="mx-auto h-10 w-10 text-[#0b6f68]" />
                <h3 className="mt-4 font-display text-xl font-bold">
                  Una conversación puede abrir un proyecto
                </h3>
                <p className="mt-2 max-w-sm text-sm text-slate-500">
                  Elige un contacto o inicia un nuevo mensaje desde tu red
                  autorizada.
                </p>
                <button
                  onClick={() => setNewMessageOpen(true)}
                  className="mt-5 rounded-xl bg-[#0b6f68] px-4 py-2.5 text-xs font-bold text-white"
                >
                  Nuevo mensaje
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="hidden min-w-0 border-l bg-white p-5 2xl:block">
          {selected ? (
            <ContactPanel
              conversation={selected}
              currentUserId={currentUserId}
              attachments={allAttachments}
              compact
            />
          ) : (
            <p className="rounded-2xl border border-dashed p-5 text-xs text-slate-500">
              Selecciona una conversación para ver su contexto.
            </p>
          )}
        </aside>
      </div>

      {newMessageOpen ? (
        <dialog
          ref={newMessageRef}
          aria-label="Nuevo mensaje"
          onCancel={() => setNewMessageOpen(false)}
          className="m-auto max-h-[86dvh] w-[calc(100%-24px)] max-w-lg rounded-2xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/40"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setNewMessageOpen(false);
          }}
        >
          <section className="max-h-[86dvh] w-full max-w-lg overflow-hidden rounded-[24px] bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b p-4">
              <div>
                <h3 className="font-display text-lg font-bold">
                  Nuevo mensaje
                </h3>
                <p className="text-xs text-slate-500">
                  Amigos y contactos de workspaces autorizados
                </p>
              </div>
              <button
                aria-label="Cerrar nuevo mensaje"
                onClick={() => setNewMessageOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-xl border"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="p-4">
              <label className="relative block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  aria-label="Buscar persona o empresa"
                  value={recipientQuery}
                  onChange={(event) => setRecipientQuery(event.target.value)}
                  autoFocus
                  placeholder="Buscar persona o empresa"
                  className="h-11 w-full rounded-xl border bg-slate-50 pl-9 pr-3 text-sm"
                />
              </label>
              {error ? (
                <p className="mt-2 text-xs text-rose-600">{error}</p>
              ) : null}
              <div className="mt-3 max-h-[58dvh] space-y-1 overflow-y-auto">
                {data.recipients
                  .filter((recipient) =>
                    `${recipient.name} ${recipient.headline}`
                      .toLowerCase()
                      .includes(recipientQuery.toLowerCase()),
                  )
                  .map((recipient) => (
                    <button
                      disabled={starting}
                      key={`${recipient.userId}:${recipient.workspaceId}`}
                      onClick={() =>
                        startConversation(
                          recipient.userId,
                          recipient.workspaceId,
                        )
                      }
                      className="flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:bg-slate-50"
                    >
                      {recipient.professional ? (
                        <UserAvatar
                          name={recipient.name}
                          image={recipient.image}
                          size="md"
                        />
                      ) : (
                        <span className="grid h-10 w-10 place-items-center rounded-full bg-[#e9f6f5] text-[#0b6f68]">
                          <Building2 className="h-4 w-4" />
                        </span>
                      )}
                      <span className="min-w-0">
                        <b className="block truncate text-sm">
                          {recipient.name}
                        </b>
                        <small className="block truncate text-slate-500">
                          {recipient.headline} · {recipient.workspaceName}
                        </small>
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          </section>
        </dialog>
      ) : null}
    </div>
  );
}

function MessageBubble({
  message,
  mine,
  read,
}: {
  message: Message;
  mine: boolean;
  read: boolean;
}) {
  return (
    <article
      className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}
    >
      {!mine ? (
        <UserAvatar
          name={message.sender.name}
          image={message.sender.image}
          size="sm"
        />
      ) : null}
      <div
        className={`min-w-0 max-w-[86%] rounded-2xl px-3.5 py-2.5 sm:max-w-[80%] ${mine ? "rounded-br-md bg-[#e0f2ef] text-[#163b39]" : "rounded-bl-md border bg-white text-slate-800"}`}
      >
        {message.body ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">
            {message.body}
          </p>
        ) : null}
        {message.attachmentItems.map((attachment) => (
          <MessageAttachment
            key={attachment.id}
            attachment={attachment}
            mine={mine}
          />
        ))}
        <div className="mt-1.5 flex items-center justify-end gap-1 text-xs text-slate-600">
          <time>{formatTime(message.createdAt)}</time>
          {mine ? (
            <CheckCheck
              aria-label={read ? "Leído" : "Enviado"}
              className={`h-3.5 w-3.5 ${read ? "text-teal-700" : ""}`}
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}

function MessageAttachment({
  attachment,
  mine,
}: {
  attachment: Attachment;
  mine: boolean;
}) {
  if (attachment.kind === "AUDIO")
    return <AudioMessage attachment={attachment} mine={mine} />;
  if (attachment.kind === "IMAGE")
    return (
      <a
        href={`/api/terraqo/messages/attachments/${attachment.id}`}
        target="_blank"
        rel="noreferrer"
        className="mt-2 block overflow-hidden rounded-xl"
      >
        <Image
          src={`/api/terraqo/messages/attachments/${attachment.id}`}
          alt={attachment.fileName}
          width={640}
          height={480}
          unoptimized
          className="max-h-72 w-full object-cover"
        />
      </a>
    );
  return (
    <a
      href={`/api/terraqo/messages/attachments/${attachment.id}`}
      className={`mt-2 flex items-center gap-3 rounded-xl border p-3 ${mine ? "border-white/20 bg-white/10" : "bg-slate-50"}`}
    >
      <FileText className="h-5 w-5 shrink-0" />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-xs">{attachment.fileName}</b>
        <small className="text-slate-600">{formatBytes(attachment.size)}</small>
      </span>
      <Download className="h-4 w-4" />
    </a>
  );
}

function AudioMessage({
  attachment,
  mine,
}: {
  attachment: Attachment;
  mine: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [rate, setRate] = useState(1);
  function changeRate() {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }
  return (
    <div
      className={`mt-1 flex w-full min-w-0 flex-wrap items-center gap-2 rounded-xl p-2 ${mine ? "bg-white/40" : "bg-slate-50"}`}
    >
      <audio
        ref={audioRef}
        src={`/api/terraqo/messages/attachments/${attachment.id}`}
        preload="metadata"
        controls
        aria-label="Mensaje de voz"
        className="h-10 min-w-0 max-w-full flex-1"
      />
      <button
        type="button"
        onClick={changeRate}
        aria-label={`Velocidad de audio ${rate} por. Cambiar velocidad`}
        className="h-11 min-w-11 rounded-lg bg-white px-2 text-sm font-semibold text-teal-800"
      >
        {rate}×
      </button>
    </div>
  );
}

function FilesPanel({
  attachments,
}: {
  attachments: Array<
    Attachment & { sender: Message["sender"]; sentAt: Date | string }
  >;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <div className="mb-4">
        <h3 className="font-display text-lg font-bold">Archivos compartidos</h3>
        <p className="text-xs text-slate-500">
          Solo los participantes pueden abrirlos.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {attachments.map((attachment) => (
          <a
            key={attachment.id}
            href={`/api/terraqo/messages/attachments/${attachment.id}`}
            className="flex items-center gap-3 rounded-2xl border bg-white p-4 hover:border-[#0b6f68]/40"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e9f6f5] text-[#0b6f68]">
              {attachment.kind === "AUDIO" ? (
                <Mic className="h-4 w-4" />
              ) : attachment.kind === "IMAGE" ? (
                <ImageIcon className="h-4 w-4" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-xs">{attachment.fileName}</b>
              <small className="text-slate-500">
                {formatBytes(attachment.size)} · {formatDate(attachment.sentAt)}
              </small>
            </span>
            <Download className="h-4 w-4 text-slate-400" />
          </a>
        ))}
        {!attachments.length ? (
          <div className="col-span-full grid place-items-center rounded-2xl border border-dashed p-10 text-center">
            <FolderOpen className="h-7 w-7 text-slate-300" />
            <p className="mt-2 text-xs text-slate-500">
              Aún no compartieron archivos.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ContactPanel({
  conversation,
  currentUserId,
  attachments,
  compact = false,
}: {
  conversation: Conversation;
  currentUserId: string;
  attachments: Array<
    Attachment & { sender: Message["sender"]; sentAt: Date | string }
  >;
  compact?: boolean;
}) {
  const person = otherParticipant(conversation, currentUserId);
  const profile = person?.terraqoProfessionalProfile;
  const avatar = conversationAvatar(conversation, currentUserId);
  const online = Boolean(
    person?.onlineUntil && new Date(person.onlineUntil) > new Date(),
  );
  return (
    <div
      className={`space-y-5 ${compact ? "" : "min-h-0 flex-1 overflow-y-auto p-5"}`}
    >
      <section className="pb-4">
        <h3 className="text-sm font-bold">Información del contacto</h3>
        <div className="mt-4 flex items-center gap-3">
          <UserAvatar {...avatar} size="lg" />
          <span className="min-w-0">
            <b className="block truncate text-sm">
              {participantLabel(conversation, currentUserId)}
            </b>
            <small className="block truncate text-slate-500">
              {profile?.headline || conversation.workspace?.name || "Terraqo"}
            </small>
            <i
              className={`mt-1 block text-[10px] not-italic ${online ? "text-emerald-600" : "text-slate-400"}`}
            >
              {online ? "En línea" : "Fuera de línea"}
            </i>
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {profile?.id ? (
            <Link
              href={`/profesionales/${profile.id}`}
              className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl border text-[10px] font-bold"
            >
              <UserRound className="h-3.5 w-3.5" />
              Perfil
            </Link>
          ) : null}
          {conversation.workspace?.slug ? (
            <Link
              href={`/empresas/${conversation.workspace.slug}`}
              className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl border text-[10px] font-bold"
            >
              <Building2 className="h-3.5 w-3.5" />
              Empresa
            </Link>
          ) : null}
        </div>
      </section>
      <details open className="border-t pt-4">
        <summary className="min-h-11 cursor-pointer text-sm font-bold">
          Contexto profesional
        </summary>
        <div className="mt-3 space-y-2 text-xs text-slate-500">
          <p>Contacto habilitado dentro de Terraqo</p>
          {profile?.locationCity || profile?.city ? (
            <p>{profile.locationCity || profile.city}</p>
          ) : null}
          {conversation.project?.title ? (
            <p>Proyecto: {conversation.project.title}</p>
          ) : null}
          {profile?.identityVerificationStatus === "VERIFIED" ? (
            <p className="inline-flex items-center gap-1 text-emerald-700">
              <BadgeCheck className="h-3.5 w-3.5" />
              Identidad verificada
            </p>
          ) : null}
        </div>
      </details>
      <details open className="border-t pt-4">
        <summary className="min-h-11 cursor-pointer text-sm font-bold">
          Archivos compartidos ·{" "}
          <span className="text-xs font-bold text-[#0b6f68]">
            {attachments.length}
          </span>
        </summary>
        <div className="mt-3 space-y-2">
          {attachments
            .slice(-4)
            .reverse()
            .map((item) => (
              <a
                key={item.id}
                href={`/api/terraqo/messages/attachments/${item.id}`}
                className="flex items-center gap-2 text-xs"
              >
                <FileText className="h-4 w-4 text-[#0b6f68]" />
                <span className="min-w-0 flex-1 truncate">{item.fileName}</span>
                <Download className="h-3.5 w-3.5" />
              </a>
            ))}
          {!attachments.length ? (
            <p className="text-xs text-slate-500">Sin archivos compartidos.</p>
          ) : null}
        </div>
      </details>
      <section className="border-t pt-4 text-xs text-slate-500">
        <div className="flex justify-between">
          <span>Tipo</span>
          <b className="text-slate-700">
            {conversation.type === "DIRECT" ? "1 a 1" : conversation.type}
          </b>
        </div>
        <div className="mt-2 flex justify-between">
          <span>Creada</span>
          <b className="text-slate-700">{formatDate(conversation.createdAt)}</b>
        </div>
      </section>
    </div>
  );
}
