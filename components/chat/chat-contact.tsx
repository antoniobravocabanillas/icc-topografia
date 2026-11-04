"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { attentionContactRule, type AttentionConfig } from "@/lib/terraqo/customer-attention-config";

export function ChatContact({ conversationId, token, workspaceSlug, topic, config }: {
  conversationId: string; token: string; workspaceSlug?: string; topic: string;
  config: Pick<AttentionConfig, "contactRules"> | null;
}) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const busy = useRef(false);
  const receipt = useRef<{ signature: string; key: string } | null>(null);
  const rule = attentionContactRule(config, topic);
  if (!token || (rule.email === "hidden" && rule.phone === "hidden")) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const email = String(values.get("email") || "").trim();
    const phone = String(values.get("phone") || "").trim();
    if (!email && !phone) { setFeedback("Completa correo o teléfono para compartirlo."); return; }
    const input = { ...(email ? { email } : {}), ...(phone ? { phone } : {}) };
    const signature = JSON.stringify(input);
    if (receipt.current?.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    const query = new URLSearchParams({ conversationId, ...(workspaceSlug ? { workspace: workspaceSlug } : {}) });
    busy.current = true; setPending(true); setFeedback("");
    try {
      const response = await fetch(`/api/chat/contact?${query}`, {
        method: "POST", headers: { "content-type": "application/json", "x-chat-access": token },
        body: JSON.stringify({ ...input, operationKey: receipt.current.key }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.saved !== true) {
        setFeedback(result?.error?.message || "No pudimos confirmar el cambio. Tus datos siguen en el formulario."); return;
      }
      receipt.current = null; form.reset();
      setFeedback("Datos compartidos con el equipo. Tu conversación continúa aquí.");
    } catch {
      setFeedback("Sin conexión. Tus datos se conservan en el formulario; puedes reintentar.");
    } finally { busy.current = false; setPending(false); }
  }

  return <details className="rounded-lg border px-3">
    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Compartir datos de contacto</summary>
    <form onSubmit={submit} className="grid gap-3 border-t py-4">
      <p className="text-xs leading-5 text-muted-foreground">Comparte un correo o teléfono para esta consulta. Los campos que dejes vacíos no cambian tus datos anteriores. Esto no activa avisos automáticos ni autoriza publicidad.</p>
      <fieldset disabled={pending} className="grid gap-3">
        {rule.email !== "hidden" && <label className="grid gap-2 text-sm">Correo de contacto<Input type="email" name="email" maxLength={254} autoComplete="email" /></label>}
        {rule.phone !== "hidden" && <label className="grid gap-2 text-sm">Teléfono de contacto<Input type="tel" name="phone" minLength={3} maxLength={40} autoComplete="tel" /></label>}
        <Button type="submit">{pending ? "Compartiendo…" : "Compartir con el equipo"}</Button>
      </fieldset>
      {feedback && <p role="status" className="text-sm leading-6">{feedback}</p>}
    </form>
  </details>;
}
