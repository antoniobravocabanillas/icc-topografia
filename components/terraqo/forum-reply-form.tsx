"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ForumReplyForm({ postId }: { postId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") || "");
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/terraqo/forums/replies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postId, body })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || "No pudimos publicar tu respuesta.");
      form.reset();
      setMessage("Respuesta publicada.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos publicar tu respuesta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border bg-white p-5 shadow-technical">
      <label className="grid gap-2 text-sm font-semibold">Aporta una respuesta
        <textarea name="body" className="min-h-28 rounded-md border bg-background p-3" placeholder="Comparte el procedimiento, criterio o recurso que puede ayudar." minLength={4} maxLength={3000} required />
      </label>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">Las respuestas quedan vinculadas a tu perfil profesional.</p>
        <Button type="submit" disabled={busy} className="gap-2"><Send className="h-4 w-4" />{busy ? "Publicando..." : "Responder"}</Button>
      </div>
      {message ? <p role="status" className="mt-3 rounded-md border bg-muted/40 p-3 text-sm font-semibold">{message}</p> : null}
    </form>
  );
}
