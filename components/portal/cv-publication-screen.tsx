"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { CvPublicationView } from "./cv-publication-view";
import { WebCvPublicationApi } from "@/lib/terraqo/cv-publication-client";
import { WebCvPublicationController, type WebCvPublicationPort, type WebCvSnapshot } from "@/lib/terraqo/cv-publication-controller";
import { checkCvSessionAndLoad, guardCvUnload, isCvDocumentEntry, readCvSessionOwner, WebCvSessionBoundary } from "@/lib/terraqo/cv-publication-lifecycle";

const empty: WebCvSnapshot = Object.freeze({ phase: "loading", page: null, review: null, pending: null, failure: null });
type Resource = { ownerId: string; workspaceSlug: string; controller: WebCvPublicationController; boundary: WebCvSessionBoundary; check(): Promise<void> };

export function CvPublicationScreen({ ownerId, workspaceSlug }: { ownerId: string; workspaceSlug: string }) {
  const createPort = useCallback(() => new WebCvPublicationApi(workspaceSlug, ownerId), [workspaceSlug, ownerId]);
  return <CvPublicationSurface ownerId={ownerId} workspaceSlug={workspaceSlug} createPort={createPort} readOwner={readCvSessionOwner} />;
}

/** Dependency seam for browser fixtures; production supplies only the real
 * owner-bound API and Auth.js reader. No endpoint or identity is editable. */
export function CvPublicationSurface({ ownerId, workspaceSlug, createPort, readOwner: sessionReader }: {
  ownerId: string; workspaceSlug: string; createPort: () => WebCvPublicationPort; readOwner: () => Promise<string | null>;
}) {
  const [resource, setResource] = useState<Resource | null>(null);
  const [state, setState] = useState<WebCvSnapshot>(empty);
  const [consent, setConsent] = useState(false);
  const [, refresh] = useState(0);
  const [closing, setClosing] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const [documentHref, setDocumentHref] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (!isCvDocumentEntry(entry?.name, window.location.href)) {
      // Reload can retain same-document history entries created by a SPA.
      // Require an explicit native navigation to a fresh URL instead; no
      // session reader, CV controller or write is enabled in this entry.
      const target = new URL(window.location.href);
      target.searchParams.set("document", crypto.randomUUID());
      setDocumentHref(target.href); setResource(null); setConsent(false);
      return;
    }
    setDocumentHref(null);
    const controller = new WebCvPublicationController(createPort());
    const boundary = new WebCvSessionBoundary(ownerId, controller, sessionReader, () => refresh(value => value + 1));
    const check = () => checkCvSessionAndLoad(boundary, controller);
    setConsent(false); setState(controller.getSnapshot());
    setResource({ ownerId, workspaceSlug, controller, boundary, check });
    const unsubscribe = controller.subscribe(() => setState(controller.getSnapshot()));
    void check();
    const beforeUnload = (event: BeforeUnloadEvent) => guardCvUnload(controller, event);
    const pageHide = () => {
      // Hide synchronously before a possible BFCache snapshot. Returning to
      // this document reloads and checks its server session before rendering.
      if (root.current) root.current.hidden = true;
      boundary.dispose(); setConsent(false);
    };
    const pageShow = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    const visibility = () => { if (document.visibilityState === "hidden") boundary.pause(); else void check(); };
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("next-auth");
    if (channel) channel.onmessage = () => { boundary.pause(); void check(); };
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") void check(); }, 30000);
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("pageshow", pageShow);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      unsubscribe(); boundary.dispose(); channel?.close(); window.clearInterval(poll);
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener("pageshow", pageShow);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [ownerId, workspaceSlug, createPort, sessionReader]);

  const currentResource = resource?.ownerId === ownerId && resource.workspaceSlug === workspaceSlug ? resource : null;
  const ready = !!currentResource?.boundary.ready && !closing;
  useEffect(() => {
    if (!ready) return;
    if (state.phase === "review" || state.phase === "uncertain")
      root.current?.querySelector<HTMLElement>("[data-cv-focus]")?.focus();
  }, [ready, state.phase]);

  const canLeave = () => !currentResource?.controller.getSnapshot().pending || window.confirm(
    "La solicitud puede haberse recibido. Si sales, perderás su clave guardada en esta pantalla. ¿Quieres salir sin comprobar el resultado?");
  const logout = async () => {
    if (closing || !canLeave()) return;
    setClosing(true); setLogoutFailed(false); setConsent(false); currentResource?.boundary.dispose();
    try { await signOut({ redirect: false }); window.location.assign("/cuenta"); }
    catch { setClosing(false); setLogoutFailed(true); }
  };
  const act = (action: (controller: WebCvPublicationController) => void) => {
    if (currentResource?.boundary.ready && !closing) action(currentResource.controller);
  };
  if (documentHref) return <div className="space-y-4 rounded-xl border bg-card p-6 text-sm leading-6">
    <p>Para proteger las solicitudes pendientes, abre este control en una navegación completa.</p>
    <a href={documentHref} className="inline-flex min-h-11 items-center rounded-md border px-4 font-semibold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Abrir publicación del CV</a>
  </div>;
  return <div ref={root} className="space-y-5">
    <nav aria-label="Publicación del CV" className="flex flex-wrap items-center justify-between gap-3">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Native document navigation runs the pending-operation unload guard. */}
      <a className="min-h-11 rounded-md px-2 py-3 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" href="/perfil">Volver a mi perfil</a>
      <Button type="button" variant="outline" disabled={closing} onClick={() => void logout()}>{closing ? "Cerrando sesión…" : "Cerrar sesión"}</Button>
    </nav>
    {!ready ? <div role="status" aria-live="polite" className="rounded-xl border bg-card p-6 text-sm leading-6">
      {currentResource?.boundary.invalid ? "Tu sesión cambió. Vuelve a iniciar sesión antes de continuar. Una solicitud ya enviada puede haberse recibido; comprueba el estado al volver a ingresar." : closing ? "Cerrando sesión…" : "Comprobando tu sesión…"}
      {!closing && currentResource && !currentResource.boundary.invalid ? <Button type="button" variant="outline" className="ml-3" onClick={() => void currentResource.check()}>Comprobar sesión</Button> : null}
    </div> : <CvPublicationView state={state} consent={consent} onConsent={setConsent}
      onPrepare={action => act(controller => { if (controller.prepare(action, consent)) setConsent(false); })}
      onCancel={() => act(controller => controller.cancelReview())}
      onConfirm={() => act(controller => { void controller.confirm(); })}
      onCheck={() => act(controller => { void controller.reconcile(); })}
      onResend={() => act(controller => { void controller.resend(); })}
      onReload={() => act(controller => { void controller.load(); })} />}
    {logoutFailed ? <p role="alert" className="text-sm">No pudimos confirmar el cierre de sesión. Inténtalo nuevamente.</p> : null}
    {ready && state.phase === "invalid" ? <Button type="button" variant="outline" onClick={() => void logout()}>Volver a ingresar</Button> : null}
  </div>;
}
