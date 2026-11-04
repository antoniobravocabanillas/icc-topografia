"use client";

import { useState, type ReactNode } from "react";
import { LockKeyhole, MessageSquare } from "lucide-react";

export function AttentionComposer({ reply, note }: { reply: ReactNode; note: ReactNode }) {
  const [mode, setMode] = useState<"reply" | "note">("reply");
  return <div className="space-y-3">
    <div role="tablist" aria-label="Tipo de mensaje" className="flex gap-5 border-b">
      {(["reply", "note"] as const).map(value => <button key={value} id={`composer-${value}`} type="button" role="tab" tabIndex={mode === value ? 0 : -1} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "reply" : event.key === "End" ? "note" : mode === "reply" ? "note" : "reply"; setMode(next); document.getElementById(`composer-${next}`)?.focus(); } }} aria-selected={mode === value} aria-controls={`composer-panel-${value}`} onClick={() => setMode(value)} className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-1 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${mode === value ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
        {value === "reply" ? <MessageSquare className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}{value === "reply" ? "Respuesta" : "Nota interna"}
      </button>)}
    </div>
    <div id="composer-panel-reply" role="tabpanel" aria-labelledby="composer-reply" hidden={mode !== "reply"}>{reply}</div>
    <div id="composer-panel-note" role="tabpanel" aria-labelledby="composer-note" hidden={mode !== "note"}><p className="mb-3 text-xs text-muted-foreground">Solo para el equipo. Esta nota no se envía al cliente.</p>{note}</div>
  </div>;
}
