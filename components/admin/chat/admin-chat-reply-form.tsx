"use client";

import { KeyboardEvent, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type AdminChatReplyFormProps = {
  replyAction: (formData: FormData) => Promise<void>;
};

export function AdminChatReplyForm({ replyAction }: AdminChatReplyFormProps) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const busy = useRef(false);
  const operation = useRef<{ body: string; key: string } | null>(null);

  function submit(formData: FormData) {
    const body = String(formData.get("body") || "").trim();
    if (!body || busy.current) return;
    busy.current = true;
    if (!operation.current || operation.current.body !== body) operation.current = { body, key: crypto.randomUUID() };
    formData.set("operationKey", operation.current.key);
    setError("");

    startTransition(async () => {
      try {
        await replyAction(formData);
        operation.current = null;
        formRef.current?.reset();
        textareaRef.current?.focus();
      } catch {
        setError("No se confirmó el envío. Tu respuesta se conserva; actualiza el historial antes de reintentar.");
      } finally { busy.current = false; }
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <form ref={formRef} onSubmit={event => { event.preventDefault(); submit(new FormData(event.currentTarget)); }} className="grid gap-3">
      <Textarea
        ref={textareaRef}
        name="body"
        aria-label="Respuesta al cliente"
        maxLength={8000}
        required
        readOnly={pending}
        placeholder="Escribe tu respuesta…"
        className="min-h-28 resize-y"
        onKeyDown={handleKeyDown}
      />
      {error && <p role="alert" className="text-sm text-destructive md:col-span-2">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Enter para enviar · Mayús + Enter para una nueva línea</p><Button type="submit" disabled={pending}>{pending ? "Enviando..." : "Responder"}</Button></div>
    </form>
  );
}
