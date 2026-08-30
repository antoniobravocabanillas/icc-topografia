"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MessageSquare, Search, Send, X } from "lucide-react";
import { UserAvatar } from "@/components/terraqo/user-avatar";

type Person = {
  id: string;
  name?: string | null;
  email?: string;
  image?: string | null;
  terraqoProfessionalProfile?: { headline?: string | null } | null;
};
type Conversation = {
  id: string;
  title?: string | null;
  updatedAt: string;
  participants: Array<{
    userId: string;
    lastReadAt?: string | null;
    user: Person;
  }>;
  messages: Array<{
    id: string;
    senderId: string;
    body: string;
    createdAt: string;
    sender: Person;
    attachmentItems: Array<{
      id: string;
      fileName: string;
      contentType: string;
      size: number;
      kind: string;
    }>;
  }>;
};
type Hub = { conversations: Conversation[]; selected: Conversation | null };

function other(conversation: Conversation, userId: string) {
  return conversation.participants.find((item) => item.userId !== userId)?.user;
}

export function MessageDrawer({ currentUserId }: { currentUserId: string }) {
  const [open, setOpen] = useState(false);
  const [hub, setHub] = useState<Hub | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async (id?: string) => {
    const response = await fetch(
      `/api/terraqo/messages${id ? `?conversation=${id}` : ""}`,
      { cache: "no-store" },
    );
    const payload = await response.json();
    if (!response.ok)
      throw new Error(
        payload?.error?.message || "No pudimos cargar tus mensajes.",
      );
    setHub(payload.data);
    setSelectedId(id);
  }, []);
  useEffect(() => {
    if (open && !hub) load().catch((cause) => setError(cause.message));
  }, [hub, load, open]);
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId?: string }>).detail;
      setOpen(true);
      if (detail?.conversationId)
        load(detail.conversationId).catch((cause) => setError(cause.message));
    };
    window.addEventListener("terraqo:open-messages", handler);
    return () => window.removeEventListener("terraqo:open-messages", handler);
  }, [load]);
  const conversations = useMemo(
    () =>
      (hub?.conversations || []).filter((conversation) => {
        const person = other(conversation, currentUserId);
        return `${person?.name || ""} ${conversation.messages.at(-1)?.body || ""}`
          .toLowerCase()
          .includes(query.toLowerCase());
      }),
    [currentUserId, hub, query],
  );
  const selected =
    hub?.conversations.find((item) => item.id === selectedId) || null;
  const selectedPerson = selected ? other(selected, currentUserId) : null;
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/terraqo/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "send",
          conversationId: selected.id,
          body: data.get("body"),
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload?.error?.message || "No pudimos enviar el mensaje.",
        );
      form.reset();
      await load(selected.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos enviar el mensaje.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 top-1/2 z-40 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-[#4374ba] text-white shadow-[0_16px_36px_rgba(67,116,186,0.35)] md:right-5"
        aria-label="Abrir mensajes"
      >
        <MessageSquare className="h-5 w-5" />
      </button>
      {open ? (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[65] cursor-default bg-slate-950/20 backdrop-blur-[1px]"
          aria-label="Cerrar mensajes"
        />
      ) : null}
      <div
        className={`fixed inset-y-0 right-0 z-[70] w-full max-w-[390px] border-l bg-white shadow-[-24px_0_70px_rgba(14,26,38,0.18)] transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
        aria-hidden={!open}
      >
        <header className="flex h-16 items-center justify-between border-b px-4">
          <h2 className="font-display text-xl font-bold">Mensajes</h2>
          <button
            onClick={() => setOpen(false)}
            className="grid h-9 w-9 place-items-center rounded-lg border"
            aria-label="Cerrar mensajes"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="grid h-[calc(100dvh-4rem)] grid-rows-[auto_1fr] p-3">
          <label className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar conversación"
              className="h-10 w-full rounded-xl border bg-slate-50 pl-9 pr-3 text-sm"
            />
          </label>
          {selected ? (
            <div className="grid min-h-0 grid-rows-[auto_1fr_auto]">
              <button
                onClick={() => setSelectedId(undefined)}
                className="flex items-center gap-3 border-b pb-3 text-left"
              >
                <UserAvatar
                  name={selectedPerson?.name}
                  image={selectedPerson?.image}
                  size="sm"
                />
                <span>
                  <b className="block text-sm">
                    {selectedPerson?.name || "Conversación"}
                  </b>
                  <small className="text-slate-500">
                    {selectedPerson?.terraqoProfessionalProfile?.headline ||
                      "Terraqo"}
                  </small>
                </span>
              </button>
              <div className="min-h-0 space-y-3 overflow-y-auto py-4">
                {selected.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.senderId === currentUserId ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm ${message.senderId === currentUserId ? "bg-[#4374ba] text-white" : "bg-slate-100 text-slate-800"}`}
                    >
                      {message.body ? <p>{message.body}</p> : null}
                      {message.attachmentItems?.map((attachment) =>
                        attachment.kind === "AUDIO" ? (
                          <DrawerAudio key={attachment.id} id={attachment.id} />
                        ) : (
                          <a
                            key={attachment.id}
                            href={`/api/terraqo/messages/attachments/${attachment.id}`}
                            className="mt-2 block max-w-56 truncate rounded-lg border border-current/20 px-2 py-1.5 text-xs font-bold"
                          >
                            {attachment.fileName}
                          </a>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={send} className="flex gap-2 border-t pt-3">
                <input
                  name="body"
                  required
                  maxLength={4000}
                  placeholder="Escribe un mensaje..."
                  className="h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm"
                />
                <button
                  disabled={busy}
                  className="grid h-11 w-11 place-items-center rounded-xl bg-[#4374ba] text-white"
                  aria-label="Enviar"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          ) : (
            <div className="min-h-0 overflow-y-auto">
              {conversations.map((conversation) => {
                const person = other(conversation, currentUserId);
                return (
                  <button
                    key={conversation.id}
                    onClick={() => {
                      setSelectedId(conversation.id);
                      load(conversation.id).catch((cause) =>
                        setError(cause.message),
                      );
                    }}
                    className="flex w-full items-center gap-3 border-b px-1 py-3 text-left"
                  >
                    <UserAvatar
                      name={person?.name}
                      image={person?.image}
                      size="md"
                    />
                    <span className="min-w-0">
                      <b className="block truncate text-sm">
                        {person?.name || "Conversación"}
                      </b>
                      <small className="block truncate text-slate-500">
                        {conversation.messages.at(-1)?.body ||
                          "Inicia la conversación"}
                      </small>
                    </span>
                  </button>
                );
              })}
              {!conversations.length ? (
                <p className="p-8 text-center text-sm text-slate-500">
                  Aún no tienes conversaciones.
                </p>
              ) : null}
            </div>
          )}
          {error ? (
            <p className="absolute bottom-20 left-4 right-4 rounded-lg bg-red-50 p-2 text-xs text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}

function DrawerAudio({ id }: { id: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [rate, setRate] = useState(1);
  function cycleRate() {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (ref.current) ref.current.playbackRate = next;
  }
  return (
    <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/15 p-2">
      <audio
        ref={ref}
        src={`/api/terraqo/messages/attachments/${id}`}
        controls
        preload="metadata"
        className="h-8 min-w-0 flex-1"
      />
      <button
        type="button"
        onClick={cycleRate}
        className="rounded-md border border-current/20 px-1.5 py-1 text-[10px] font-bold"
      >
        {rate}×
      </button>
    </div>
  );
}
