"use client";
import { useState } from "react";

/** A recovery code is a private bearer credential. Never put it in a URL or telemetry. */
export function ChatContinuity({ id, token, restore }: {
  id: string; token: string; restore: (id: string, token: string) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  async function recover() {
    if (pending) return;
    setPending(true); setStatus("");
    try {
      if (code.length > 2600) throw new Error("Revisa el código privado.");
      const value = JSON.parse(code.trim());
      if (value.v !== 1 || typeof value.id !== "string" || !value.id.startsWith("visitor2_") || value.id.length > 160 || typeof value.token !== "string" || value.token.length > 1600) throw new Error("Revisa el código privado.");
      await restore(value.id, value.token);
      setCode(""); setStatus("Conversación recuperada.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "No pudimos recuperar la conversación."); }
    finally { setPending(false); }
  }
  return <details className="rounded-md border p-3 text-sm">
    <summary className="cursor-pointer py-2 font-medium">Continuar en otro dispositivo</summary>
    <p className="my-3 text-xs leading-5">El código privado permite acceder a esta conversación durante 90 días desde su emisión. Guárdalo de forma segura y no lo compartas.</p>
    {id && token && <button type="button" className="min-h-11 rounded-md border px-3 py-2" onClick={async () => {
      try { await navigator.clipboard.writeText(JSON.stringify({ v: 1, id, token })); setStatus("Código privado copiado. Pégalo en este apartado desde tu otro dispositivo."); }
      catch { setStatus("El navegador no permitió copiar. Habilita el portapapeles para guardar el código."); }
    }}>Copiar mi código privado</button>}
    <label className="mt-3 block text-xs">Código de otra conversación<input type="password" autoComplete="off" maxLength={2600} value={code} onChange={e => setCode(e.target.value)} className="mt-2 min-h-11 w-full rounded-md border bg-transparent px-3 text-sm" /></label>
    <button type="button" disabled={pending || !code.trim()} onClick={recover} className="mt-3 min-h-11 rounded-md border px-3 py-2 disabled:opacity-50">{pending ? "Comprobando…" : "Recuperar conversación"}</button>
    {status && <p role="status" className="mt-3 text-xs leading-5">{status}</p>}
  </details>;
}
