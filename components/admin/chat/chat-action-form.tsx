"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ChatActionForm({ action, label, children, primary = false }: {
  action: (data: FormData) => Promise<void>; label: string; children?: ReactNode; primary?: boolean;
}) {
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState("");
  const busy = useRef(false);
  const operation = useRef<{ signature: string; key: string } | null>(null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  return <form ref={formRef} className="space-y-2" onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (busy.current) return;
    busy.current = true;
    const signature = JSON.stringify([...data.entries()]);
    if (!operation.current || operation.current.signature !== signature) operation.current = { signature, key: crypto.randomUUID() };
    data.set("operationKey", operation.current.key);
    setFeedback("");
    start(async () => {
      try { await action(data); formRef.current?.reset(); setFeedback("Cambio guardado."); router.refresh(); }
      catch { setFeedback("No se pudo guardar. Actualiza la conversación y vuelve a intentarlo."); }
      finally { busy.current = false; }
    });
  }}>
    <fieldset disabled={pending} className="space-y-2">{children}<Button variant={primary ? "default" : "outline"} type="submit" className="min-h-11 w-full" disabled={pending}>{pending ? (primary ? "Resolviendo…" : "Guardando…") : label}</Button></fieldset>
    {feedback && <p role="status" className="text-sm leading-5 text-muted-foreground">{feedback}</p>}
  </form>;
}
