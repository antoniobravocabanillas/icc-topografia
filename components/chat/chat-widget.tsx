"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/terraqo/user-avatar";

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

const storageKey = "icc-chat-conversation-id";

const topics = [
  "Cotizacion de equipos",
  "Servicio topografico",
  "Soporte tecnico",
  "Alquiler de equipos",
  "Mantenimiento y calibracion",
  "Capacitacion"
];

export function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
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
      body: "Hola, soy el asistente ICC. Puedo responder preguntas sobre servicios, equipos, alquiler, calibracion o derivarte con un asesor."
    }
  ]);
  const [botInput, setBotInput] = useState("");
  const [showHumanForm, setShowHumanForm] = useState(false);
  const startFormRef = useRef<HTMLFormElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  const assignedName = conversation?.assignedProfile?.displayName || conversation?.assignedTo?.name || conversation?.assignedTo?.email || "";
  const assignedRole = conversation?.assignedProfile?.roleTitle || "Asesor tecnico";
  const assignedImage = conversation?.assignedProfile?.avatar || conversation?.assignedTo?.image || null;
  const hasAdminReply = Boolean(conversation?.messages.some((message) => message.sender === "admin"));
  const isOnline = conversation?.status === "ACTIVE" || hasAdminReply;
  const waitingNotice = conversationId && conversation?.status !== "CLOSED" && !hasAdminReply
    ? assignedName
      ? `${assignedName} ya fue asignado a tu solicitud. Permanece en linea, te respondera en breve.`
      : "Solicitud recibida. No cierres esta ventana; un asesor tomara tu conversacion en linea desde nuestro admin."
    : "";

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) setConversationId(stored);
  }, []);

  function resetConversation(notice?: string) {
    window.localStorage.removeItem(storageKey);
    setConversationId("");
    setConversation(null);
    setMessageBody("");
    if (notice) setSystemNotice(notice);
  }

  useEffect(() => {
    if (!conversationId) return;

    async function loadConversation() {
      const response = await fetch(`/api/chat?conversationId=${conversationId}`, { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.conversation) {
        if (result.conversation.status === "CLOSED") {
          resetConversation("La conversacion anterior fue cerrada por el equipo ICC. Puedes iniciar un nuevo chat cuando quieras.");
          return;
        }

        setConversation(result.conversation);
        return;
      }

      if (response.status === 404) {
        resetConversation("No encontramos la conversacion anterior. Puedes iniciar un nuevo chat.");
      }
    }

    loadConversation();
    const interval = window.setInterval(loadConversation, 3000);
    return () => window.clearInterval(interval);
  }, [conversationId]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation?.messages.length, open]);

  function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function startConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");
    setSystemNotice("");
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/chat", { method: "POST", body: formData });
    const result = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      setError(result?.error?.message || "No pudimos iniciar el chat. Intentalo nuevamente.");
      return;
    }

    const id = result?.conversationId as string;
    window.localStorage.setItem(storageKey, id);
    setConversationId(id);
    setConversation(result.conversation);
    startFormRef.current?.reset();
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
    const response = await fetch("/api/chat", { method: "POST", body: formData });
    const result = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      if (response.status === 409) {
        resetConversation(result?.error?.message || "La conversacion fue cerrada. Inicia un nuevo chat.");
      } else {
        setError(result?.error?.message || "No pudimos enviar el mensaje.");
      }
      return;
    }

    setMessageBody("");
    const refreshed = await fetch(`/api/chat?conversationId=${conversationId}`, { cache: "no-store" });
    const refreshedResult = await refreshed.json().catch(() => null);
    if (refreshed.ok && refreshedResult?.conversation) setConversation(refreshedResult.conversation);
  }

  async function askBot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!botInput.trim() || loading) return;
    const question = botInput.trim();
    setBotInput("");
    setLoading(true);
    setError("");
    setBotMessages((messages) => [...messages, { sender: "customer", body: question }]);

    const response = await fetch("/api/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, conversationId: botConversationId })
    });
    const result = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      setError(result?.error?.message || "No pudimos consultar al asistente.");
      return;
    }

    if (result?.conversationId) setBotConversationId(result.conversationId);
    setBotMessages((messages) => [...messages, { sender: "bot", body: result?.answer || "Puedo derivarte con un asesor." }]);

    if (result?.escalatedChatId) {
      window.localStorage.setItem(storageKey, result.escalatedChatId);
      setConversationId(result.escalatedChatId);
      setSystemNotice("Derivamos tu consulta al equipo ICC. Permanece en linea para que un asesor tome la conversacion.");
    }
  }

  if (pathname.startsWith("/portal")) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open ? (
        <section className="mb-3 w-[calc(100vw-2.5rem)] max-w-[390px] overflow-hidden rounded-xl border bg-background shadow-2xl">
          <header className="flex items-center justify-between bg-[#063D63] px-4 py-3 text-white">
            <div className="flex items-center gap-3">
              <UserAvatar name={assignedName || "Asesor tecnico ICC"} image={assignedImage} size="sm" className="border-white/30" />
              <div>
                <p className="text-sm font-bold">{assignedName || "Asesor tecnico ICC"}</p>
                <p className="text-xs text-white/70">
                  {conversation?.status === "CLOSED" ? "Conversacion cerrada" : isOnline ? `${assignedRole} en linea` : assignedName ? "Perfil asignado" : "Esperando asesor"}
                </p>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Cerrar chat" className="text-white hover:bg-white/10" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </header>

          <div className="space-y-4 p-4">
            {conversationId ? (
              <>
                <div ref={messagesRef} className="max-h-72 space-y-3 overflow-auto rounded-lg bg-muted/40 p-3">
                  {conversation?.messages.map((message) => (
                    <div key={message.id} className={message.sender === "admin" ? "flex items-end gap-2" : "flex justify-end"}>
                      {message.sender === "admin" ? <UserAvatar name={assignedName || "ICC Topografia"} image={assignedImage} size="sm" /> : null}
                      <div className={message.sender === "admin" ? "max-w-[78%] rounded-lg bg-white p-3 text-sm shadow-sm" : "max-w-[85%] rounded-lg bg-primary p-3 text-sm text-primary-foreground"}>
                        {message.sender === "admin" ? <p className="mb-1 text-[11px] font-bold uppercase opacity-60">{assignedName || "ICC Topografia"}</p> : null}
                        <p className="whitespace-pre-line leading-5">{message.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {waitingNotice ? <p className="rounded-md bg-primary/10 p-3 text-xs leading-5 text-primary">{waitingNotice}</p> : null}
                {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
                <form onSubmit={sendMessage} className="flex gap-2">
                  <Input
                    name="body"
                    placeholder="Escribe tu mensaje"
                    disabled={conversation?.status === "CLOSED"}
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
                    <Input value={botInput} onChange={(event) => setBotInput(event.target.value)} placeholder="Pregunta al asistente ICC" />
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
                      Inicia una conversacion comercial. Te pediremos que permanezcas en linea hasta que un asesor tome el caso.
                    </p>
                    <Input required name="name" placeholder="Nombre y apellido" autoComplete="name" />
                    <Input name="email" type="email" placeholder="Correo corporativo" autoComplete="email" />
                    <Input name="phone" placeholder="Telefono / WhatsApp" autoComplete="tel" />
                    <select name="topic" defaultValue="Cotizacion de equipos" className="h-11 rounded-md border bg-background px-3 text-sm">
                      {topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
                    </select>
                    <Textarea required name="body" placeholder="Cuentanos que equipo, servicio o soporte necesitas" onKeyDown={submitOnEnter} />
                    <Button type="submit" disabled={loading}>{loading ? "Iniciando..." : "Iniciar chat"}</Button>
                  </form>
                ) : null}
                {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
              </div>
            )}
          </div>
        </section>
      ) : null}

      <Button type="button" className="h-14 rounded-full px-5 shadow-2xl" onClick={() => setOpen((value) => !value)}>
        <MessageCircle className="h-5 w-5" />
        Chat tecnico
      </Button>
    </div>
  );
}
