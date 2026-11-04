"use client";

import { ChatContinuity } from "@/components/chat/chat-continuity";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { attentionAccentText, attentionContactRule, type AttentionConfig } from "@/lib/terraqo/customer-attention-config";
import { MessageCircle, Send, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/terraqo/user-avatar";
import { useAdaptivePolling } from "@/components/terraqo/use-adaptive-polling";
import { CONVERSATION_POLLING_POLICY } from "@/lib/terraqo/adaptive-polling";
import {
  installTerraqoAudioUnlock,
  playTerraqoAlert,
} from "@/lib/terraqo/alert-sounds";

type ChatMessage = {
  id: string;
  sender: string;
  body: string;
  createdAt: string;
};

type ChatAssignee = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

type ChatProfile = {
  displayName: string;
  roleTitle: string;
  department: string;
  avatar?: string | null;
};

type ChatConversation = {
  hasEarlier?: boolean;
  id: string;
  status: "WAITING" | "ACTIVE" | "CLOSED";
  topic?: string | null;
  assignedTo?: ChatAssignee | null;
  assignedProfile?: ChatProfile | null;
  messages: ChatMessage[];
};

type BotMessage = {
  sender: "customer" | "bot";
  body: string;
};

const legacyStorageKey = "icc-chat-conversation-id";

const topics = [
  "Cotizacion de equipos",
  "Servicio topografico",
  "Soporte tecnico",
  "Alquiler de equipos",
  "Mantenimiento y calibracion",
  "Capacitacion"
];

type PublicPresentation = Omit<AttentionConfig, "domains" | "routing"> & { withinHours: boolean; logoUrl: string | null };
export function ChatWidget({ workspaceSlug, inline = false, initialPresentation = null }: { workspaceSlug?: string; inline?: boolean; initialPresentation?: PublicPresentation | null } = {}) {
  const storageKey = workspaceSlug ? `terraqo-chat:${workspaceSlug}` : legacyStorageKey;
  const query = workspaceSlug ? `?workspace=${encodeURIComponent(workspaceSlug)}` : "";
  const chatUrl = `/api/chat${query}`;
  const botUrl = `/api/chatbot${query}`;
  const [presentation, setPresentation] = useState<PublicPresentation | null>(initialPresentation);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/chat/config${query}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) return;
      const result = await response.json();
      if (result.config) {
        setPresentation(result.config);
        setBotMessages(current => current.length === 1 ? [{ sender: "bot", body: result.config.greeting }] : current);
      }
    }).catch(() => {});
    return () => controller.abort();
  }, [query]);
  const displayName = presentation?.displayName || "Atención Terraqo";
  const contactTopics = presentation?.topics || topics;
  const [selectedTopic, setSelectedTopic] = useState("");
  const activeTopic = contactTopics.includes(selectedTopic) ? selectedTopic : contactTopics[0];
  const contactRule = attentionContactRule(presentation, activeTopic);
  const pathname = usePathname();
  const [open, setOpen] = useState(inline);
  const historyExpanded = useRef(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const accessToken = useRef("");
  const botAccessToken = useRef("");
  const botSubmission = useRef<{ signature: string; key: string } | null>(null);
  const [conversationId, setConversationId] = useState("");
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [systemNotice, setSystemNotice] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [botConversationId, setBotConversationId] = useState("");
  const [botMessages, setBotMessages] = useState<BotMessage[]>([
    {
      sender: "bot",
      body: initialPresentation?.greeting || "Hola. Cuéntanos qué necesitas. Puedo orientarte o comunicarte con un asesor."
    }
  ]);
  const [botInput, setBotInput] = useState("");
  const [showHumanForm, setShowHumanForm] = useState(false);
  const startFormRef = useRef<HTMLFormElement | null>(null);
  const submission = useRef<{ signature: string; key: string } | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const pollRevisionRef = useRef("");
  const latestAdminMessageRef = useRef("");
  const pollInitializedRef = useRef(false);

  const assignedName = conversation?.assignedProfile?.displayName || conversation?.assignedTo?.name || conversation?.assignedTo?.email || "";
  const assignedRole = conversation?.assignedProfile?.roleTitle || "Asesor tecnico";
  const assignedImage = conversation?.assignedProfile?.avatar || conversation?.assignedTo?.image || null;
  const hasAdminReply = Boolean(conversation?.messages.some((message) => message.sender === "admin"));
  const hasResponse = conversation?.status === "ACTIVE" || hasAdminReply;
  const waitingNotice = conversationId && conversation?.status !== "CLOSED" && !hasAdminReply
    ? assignedName
      ? `${assignedName} ya fue asignado a tu solicitud. Puedes volver desde este navegador para consultar la respuesta.`
      : "Solicitud recibida. Puedes cerrar esta ventana y volver desde este navegador para consultar la respuesta."
    : "";

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    accessToken.current = window.localStorage.getItem(`${storageKey}:access`) || "";
    setConversationId(stored || "");
    setConversation(null);
  }, [storageKey]);

  const resetConversation = useCallback((notice?: string) => {
    window.localStorage.removeItem(storageKey);
    window.localStorage.removeItem(`${storageKey}:access`);
    accessToken.current = "";
    historyExpanded.current = false;
    setConversationId("");
    setConversation(null);
    setMessageBody("");
    if (notice) setSystemNotice(notice);
  }, [storageKey]);

  useEffect(() => {
    installTerraqoAudioUnlock();
  }, []);

  useEffect(() => {
    pollRevisionRef.current = "";
    latestAdminMessageRef.current = "";
    pollInitializedRef.current = false;
  }, [conversationId]);

  const loadConversation = useCallback(async (signal: AbortSignal) => {
    if (!conversationId) return false;
    const response = await fetch(`${chatUrl}${query ? "&" : "?"}conversationId=${encodeURIComponent(conversationId)}`, {
      cache: "no-store",
      headers: { "x-chat-access": accessToken.current },
      signal,
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.conversation) {
      const nextConversation = result.conversation as ChatConversation;

      const nextRevision = JSON.stringify([
        nextConversation.status,
        nextConversation.assignedTo?.email || null,
        nextConversation.assignedProfile?.displayName || null,
        nextConversation.messages.map((message) => [
          message.id,
          message.sender,
          message.createdAt,
        ]),
      ]);
      const changed = pollRevisionRef.current !== nextRevision;
      pollRevisionRef.current = nextRevision;

      const latestAdminMessage = nextConversation.messages
        .filter((message) => message.sender === "admin")
        .at(-1)?.id || "";
      if (!pollInitializedRef.current) {
        pollInitializedRef.current = true;
        latestAdminMessageRef.current = latestAdminMessage;
      } else if (
        latestAdminMessage &&
        latestAdminMessage !== latestAdminMessageRef.current
      ) {
        latestAdminMessageRef.current = latestAdminMessage;
        await playTerraqoAlert("message");
      }

      setConversation(current => historyExpanded.current && current?.id === nextConversation.id ? { ...nextConversation, hasEarlier: current.hasEarlier, messages: [...current.messages, ...nextConversation.messages.filter(m => !current.messages.some(old => old.id === m.id))] } : nextConversation);
      return changed;
    }

    if (response.status === 401) { setError("El acceso privado venció o no está disponible. Puedes recuperar la conversación con tu código."); return false; }
    if (response.status === 404) {
      resetConversation("No encontramos la conversacion anterior. Puedes iniciar un nuevo chat.");
      return true;
    }
    return false;
  }, [conversationId, resetConversation, chatUrl, query]);

  useAdaptivePolling(loadConversation, {
    enabled: Boolean(conversationId) && !pathname.startsWith("/portal"),
    policy: CONVERSATION_POLLING_POLICY,
  });

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation?.messages.length, open]);

  function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function loadEarlier() {
    const before = conversation?.messages[0]?.id;
    if (!before || historyLoading) return;
    setHistoryLoading(true);
    try {
      const response = await fetch(`${chatUrl}${query ? "&" : "?"}conversationId=${encodeURIComponent(conversationId)}&before=${encodeURIComponent(before)}`, { cache: "no-store", headers: { "x-chat-access": accessToken.current } });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.conversation) throw new Error();
      historyExpanded.current = true;
      setConversation(current => current ? { ...current, hasEarlier: result.conversation.hasEarlier, messages: [...result.conversation.messages.filter((m: ChatMessage) => !current.messages.some(old => old.id === m.id)), ...current.messages] } : current);
    } catch { setError("No pudimos cargar el historial anterior. Inténtalo de nuevo."); }
    finally { setHistoryLoading(false); }
  }

  async function restoreConversation(id: string, token: string) {
    const response = await fetch(`${chatUrl}${query ? "&" : "?"}conversationId=${encodeURIComponent(id)}`, { cache: "no-store", headers: { "x-chat-access": token } });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.conversation) throw new Error("El código no es válido, venció o pertenece a otra empresa.");
    window.localStorage.setItem(storageKey, id);
    window.localStorage.setItem(`${storageKey}:access`, token);
    historyExpanded.current = false; accessToken.current = token; setConversationId(id); setConversation(result.conversation); setError("");
  }

  async function startConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");
    setSystemNotice("");
    const formData = new FormData(event.currentTarget);
    const signature = JSON.stringify([...formData.entries()]);
    if (!submission.current || submission.current.signature !== signature) submission.current = { signature, key: crypto.randomUUID() };
    formData.set("operationKey", submission.current.key);
    try {
    const response = await fetch(chatUrl, { method: "POST", body: formData, headers: { "x-chat-access": accessToken.current, "x-chat-protocol": "2" } });
    const result = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      setError(result?.error?.message || "No pudimos iniciar el chat. Intentalo nuevamente.");
      return;
    }

    submission.current = null;
    const id = result?.conversationId as string;
    accessToken.current = result.accessToken || "";
    window.localStorage.setItem(`${storageKey}:access`, accessToken.current);
    window.localStorage.setItem(storageKey, id);
    setConversationId(id);
    setConversation(result.conversation);
    startFormRef.current?.reset();
    } catch {
      setError("Sin conexión. Tu mensaje no se confirmó. Revisa el historial antes de reintentar.");
    } finally { setLoading(false); }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!conversationId || loading || !messageBody.trim()) return;

    setLoading(true);
    setError("");
    setSystemNotice("");
    const formData = new FormData();
    formData.set("conversationId", conversationId);
    formData.set("body", messageBody.trim());
    const signature = JSON.stringify([...formData.entries()]);
    if (!submission.current || submission.current.signature !== signature) submission.current = { signature, key: crypto.randomUUID() };
    formData.set("operationKey", submission.current.key);
    try {
    const response = await fetch(chatUrl, { method: "POST", body: formData, headers: { "x-chat-access": accessToken.current, "x-chat-protocol": "2" } });
    const result = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      if (response.status === 409) {
        setError("La consulta fue resuelta. Tu texto se conserva.");
        setConversation(current => current ? { ...current, status: "CLOSED" } : current);
      } else {
        setError(result?.error?.message || "No pudimos enviar el mensaje.");
      }
      return;
    }

    submission.current = null;
    setMessageBody("");
    if (result?.message) setConversation(current => current && !current.messages.some(message => message.id === result.message.id)
      ? { ...current, messages: [...current.messages, result.message] } : current);

    } catch {
      setError("Sin conexión. Tu mensaje no se confirmó. Revisa el historial antes de reintentar.");
    } finally { setLoading(false); }
  }

  async function askBot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!botInput.trim() || loading) return;
    const question = botInput.trim();
    const signature = JSON.stringify([botConversationId, question]);
    if (!botSubmission.current || botSubmission.current.signature !== signature) botSubmission.current = { signature, key: crypto.randomUUID() };
    setLoading(true);
    setError("");

    try {
    const response = await fetch(botUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-chat-protocol": "2", "x-chat-access": botAccessToken.current },
      body: JSON.stringify({ question, conversationId: botConversationId, operationKey: botSubmission.current.key })
    });
    const result = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      setError(result?.error?.message || "No pudimos consultar al asistente.");
      return;
    }

    botSubmission.current = null;
    botAccessToken.current = result.botAccessToken || botAccessToken.current;
    setBotInput("");
    setBotMessages((messages) => [...messages, { sender: "customer", body: question }]);
    if (result?.conversationId) setBotConversationId(result.conversationId);
    setBotMessages((messages) => [...messages, { sender: "bot", body: result?.answer || "Puedo derivarte con un asesor." }]);

    if (result?.escalatedChatId) {
      accessToken.current = result.accessToken || "";
      window.localStorage.setItem(`${storageKey}:access`, accessToken.current);
      window.localStorage.setItem(storageKey, result.escalatedChatId);
      setConversationId(result.escalatedChatId);
      setSystemNotice("Derivamos tu consulta al equipo. Puedes volver desde este navegador para consultar la respuesta.");
    }
    } catch {
      setError("Sin conexión. Tu mensaje no se confirmó. Revisa el historial antes de reintentar.");
    } finally { setLoading(false); }
  }

  if (pathname.startsWith("/portal")) return null;

  return (
    <div className={inline ? "w-full" : "fixed bottom-5 right-5 z-50"}>
      {open ? (
        <section className={inline ? "w-full overflow-hidden rounded-xl border bg-background" : "mb-3 w-[calc(100vw-2.5rem)] max-w-[390px] overflow-hidden rounded-xl border bg-background shadow-2xl"}>
          <header style={presentation ? { backgroundColor: presentation.accent, color: attentionAccentText(presentation.accent) } : undefined} className="flex items-center justify-between bg-[#063D63] px-4 py-3 text-white">
            <div className="flex items-center gap-3">
              <UserAvatar name={assignedName || displayName} image={assignedImage || presentation?.logoUrl} size="sm" className="border-white/30" />
              <div>
                <p className="text-sm font-bold">{assignedName || displayName}</p>
                <p className="text-xs opacity-80">
                  {conversation?.status === "CLOSED" ? "Conversacion cerrada" : hasResponse ? assignedRole : assignedName ? "Perfil asignado" : "Esperando asesor"}
                </p>
              </div>
            </div>
            {!inline && <Button type="button" variant="ghost" size="icon" aria-label="Ocultar conversación" className="text-inherit hover:bg-white/10" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>}
          </header>

          <div className="space-y-4 p-4">
            {presentation && !presentation.withinHours && <p className="text-xs leading-5 text-muted-foreground">{presentation.offlineMessage}</p>}
            {conversationId ? (
              <>
                {conversation?.hasEarlier && <button type="button" disabled={historyLoading} onClick={loadEarlier} className="min-h-11 rounded-md border px-3 text-sm">{historyLoading ? "Cargando…" : "Ver mensajes anteriores"}</button>}
                <div ref={messagesRef} className="max-h-72 space-y-3 overflow-auto rounded-lg bg-muted/40 p-3">
                  {conversation?.messages.map((message) => (
                    <div key={message.id} className={message.sender !== "customer" ? "flex items-end gap-2" : "flex justify-end"}>
                      {message.sender !== "customer" ? <UserAvatar name={assignedName || displayName} image={assignedImage} size="sm" /> : null}
                      <div className={message.sender !== "customer" ? "max-w-[78%] rounded-lg bg-white p-3 text-sm shadow-sm" : "max-w-[85%] rounded-lg bg-primary p-3 text-sm text-primary-foreground"}>
                        {message.sender !== "customer" ? <p className="mb-1 text-[11px] font-bold uppercase opacity-60">{message.sender === "bot" ? "Asistente automático" : assignedName || displayName}</p> : null}
                        <p className="whitespace-pre-line leading-5">{message.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {waitingNotice ? <p className="rounded-md bg-primary/10 p-3 text-xs leading-5 text-primary">{waitingNotice}</p> : null}
                {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
                {conversation?.status === "CLOSED" && <><p className="text-sm text-muted-foreground">Consulta resuelta. El historial se conserva aquí.</p><Button variant="outline" onClick={() => { resetConversation(); setShowHumanForm(true); }}>Nueva consulta</Button></>}
                <form onSubmit={sendMessage} className="flex gap-2">
                  <Input
                    name="body"
                    placeholder="Escribe tu mensaje"
                    disabled={conversation?.status === "CLOSED"}
                    readOnly={loading}
                    value={messageBody}
                    onChange={(event) => setMessageBody(event.target.value)}
                  />
                  <Button type="submit" size="icon" disabled={loading || conversation?.status === "CLOSED" || !messageBody.trim()} aria-label="Enviar mensaje">
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </>
            ) : (
              <div className="grid gap-4">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="max-h-56 space-y-3 overflow-auto">
                    {botMessages.map((message, index) => (
                      <div key={`${message.sender}-${index}`} className={message.sender === "bot" ? "mr-auto max-w-[88%] rounded-lg bg-white p-3 text-sm shadow-sm" : "ml-auto max-w-[88%] rounded-lg bg-primary p-3 text-sm text-primary-foreground"}>
                        <p className="whitespace-pre-line leading-5">{message.body}</p>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={askBot} className="mt-3 flex gap-2">
                    <Input readOnly={loading} value={botInput} onChange={(event) => setBotInput(event.target.value)} placeholder="Escribe tu consulta" />
                    <Button type="submit" size="icon" disabled={loading || !botInput.trim()} aria-label="Preguntar al asistente">
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
                {systemNotice ? <p className="rounded-md bg-primary/10 p-3 text-xs leading-5 text-primary">{systemNotice}</p> : null}
                <Button type="button" variant="outline" onClick={() => setShowHumanForm((value) => !value)}>
                  {showHumanForm ? "Ocultar formulario humano" : "Hablar con asesor humano"}
                </Button>
                {showHumanForm ? (
                  <form ref={startFormRef} onSubmit={startConversation} className="grid gap-3 rounded-lg border p-3">
                    <p className="text-sm leading-6 text-muted-foreground">
                      Inicia una conversacion comercial. Tu consulta se conserva aunque cierres la ventana. Puedes volver desde este navegador.
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">{presentation?.privacyNotice || "Usamos tus datos para atender esta consulta, no para enviarte publicidad."}</p>
                    <label className="grid gap-2 text-sm">Motivo de contacto<select aria-label="Motivo de contacto" name="topic" value={activeTopic} onChange={event => setSelectedTopic(event.target.value)} className="h-11 min-w-0 rounded-md border bg-background px-3 text-sm">
                      {contactTopics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
                    </select></label>
                    <label className="grid gap-2 text-sm">Nombre y apellido<Input required maxLength={160} name="name" autoComplete="name" /></label>
                    {contactRule.email !== "hidden" && <label className="grid gap-2 text-sm">Correo electrónico · {contactRule.email === "required" ? "obligatorio" : "opcional"}<Input required={contactRule.email === "required"} maxLength={254} name="email" type="email" autoComplete="email" /></label>}
                    {contactRule.phone !== "hidden" && <label className="grid gap-2 text-sm">Teléfono · {contactRule.phone === "required" ? "obligatorio" : "opcional"}<Input required={contactRule.phone === "required"} maxLength={40} name="phone" type="tel" autoComplete="tel" /></label>}
                    <label className="grid gap-2 text-sm">Tu consulta<Textarea required maxLength={8000} name="body" placeholder="Cuéntanos qué necesitas resolver" onKeyDown={submitOnEnter} /></label>
                    <Button type="submit" disabled={loading}>{loading ? "Iniciando..." : "Iniciar chat"}</Button>
                  </form>
                ) : null}
                {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
              </div>
            )}
            <ChatContinuity id={conversationId} token={accessToken.current} restore={restoreConversation} />
          </div>
        </section>
      ) : null}

      {!inline && <Button type="button" className="h-14 rounded-full px-5 shadow-2xl" onClick={() => setOpen((value) => !value)}>
        <MessageCircle className="h-5 w-5" />
        Chat tecnico
      </Button>}
    </div>
  );
}
