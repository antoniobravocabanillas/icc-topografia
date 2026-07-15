"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ForumPostComposer({ channelId }: { channelId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/terraqo/forums/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channelId,
          title: String(data.get("title") || ""),
          body: String(data.get("body") || ""),
          tags: String(data.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean)
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || "No pudimos publicar la conversacion.");
      form.reset();
      router.push(`/portal/commons/${channelId}/${payload.data.id}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos publicar la conversacion.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="group rounded-lg border bg-white shadow-technical">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold marker:hidden">
        <span className="flex items-center gap-3"><MessageSquarePlus className="h-5 w-5 text-primary" /> Iniciar una conversacion tecnica</span>
        <span className="rounded-md bg-primary/10 px-3 py-1 text-xs text-primary group-open:hidden">Publicar</span>
      </summary>
      <form onSubmit={submit} className="grid gap-4 border-t p-5">
        <label className="grid gap-2 text-sm font-semibold">Pregunta o tema
          <input name="title" className="h-11 rounded-md border bg-background px-3" placeholder="Ej. Como documentan el control de ejes antes del vaciado?" minLength={8} maxLength={180} required />
        </label>
        <label className="grid gap-2 text-sm font-semibold">Contexto tecnico
          <textarea name="body" className="min-h-36 rounded-md border bg-background p-3" placeholder="Explica el problema, lo que ya probaste y el tipo de aporte que necesitas." minLength={30} maxLength={6000} required />
        </label>
        <label className="grid gap-2 text-sm font-semibold">Etiquetas, separadas por coma
          <input name="tags" className="h-11 rounded-md border bg-background px-3" placeholder="control de obra, QA/QC, replanteo" />
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-muted-foreground">Comparte contexto verificable. Commons prioriza soluciones y experiencia real.</p>
          <Button type="submit" disabled={busy}>{busy ? "Publicando..." : "Publicar tema"}</Button>
        </div>
        {message ? <p role="status" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{message}</p> : null}
      </form>
    </details>
  );
}
