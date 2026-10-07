"use client";

import React from "react";
import { Check, ExternalLink, Globe2, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WebCvSnapshot } from "@/lib/terraqo/cv-publication-controller";

export type CvPublicationViewProps = {
  state: WebCvSnapshot;
  consent: boolean;
  onConsent(value: boolean): void;
  onPrepare(action: "PUBLISH" | "WITHDRAW"): void;
  onCancel(): void;
  onConfirm(): void;
  onCheck(): void;
  onResend(): void;
  onReload(): void;
};

/** Presentation only: no fetch, session, navigation or operation key creation.
 * The owner-bound controller and lifecycle guards must be connected separately. */
export function CvPublicationView({ state, consent, onConsent, onPrepare, onCancel, onConfirm,
  onCheck, onResend, onReload }: CvPublicationViewProps) {
  const { phase, page, pending, review, failure } = state;
  const busy = phase === "loading" || phase === "sending" || phase === "checking";
  const uncertain = !!pending;
  const current = page?.current;
  const ready = phase === "idle" && !!current && !pending;
  const published = current?.published === true;
  const error = failure === "credentials" ? "Vuelve a iniciar sesión para administrar la publicación de tu CV."
    : failure === "forbidden" ? "Tu acceso profesional ya no permite administrar esta publicación."
    : failure === "conflict" ? "El perfil cambió. Consulta su estado antes de preparar otra solicitud."
    : failure === "validation" ? "No se pudo aceptar la solicitud. Consulta el estado antes de continuar."
    : "No pudimos consultar el estado del CV. Puedes intentarlo de nuevo.";

  return <section aria-labelledby="cv-publication-title" className="min-w-0 overflow-hidden rounded-2xl border bg-card text-card-foreground">
    <header className="border-b bg-muted/30 px-6 py-6 sm:px-8">
      <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary"><ShieldCheck aria-hidden="true" className="h-4 w-4" /> Visibilidad profesional</p>
      <h2 id="cv-publication-title" className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Tú decides cuándo compartir tu CV.</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Publica un enlace a tu trayectoria o retíralo cuando lo necesites. Tus documentos privados y datos de cobro quedan fuera del CV público.</p>
    </header>

    <div className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
      <div className="min-w-0 space-y-5">
        <div role="status" aria-live="polite" aria-atomic="true" className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{uncertain ? "Última consulta · resultado pendiente" : "Estado consultado"}</p>
          <p className="flex items-center gap-2 text-xl font-semibold">
            {uncertain ? "Publicación por comprobar" : busy && !current ? "Consultando…" : current ? published ? "CV publicado" : "CV sin publicar" : "Estado no disponible"}
            {current && !uncertain ? published ? <Globe2 aria-hidden="true" className="h-5 w-5 text-primary" /> : <LockKeyhole aria-hidden="true" className="h-5 w-5 text-muted-foreground" /> : null}
          </p>
          {current?.username ? <p className="break-all text-sm text-muted-foreground">@{current.username}</p> : null}
          {busy ? <p className="text-sm text-muted-foreground">{phase === "sending" ? "Enviando tu solicitud…" : "Consultando el servidor…"}</p> : null}
        </div>

        {phase === "invalid" || (!page && failure) ? <div role="alert" className="rounded-lg border p-4 text-sm leading-6">
          <p>{error}</p>{phase !== "invalid" ? <Button type="button" variant="outline" className="mt-3" onClick={onReload}>Consultar estado</Button> : null}
        </div> : null}

        {uncertain ? <div role="alert" className="space-y-4 rounded-lg border border-amber-300 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          <p className="font-semibold">La solicitud puede haberse recibido.</p>
          <p>El estado anterior no confirma la situación actual. Consultar no vuelve a enviar tu solicitud; si aún no hay recibo, el resultado sigue pendiente.</p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" disabled={busy} onClick={onCheck}>Consultar recibo</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={onResend}>Reenviar misma solicitud</Button>
          </div>
          <p>Si abandonas esta pantalla o cierras el navegador, perderás la solicitud pendiente guardada aquí. Comprueba el resultado antes de salir.</p>
        </div> : null}

        {review ? <div aria-labelledby="cv-review-title" className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-5">
          <h3 id="cv-review-title" className="text-lg font-semibold">{review.action === "PUBLISH" ? "Revisa antes de publicar" : "Confirma el retiro del CV"}</h3>
          <p className="text-sm leading-6 text-muted-foreground">{review.action === "PUBLISH" ? "Cualquier persona con el enlace podrá consultar el CV y descargar su PDF. Solo las entradas que hayas marcado como públicas se mostrarán." : "El enlace público dejará de mostrar tu CV. Se conservarán tus entradas y sus ajustes de visibilidad; las copias descargadas previamente no se pueden retirar."}</p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={onConfirm}>{review.action === "PUBLISH" ? "Confirmar publicación" : "Confirmar retiro"}</Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
          </div>
        </div> : null}

        {ready && !published ? current?.username ? <div className="space-y-4">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 text-sm leading-6">
            <input type="checkbox" checked={consent} onChange={event => onConsent(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" />
            <span>Autorizo publicar mi CV mediante un enlace público y permitir la descarga de su PDF. Revisé la visibilidad de mis entradas.</span>
          </label>
          <Button type="button" disabled={!consent} onClick={() => onPrepare("PUBLISH")}>Revisar publicación</Button>
        </div> : <p className="rounded-lg border p-4 text-sm leading-6">Configura primero tu usuario público en los ajustes del perfil. Guardarlo no publica el CV.</p> : null}

        {ready && published ? <div className="flex flex-wrap gap-3">
          {current?.url ? <Button asChild variant="outline"><a href={current.url} target="_blank" rel="noopener noreferrer">Ver CV público <ExternalLink aria-hidden="true" className="h-4 w-4" /></a></Button> : null}
          <Button type="button" variant="outline" onClick={() => onPrepare("WITHDRAW")}>Retirar publicación</Button>
        </div> : null}

        {page?.receipt && !uncertain ? <div role="status" className="rounded-lg border p-4 text-sm leading-6">
          <p className="flex items-center gap-2 font-semibold"><Check aria-hidden="true" className="h-4 w-4 text-primary" /> Solicitud confirmada</p>
          <p className="mt-1 text-muted-foreground">{page.receipt.action === "PUBLISH" ? "El servidor confirmó esa publicación." : "El servidor confirmó ese retiro."} Este recibo corresponde a una operación anterior; el estado consultado se muestra arriba.</p>
        </div> : null}
      </div>

      <aside className="min-w-0 border-t pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
        <h3 className="font-semibold">Tu información, bajo tu control</h3>
        <ul className="mt-4 space-y-4 text-sm leading-6 text-muted-foreground">
          <li>Publicar el perfil no convierte en públicas tus experiencias o formación privadas.</li>
          <li>Retirar el CV conserva tu trayectoria y las verificaciones obtenidas.</li>
          <li>Los cambios del perfil se guardan por separado. Guardar ajustes no reactiva un CV retirado.</li>
        </ul>
      </aside>
    </div>
  </section>;
}
