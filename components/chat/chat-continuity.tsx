"use client";
import { useEffect, useRef, useState } from "react";
import { chatRecoveryPrefix, createChatRecoveryLink, parseChatRecovery } from "@/lib/terraqo/chat-recovery-link";

/** Runs in the parent even when the chat panel is closed. No token is put in query parameters. */
export function useChatRecoveryLink(restore: (id: string, token: string) => Promise<void>, open: () => void, failure: (message: string) => void) {
  const callbacks = useRef({ restore, open, failure });
  callbacks.current = { restore, open, failure };
  useEffect(() => {
    const consume = () => {
      if (!window.location.hash.startsWith(chatRecoveryPrefix)) return;
      const link = window.location.href;
      // Strip before any network operation, including a failed recovery.
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      callbacks.current.open();
      try {
        const value = parseChatRecovery(link, window.location.origin);
        void callbacks.current.restore(value.id, value.token).catch(() => callbacks.current.failure("No pudimos abrir la conversación. Revisa tu conexión o vuelve a pegar el enlace privado."));
      } catch { callbacks.current.failure("El enlace privado no es válido. Puedes pegar tu enlace o código anterior para recuperarla."); }
    };
    consume(); window.addEventListener("hashchange", consume);
    return () => window.removeEventListener("hashchange", consume);
  }, []);
}

export function ChatContinuity({ id, token, restore }: {
  id: string; token: string; restore: (id: string, token: string) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const busy = useRef(false);
  useEffect(() => { setCanShare(typeof navigator.share === "function"); }, []);
  async function recover() {
    if (busy.current) return;
    busy.current = true; setPending(true); setStatus("");
    try {
      const value = parseChatRecovery(code, window.location.origin);
      await restore(value.id, value.token);
      setCode(""); setStatus("Conversación recuperada.");
    } catch { setStatus("No pudimos recuperar la conversación. Revisa el enlace y tu conexión; también puedes usar tu código anterior."); }
    finally { busy.current = false; setPending(false); }
  }
  const link = () => createChatRecoveryLink(id, token, window.location.origin + window.location.pathname);
  return <details className="rounded-md border p-3 text-sm">
    <summary className="cursor-pointer py-2 font-medium">Continuar después</summary>
    <p className="my-3 text-xs leading-5">En este navegador, tu conversación se guarda automáticamente. Para abrirla en otro dispositivo, guarda tu enlace privado.</p>
    {id && token && <div className="flex flex-wrap gap-2">
      <button type="button" className="min-h-11 rounded-md border px-3 py-2" onClick={async () => {
        try { await navigator.clipboard.writeText(link()); setStatus("Enlace copiado. Ábrelo en tu otro dispositivo para continuar."); }
        catch { setStatus("No se pudo copiar. Permite el acceso al portapapeles e inténtalo de nuevo."); }
      }}>Copiar enlace privado</button>
      {canShare && <button type="button" className="min-h-11 rounded-md border px-3 py-2" onClick={async () => {
        try { await navigator.share({ title: "Mi conversación", text: "Enlace privado para continuar mi conversación", url: link() }); }
        catch (error) { if (!(error instanceof Error && error.name === "AbortError")) setStatus("No se pudo compartir. Puedes copiar el enlace privado."); }
      }}>Compartir</button>}
    </div>}
    <p className="my-3 text-xs leading-5">Quien tenga el enlace puede acceder al chat. Guárdalo solo para ti. El acceso vence a los 90 días de su creación; copiarlo no renueva ese plazo.</p>
    <label className="mt-3 block text-xs">¿Ya tienes un enlace privado?<input type="password" autoComplete="off" maxLength={4000} placeholder="Pégalo aquí" value={code} onChange={e => setCode(e.target.value)} className="mt-2 min-h-11 w-full rounded-md border bg-transparent px-3 text-sm" /></label>
    <button type="button" disabled={pending || !code.trim()} onClick={recover} className="mt-3 min-h-11 rounded-md border px-3 py-2 disabled:opacity-50">{pending ? "Abriendo…" : "Abrir conversación"}</button>
    {status && <p role="status" className="mt-3 text-xs leading-5">{status}</p>}
  </details>;
}
