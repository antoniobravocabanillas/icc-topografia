"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function DocumentLifecycleActions({ id, version, onWithdrawn, kind = "PRIVATE" }: {
  id: string; version: number; onWithdrawn: () => void; kind?: "CV" | "PRIVATE";
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "withdraw" | "replace">("idle");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [finished, setFinished] = useState(false);
  const attempt = useRef<{ action: string; key: string } | null>(null);
  const locked = useRef(false);

  async function submit(file?: File) {
    if (locked.current || conflict || finished) return;
    locked.current = true; setBusy(true); setMessage("");
    const action = file ? "replacement" : "withdraw";
    // Preserve the same key on an uncertain response. Changing the selected file
    // clears it explicitly; double-clicks never issue a second operation.
    if (attempt.current?.action !== action) attempt.current = { action, key: crypto.randomUUID() };
    const command = { expectedVersion: version, operationKey: attempt.current.key };
    let body: BodyInit = JSON.stringify(command);
    if (file) {
      const form = new FormData(); form.set("file", file);
      form.set("expectedVersion", String(version)); form.set("operationKey", command.operationKey); body = form;
    }
    try {
      const response = await fetch(`/api/terraqo/professional-documents/${encodeURIComponent(id)}/${action}`, {
        method: "POST", body, ...(file ? {} : { headers: { "Content-Type": "application/json" } }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409) setConflict(true);
        throw new Error(typeof result?.error === "string" ? result.error : "No se pudo confirmar. Puedes reintentar sin duplicar la operación.");
      }
      setFinished(true); setMode("idle");
      setMessage(file ? "Nueva versión guardada. Su revisión está pendiente." : "Documento retirado. Ya no está disponible para consulta.");
      if (!file) onWithdrawn();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo conectar. Inténtalo de nuevo.");
    } finally { locked.current = false; setBusy(false); }
  }

  return <div className="mt-4 border-t pt-3">
    {!finished && mode === "idle" ? <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={() => { setMode("replace"); setMessage(""); }}>Nueva versión</Button>
      <Button type="button" variant="ghost" onClick={() => { setMode("withdraw"); setMessage(""); }}>Retirar documento</Button>
    </div> : null}
    {mode === "withdraw" ? <div className="space-y-3">
      <p className="text-sm leading-6">Dejará de estar disponible para consulta e importación. Su archivo e historial se conservan y seguirán ocupando almacenamiento.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy || conflict} onClick={() => void submit()}>{busy ? "Retirando…" : "Confirmar retiro"}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setMode("idle")}>Cancelar</Button>
      </div>
    </div> : null}
    {mode === "replace" ? <form className="space-y-3" onSubmit={event => {
      event.preventDefault(); const file = new FormData(event.currentTarget).get("file");
      if (file instanceof File && file.size) void submit(file);
    }}>
      <p className="text-sm leading-6">La nueva versión conserva el historial y comienza con una revisión pendiente.</p>
      <label className="grid min-w-0 gap-2 text-sm font-medium">Archivo · {kind === "CV" ? "PDF o DOCX" : "PDF, JPG, PNG o WEBP"} · Hasta 10 MB
        <input name="file" type="file" required accept={kind === "CV" ? ".pdf,.docx" : ".pdf,.jpg,.jpeg,.png,.webp"} disabled={busy || conflict}
          onChange={() => { attempt.current = null; }} className="min-h-11 w-full min-w-0 rounded-md border bg-background p-2 text-sm" />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || conflict}>{busy ? "Guardando…" : "Guardar nueva versión"}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setMode("idle")}>Cancelar</Button>
      </div>
    </form> : null}
    {message ? <p role="status" className="mt-3 text-sm leading-6">{message}</p> : null}
    {conflict ? <Button type="button" variant="outline" className="mt-2" onClick={() => router.refresh()}>Actualizar expediente</Button> : null}
  </div>;
}
