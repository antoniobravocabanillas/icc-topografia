"use client";
import { useEffect, useState } from "react";

export type SelectionAccessTarget = { targetType: "collection" | "public-link"; target: string };
export function SelectionAccessRequestForm({ target, returnPath }: { target: SelectionAccessTarget; returnPath: string }) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [login, setLogin] = useState(false);
  const [checking, setChecking] = useState(false);
  const [access, setAccess] = useState<{ href: string; expiresAt: string } | null>(null);
  useEffect(() => {
    if (!access) return;
    let timer: ReturnType<typeof setTimeout>;
    const expire = () => {
      const remaining = Date.parse(access.expiresAt) - Date.now();
      if (remaining <= 0) { setAccess(null); setStatus("Vuelve a comprobar si tienes acceso vigente."); }
      else timer = setTimeout(expire, Math.min(remaining, 2_147_483_647));
    };
    expire();
    const hide = () => setAccess(null);
    window.addEventListener("offline", hide);
    return () => { clearTimeout(timer); window.removeEventListener("offline", hide); };
  }, [access]);
  async function checkAccess() {
    if (checking || busy) return;
    setChecking(true); setAccess(null); setLogin(false); setStatus("Comprobando acceso…");
    try {
      const response = await fetch(`/api/v1/selection-access-requests?${new URLSearchParams(target)}`, { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json();
      if (response.status === 401) { setLogin(true); setStatus("Inicia sesión para comprobar tu acceso."); return; }
      if (!response.ok) throw new Error(payload.error?.message || "No pudimos comprobar el acceso.");
      if (payload.data?.available === true && typeof payload.data.href === "string" && /^\/portal\/selecciones\/[a-zA-Z0-9_-]+$/.test(payload.data.href) && Date.parse(payload.data.expiresAt) > Date.now()) {
        setAccess({ href: payload.data.href, expiresAt: payload.data.expiresAt }); setStatus("Tienes acceso vigente a la selección.");
      } else setStatus("No hay un acceso vigente para esta solicitud. Puedes volver a comprobarlo más tarde.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "No pudimos comprobar el acceso."); }
    finally { setChecking(false); }
  }
  return <form className="mt-6 grid max-w-xl gap-3 rounded-xl border border-[#294057] bg-[#07111e] p-5 text-white" onSubmit={async event => {
    event.preventDefault(); if (busy || sent || checking) return;
    setBusy(true); setLogin(false); setStatus("Enviando solicitud…");
    try {
      const response = await fetch("/api/v1/selection-access-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...target, message }) });
      const payload = await response.json();
      if (response.status === 401) { setLogin(true); setStatus("Inicia sesión para solicitar acceso."); return; }
      if (!response.ok) throw new Error(payload.error?.message || "No pudimos enviar la solicitud.");
      setSent(true); setStatus(payload.data.message);
    } catch (error) { setStatus(error instanceof Error ? error.message : "No pudimos enviar la solicitud."); }
    finally { setBusy(false); }
  }}>
    <h2 className="text-lg font-semibold text-white">Solicitar acceso</h2>
    <p className="text-sm leading-6 text-slate-300">El titular decide qué compartir y durante cuánto tiempo.</p>
    <label className="grid gap-2 text-sm text-slate-300">Motivo (opcional)<textarea value={message} onChange={event => setMessage(event.target.value)} maxLength={500} disabled={busy || sent} className="min-h-24 rounded-lg border border-[#355471] bg-[#101d2d] p-3 text-base text-white" /></label>
    <button disabled={busy || sent || checking} className="min-h-11 rounded-lg bg-[#2869c7] px-4 text-sm text-white disabled:opacity-50">{sent ? "Solicitud registrada" : busy ? "Enviando…" : "Enviar solicitud"}</button>
    <button type="button" onClick={() => void checkAccess()} disabled={busy || checking} className="min-h-11 rounded-lg border border-[#355471] px-4 text-sm text-sky-300 disabled:opacity-50">{checking ? "Comprobando…" : "Comprobar mi acceso"}</button>
    {access ? <a href={access.href} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#2869c7] px-4 text-sm text-white">Abrir selección autorizada</a> : null}
    <p role="status" className="text-sm leading-6 text-slate-300">{status}</p>
    {login ? <a href={`/cuenta?callbackUrl=${encodeURIComponent(returnPath)}`} className="inline-flex min-h-11 items-center text-sky-300">Iniciar sesión</a> : null}
  </form>;
}
