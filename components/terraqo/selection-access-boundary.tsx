"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SelectionAccessRequestForm, type SelectionAccessTarget } from "./selection-access-request-form";
import { useRouter } from "next/navigation";

type State = "checking" | "ready" | "unavailable" | "offline" | "changed" | "login";

export function SelectionAccessBoundary({ endpoint, fingerprint, expiresAt, returnPath, requestTarget, children }: {
  requestTarget?: SelectionAccessTarget;
  endpoint: string;
  fingerprint: string;
  expiresAt?: string;
  returnPath: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>("checking");
  const request = useRef<AbortController | null>(null);
  const check = useCallback(async () => {
    // Invalidate older responses so a slow successful check cannot restore withdrawn content.
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState(current => current === "ready" ? "ready" : "checking");
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${endpoint}?access=check`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      if (request.current !== controller) return;
      if (response.status === 401) { setState("login"); return; }
      if (response.status === 403 || response.status === 404 || response.status === 410) { setState("unavailable"); return; }
      if (!response.ok) throw new Error("Access check unavailable");
      const body = await response.json();
      if (request.current !== controller || controller.signal.aborted) return;
      if (typeof body?.data?.fingerprint !== "string") throw new Error("Invalid access check");
      if (body.data.fingerprint !== fingerprint) {
        setState("changed");
        router.refresh();
        return;
      }
      if (expiresAt && Date.parse(expiresAt) <= Date.now()) { setState("unavailable"); return; }
      setState("ready");
    } catch {
      if (request.current === controller) setState("offline");
    } finally {
      window.clearTimeout(timeout);
    }
  }, [endpoint, fingerprint, expiresAt, router]);

  useEffect(() => {
    void check();
    const visibleCheck = () => { if (document.visibilityState === "visible") void check(); };
    const offline = () => { request.current?.abort(); request.current = null; setState("offline"); };
    const interval = window.setInterval(visibleCheck, 60_000);
    window.addEventListener("focus", visibleCheck);
    window.addEventListener("online", visibleCheck);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visibleCheck);
    return () => {
      request.current?.abort(); request.current = null;
      window.clearInterval(interval);
      window.removeEventListener("focus", visibleCheck);
      window.removeEventListener("online", visibleCheck);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visibleCheck);
    };
  }, [check]);

  useEffect(() => {
    if (!expiresAt) return;
    let timer: number;
    const expire = () => {
      const remaining = Date.parse(expiresAt) - Date.now();
      if (!Number.isFinite(remaining) || remaining <= 0) {
        request.current?.abort(); request.current = null;
        setState("unavailable");
      } else timer = window.setTimeout(expire, Math.min(remaining, 2_147_483_647));
    };
    expire();
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  if (state === "ready") return children;
  const message: Record<Exclude<State, "ready">, string> = {
    checking: "Comprobando acceso…",
    unavailable: "Esta selección no está disponible.",
    offline: "No pudimos comprobar tu acceso. Revisa la conexión y vuelve a intentarlo.",
    changed: "El contenido o los permisos cambiaron. Actualizando la selección…",
    login: "Inicia sesión para comprobar tu acceso.",
  };
  return <section className="rounded-xl border border-[#294057] bg-[#07111e] p-6 text-white" aria-label="Estado de acceso">
    <p role="status" className="text-base leading-7 text-slate-200">{message[state]}</p>
    {state !== "checking" ? <button type="button" onClick={() => void check()} className="mt-4 min-h-11 rounded-lg border border-[#355471] px-4 text-sm text-sky-300">Volver a comprobar</button> : null}
    {state === "login" ? <a href={`/cuenta?callbackUrl=${encodeURIComponent(returnPath)}`} className="ml-3 inline-flex min-h-11 items-center text-sm text-sky-300">Iniciar sesión</a> : null}
    {state === "unavailable" && requestTarget ? <SelectionAccessRequestForm target={requestTarget} returnPath={returnPath} /> : null}
  </section>;
}
