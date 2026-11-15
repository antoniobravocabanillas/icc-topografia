"use client";

import Link from "next/link";
import { useState } from "react";
import { FileText, ShieldCheck, ArrowLeft, History, LockKeyhole } from "lucide-react";
import type { EndorsementRequestItem } from "./endorsement-console";
import { EndorsementReviewForm } from "./endorsement-review-form";

const labels: Record<string, string> = { title: "Título", summary: "Descripción", outcome: "Resultado", contributionRole: "Rol", responsibilities: "Responsabilidades", methods: "Métodos", tools: "Herramientas", occurredAt: "Fecha", locationLabel: "Lugar" };
const link = "inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#79bdff] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#69b9ff]";

export function EndorsementReviewPanel({ request }: { request: EndorsementRequestItem }) {
  const [accessLost, setAccessLost] = useState(false);
  const expired = new Date(request.expiresAt).getTime() <= Date.now();
  const unavailable = accessLost || expired || ["EXPIRED", "REVOKED", "CANCELLED"].includes(request.status);
  const actionable = !unavailable && ["PENDING", "IN_REVIEW"].includes(request.status);
  const historicalUnavailable = request.revision.worklog?.historicalContextUnavailable === true && request.requestedScope.some(field => ["occurredAt", "locationLabel"].includes(field));
  const fields = request.requestedScope.map(field => {
    const value = field === "occurredAt" ? request.revision.worklog?.occurredAt : field === "locationLabel" ? request.revision.worklog?.locationLabel : request.revision[field as keyof typeof request.revision];
    // Never display mutable date/location when the server cannot reconstruct the snapshot.
    return { field, label: labels[field] || field, value: historicalUnavailable && ["occurredAt", "locationLabel"].includes(field) ? null : Array.isArray(value) ? value.join(" · ") : typeof value === "string" ? value : null };
  });
  return <div data-testid={`endorsement-request-${request.id}`}><section data-testid="s08-review" aria-label="Revisar solicitud de respaldo" className="min-w-0 rounded-2xl bg-[#061523] p-4 text-[#edf4fc] selection:bg-[#295b93] selection:text-white sm:p-6 [&_input]:accent-[#69b9ff] [&_select]:[color-scheme:dark] [&_textarea]:caret-[#69b9ff]">
    <Link className={link} href="/portal/respaldos"><ArrowLeft aria-hidden="true" className="h-4 w-4" />Volver a solicitudes</Link>
    <header className="mb-6 mt-3 flex flex-wrap items-start justify-between gap-5">
      <div><h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Revisar solicitud de respaldo</h1><p className="mt-2 max-w-prose text-sm leading-6 text-[#b2c9de]">Confirma únicamente lo que conoces de la participación declarada.</p></div>
      <p className="flex max-w-full items-center gap-3 text-sm text-[#b2c9de]"><FileText aria-hidden="true" className="h-5 w-5 shrink-0" /><span className="min-w-0 break-words">Solicitada por {request.requester.name || "un profesional"}<span className="mt-1 block text-xs">{request.relationshipLabel}</span></span></p>
    </header>
    <p data-testid="endorsement-status" className="mb-5 text-sm font-semibold text-[#b2c9de]">{unavailable ? "No disponible" : ({ PENDING: "Pendiente", IN_REVIEW: "En revisión", CONFIRMED: "Confirmado", PARTIAL: "Parcial", CHANGES_REQUESTED: "Solicita cambios", DECLINED: "No confirmado" } as Record<string, string>)[request.status] || "Estado no disponible"}</p>
    {unavailable ? <div role="status" className="border-t border-[#294963] py-8"><LockKeyhole aria-hidden="true" className="mb-3 h-6 w-6 text-[#79bdff]" /><h2 className="font-semibold">Solicitud no disponible</h2><p className="mt-2 text-sm text-[#b2c9de]">El acceso caducó o fue revocado. El contenido y el formulario ya no están disponibles.</p><button type="button" className={link} onClick={() => window.location.reload()}>Recargar solicitud</button></div> : <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section data-testid="s08-evidence" aria-label="Evidencia solicitada" className="min-w-0 rounded-xl border border-[#294963] bg-[#091d2e] p-4 sm:p-6">
        <h2 className="break-words font-display text-xl font-semibold">{request.requestedScope.includes("title") ? request.revision.title || "Evidencia profesional" : "Evidencia solicitada"}</h2>
        <p className="mt-2 text-sm text-[#b2c9de]">Versión {request.revision.revisionNo} · Evidencia fijada</p>
        <div className="my-5 flex items-start gap-3 border-y border-[#294963] py-5 text-sm leading-6 text-[#b2c9de]"><LockKeyhole aria-hidden="true" className="mt-1 h-5 w-5 shrink-0" /><p>El acceso se limita a los aspectos solicitados. Los archivos y los demás campos quedan fuera de esta revisión.</p></div>
        <dl className="space-y-5 text-sm">{fields.map(({ field, label, value }) => <div key={field}><dt className="font-semibold text-[#c3dbf0]">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words leading-6">{value || (historicalUnavailable && ["occurredAt", "locationLabel"].includes(field) ? "Sin copia histórica disponible" : "Sin información registrada")}</dd></div>)}</dl>
        <details className="mt-6 border-t border-[#294963] pt-3"><summary className={`${link} cursor-pointer`}><History aria-hidden="true" className="h-4 w-4" />Ver versión solicitada</summary><dl className="mt-3 space-y-2 text-xs leading-5 text-[#b2c9de]"><div><dt>Versión fija</dt><dd>{request.revision.revisionNo}</dd></div><div><dt>Huella de la solicitud</dt><dd className="break-all font-mono">{request.revisionHash}</dd></div></dl></details>
        {request.revision.worklog?.newerRevisionAvailable === true && <p data-testid="s08-newer-revision" role="status" className="mt-4 rounded-lg border border-[#856323] bg-[#403014] p-3 text-sm leading-6 text-[#ffe19d]">Hay una versión posterior. Esta revisión corresponde únicamente a la versión {request.revision.revisionNo} solicitada; no confirma contenido nuevo.</p>}
      </section>
      <section aria-label="Tu revisión" className="min-w-0 rounded-xl border border-[#294963] bg-[#091d2e] p-4 sm:p-6">
        <h2 className="font-display text-xl font-semibold">Revisar participación</h2><p className="mt-2 text-sm leading-6 text-[#b2c9de]">Cada respuesta aplica solo al aspecto y la versión que ves aquí.</p>
        {actionable ? <EndorsementReviewForm requestId={request.id} version={request.version} expectedRevisionId={request.revision.id} expectedRevisionHash={request.revisionHash} expiresAt={request.expiresAt} organizationName={request.organization?.brandName || request.organization?.name} onAccessLost={() => setAccessLost(true)} blocked={historicalUnavailable} fields={fields} /> : <div role="status" className="mt-5 border-t border-[#294963] pt-5"><h3 className="flex items-center gap-2 font-semibold"><ShieldCheck aria-hidden="true" className="h-5 w-5" />Revisión finalizada</h3><p className="mt-2 text-sm leading-6 text-[#b2c9de]">La decisión registrada se conserva en el historial. Esta solicitud ya no admite respuestas.</p>{request.decisions[0]?.summaryComment && <p className="mt-3 break-words text-sm leading-6">{request.decisions[0].summaryComment}</p>}</div>}
      </section>
    </div>}
  </section></div>;
}
