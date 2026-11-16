"use client";

import { useState } from "react";
import Image from "next/image";
import type { EditableNeed } from "@/components/admin/discovery-need-editor";
import { ArrowLeft, ArrowRight, ArrowUpRight, BriefcaseBusiness, CalendarDays, Check, FileSearch, ListChecks, LoaderCircle, MapPin, Pencil, Search, ShieldCheck, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { terraqoDomains } from "@/lib/terraqo-domains";

export type DiscoveryAvailability = "AVAILABLE" | "OPEN_TO_PROJECTS" | "WORKING" | "NOT_AVAILABLE";
export type DiscoveryFilters = { activity: string; context: string; availability: DiscoveryAvailability | ""; from: string; to: string };
export const emptyDiscoveryFilters: DiscoveryFilters = { activity: "", context: "", availability: "", from: "", to: "" };
export type EvidenceMatch = {
  revisionId: string;
  worklogId: string;
  needRevisionId: string;
  professionalProfileId: string;
  professionalName: string;
  professionalHref: string | null;
  evidenceHref: string | null;
  previewHref?: string | null;
  availability: DiscoveryAvailability | null;
  title?: string;
  summary?: string;
  occurredAt?: string;
  locationLabel?: string | null;
  accessKind: "PUBLIC_CV" | "PUBLIC_SELECTION";
  accessReferenceId: string;
  missingRequired: string[];
  reasons: {
    required: Array<{ label: string; terms: string[] }>;
    desirable: Array<{ label: string; terms: string[] }>;
    activityTerms: string[];
    toolTerms: string[];
    locationTerms: string[];
  };
};

const availabilityLabels: Record<DiscoveryAvailability, string> = {
  AVAILABLE: "Disponible", OPEN_TO_PROJECTS: "Abierto a proyectos", WORKING: "Trabajando", NOT_AVAILABLE: "No disponible",
};

// Only navigate to an authorized href on the configured public host. Never infer a profile URL from an id.
function publicHref(href: string | null) {
  if (!href) return null;
  try {
    const url = new URL(href, terraqoDomains.public);
    return url.origin === new URL(terraqoDomains.public).origin && ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

const secondaryButton = "min-h-11 border-[#36516b] bg-[#10263c] text-slate-100 hover:bg-[#193750] focus-visible:ring-sky-300";
const primaryButton = "min-h-11 bg-blue-600 text-white hover:bg-blue-500 focus-visible:ring-sky-300";
const filterInput = "min-h-11 min-w-0 border-[#36516b] bg-[#0b1d2e] text-slate-100 placeholder:font-normal placeholder:text-slate-400 focus-visible:ring-sky-300";
const workDate = (value: string) => new Date(value).toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", year: "numeric" });

function PublicLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  const destination = publicHref(href);
  return destination ? <a href={destination} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded text-sm font-semibold text-sky-300 underline decoration-sky-700 underline-offset-4 hover:text-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">{children}<ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden /><span className="sr-only"> (nueva pestaña)</span></a> : null;
}

function WorkPreview({ href, title }: { href: string; title: string }) {
  const [failed, setFailed] = useState(false);
  const src = publicHref(href);
  if (failed || !src) return null;
  return <div className="relative min-h-56 overflow-hidden rounded-lg bg-[#0b1d2e] sm:min-h-64 xl:h-full"><Image src={src} alt={`Vista previa del trabajo: ${title}`} fill unoptimized sizes="(min-width: 1280px) 40vw, 100vw" className="object-cover" onError={() => setFailed(true)} /></div>;
}

export function DiscoveryEvidenceExplorer({ need, matches, selected, searching, explored, error, writable, submitting, onSearch, onToggle, onCreate, onEdit }: {
  need: EditableNeed;
  matches: EvidenceMatch[];
  selected: Record<string, string[]>;
  searching: boolean;
  explored: boolean;
  error: string | null;
  writable: boolean;
  submitting: boolean;
  onSearch: (filters: DiscoveryFilters) => void;
  onToggle: (profileId: string, revisionId: string) => void;
  onCreate: (profileId: string) => void;
  onEdit: () => void;
}) {
  const [filters, setFilters] = useState<DiscoveryFilters>(emptyDiscoveryFilters);
  const [page, setPage] = useState(1);
  const [pageSet, setPageSet] = useState(matches);
  // Result changes, including revocation, reset pagination in the same render.
  if (pageSet !== matches) { setPageSet(matches); setPage(1); }
  const pageSize = 6;
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const visible = matches.slice((page - 1) * pageSize, page * pageSize);
  const update = (key: keyof DiscoveryFilters, value: string) => setFilters(current => ({ ...current, [key]: value }));
  const invalidPeriod = Boolean(filters.from && filters.to && filters.from > filters.to);
  const hasFilters = Object.values(filters).some(Boolean);
  const chosen = matches.filter(match => selected[match.professionalProfileId]?.includes(match.revisionId));
  const profiles = [...new Set(chosen.map(match => match.professionalProfileId))];
  const revision = need.currentRevision;

  return <section aria-labelledby="discovery-heading" aria-busy={searching} className="rounded-xl border border-slate-700 bg-[#061321] p-4 text-slate-100 selection:bg-blue-700 selection:text-white sm:p-6" style={{ colorScheme: "dark" }}>
    <header className="mb-5">
      <h2 id="discovery-heading" className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Explorar experiencia relacionada</h2>
      <p className="mt-2 max-w-[75ch] text-sm leading-6 text-slate-300">Evidencias de trabajos relacionados con tu necesidad. Revisa las coincidencias y lo que falta confirmar.</p>
    </header>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_260px] xl:gap-6">
      <div className="min-w-0">
        <form className="mb-4" onSubmit={event => { event.preventDefault(); if (!invalidPeriod) { setPage(1); onSearch(filters); } }}>
          <fieldset disabled={!writable || searching || submitting}>
            <legend className="sr-only">Afinar la búsqueda</legend>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-slate-300">Actividad pertinente<Input className={filterInput} value={filters.activity} maxLength={200} onChange={event => update("activity", event.target.value)} placeholder="Ej. control de niveles" /></label>
              <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-slate-300">Contexto del trabajo<Input className={filterInput} value={filters.context} maxLength={200} onChange={event => update("context", event.target.value)} placeholder="Ej. edificación" /></label>
              <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-slate-300">Disponibilidad declarada<select value={filters.availability} onChange={event => update("availability", event.target.value)} className={`${filterInput} w-full rounded-md border px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2`}><option value="">Cualquier disponibilidad</option>{Object.entries(availabilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-slate-300">Trabajo desde<Input className={filterInput} type="date" value={filters.from} max={filters.to || undefined} onChange={event => update("from", event.target.value)} aria-describedby="discovery-period" /></label>
              <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-slate-300">Trabajo hasta<Input className={filterInput} type="date" value={filters.to} min={filters.from || undefined} onChange={event => update("to", event.target.value)} aria-describedby="discovery-period" /></label>
              <div className="flex flex-wrap items-end gap-2"><Button type="submit" disabled={invalidPeriod} className={primaryButton}><Search className="h-4 w-4" aria-hidden />Aplicar filtros</Button>{hasFilters ? <Button type="button" variant="ghost" className="min-h-11 px-2 text-sky-300 hover:bg-[#193750]" onClick={() => { setFilters(emptyDiscoveryFilters); setPage(1); onSearch(emptyDiscoveryFilters); }}>Quitar filtros</Button> : null}</div>
            </div>
            <p id="discovery-period" className="mt-2 text-xs leading-5 text-slate-400">Fecha del trabajo en hora de Lima. La disponibilidad publicada no confirma agenda para las fechas de la necesidad.</p>
            {invalidPeriod ? <p role="alert" className="mt-2 text-sm text-red-200">La fecha inicial debe ser anterior o igual a la final.</p> : null}
          </fieldset>
        </form>
        {searching ? <div role="status" className="flex min-h-56 items-center justify-center gap-3 rounded-xl border border-slate-700 p-5 text-sm text-slate-300"><LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />Comprobando trabajos y permisos vigentes…</div> : error ? <div role="alert" className="rounded-xl border border-red-900 bg-[#241c29] p-5"><h3 className="font-bold text-red-200">No se pudo actualizar la exploración</h3><p className="mt-2 text-sm text-slate-200">{error}</p><p className="mt-2 text-sm text-slate-300">Los resultados y la selección anterior se retiraron. Aplica los filtros para reintentar.</p></div> : matches.length ? <>
          <p role="status" className="mb-3 text-xs leading-5 text-slate-400">{matches.length} {matches.length === 1 ? "trabajo relacionado" : "trabajos relacionados"} · Sin calificación única de la persona</p>
          <div className="space-y-4">{visible.map(match => {
            const isSelected = selected[match.professionalProfileId]?.includes(match.revisionId) ?? false;
            const reasons = [...new Set([...match.reasons.required.map(item => item.label), ...match.reasons.desirable.map(item => item.label), ...match.reasons.activityTerms, ...match.reasons.toolTerms, ...match.reasons.locationTerms])];
            const preview = match.previewHref ? publicHref(match.previewHref) : null;
            return <article key={match.revisionId} className={`rounded-xl border p-3 sm:p-4 ${isSelected ? "border-blue-400 bg-[#102941]" : "border-[#29465f] bg-[#091b2b]"}`}>
              <div className={`grid gap-4 ${preview ? "xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]" : ""}`}>
                {preview ? <WorkPreview key={preview} href={preview} title={match.title || "Trabajo compartido"} /> : null}
                <div className="min-w-0">
                  <h3 className="break-words text-lg font-bold leading-6 text-white">{match.title || "Trabajo compartido sin título público"}</h3>
                  <p className="mt-2 text-xs leading-5 text-slate-300">{match.accessKind === "PUBLIC_CV" ? "Evidencia pública" : "Selección pública autorizada"}{match.occurredAt && !Number.isNaN(Date.parse(match.occurredAt)) ? ` · ${workDate(match.occurredAt)}` : ""}{match.locationLabel ? ` · ${match.locationLabel}` : ""}</p>
                  {match.summary ? <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-slate-300">{match.summary}</p> : null}
                  <div className="mt-1">{publicHref(match.professionalHref) ? <PublicLink href={match.professionalHref}>{match.professionalName || "Ver profesional"}</PublicLink> : <p className="py-2 text-sm text-slate-400">Identidad profesional no publicada</p>}</div>
                  <p className="text-xs leading-5 text-slate-400">{match.availability ? `${availabilityLabels[match.availability]} · estado publicado; agenda por confirmar` : "Disponibilidad por confirmar"}</p>
                  <div className="mt-3 grid gap-3 border-t border-[#29465f] pt-3 sm:grid-cols-2">
                    <div className="min-w-0"><h4 className="text-xs font-bold text-sky-200">Por qué coincide</h4><ul className="mt-1 space-y-0.5 text-xs leading-5 text-slate-300">{reasons.length ? reasons.map(reason => <li key={reason} className="break-words">{reason}</li>) : <li>Contexto relacionado en la fuente autorizada.</li>}</ul></div>
                    <div className="min-w-0"><h4 className="text-xs font-bold text-slate-100">Falta confirmar</h4><ul className="mt-1 space-y-0.5 text-xs leading-5 text-slate-300">{match.missingRequired.length ? match.missingRequired.map((item, index) => <li key={`${index}-${item}`} className="break-words">{item}</li>) : <li>Hay coincidencias para los requisitos indicados. Confirma el alcance con el profesional.</li>}</ul></div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><PublicLink href={match.evidenceHref}>Abrir fuente</PublicLink><Button type="button" aria-pressed={isSelected} aria-label={`${isSelected ? "Quitar" : "Seleccionar"} trabajo: ${match.title || "trabajo compartido"}`} disabled={!writable || submitting || !match.needRevisionId} onClick={() => onToggle(match.professionalProfileId, match.revisionId)} className={`${isSelected ? secondaryButton : primaryButton} h-auto max-w-full whitespace-normal px-3 py-2`}>{isSelected ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}{isSelected ? "Seleccionado para evaluar" : "Seleccionar trabajo"}</Button></div>
                </div>
              </div>
            </article>;
          })}</div>
          {pageCount > 1 ? <nav aria-label="Paginación de trabajos" className="mt-4 flex flex-wrap items-center justify-between gap-3"><Button type="button" variant="outline" className={secondaryButton} disabled={page === 1} onClick={() => setPage(current => current - 1)}><ArrowLeft className="h-4 w-4" aria-hidden />Anterior</Button><span role="status" aria-live="polite" className="text-sm text-slate-300">Página {page} de {pageCount}</span><Button type="button" variant="outline" className={secondaryButton} disabled={page === pageCount} onClick={() => setPage(current => current + 1)}>Siguiente<ArrowRight className="h-4 w-4" aria-hidden /></Button></nav> : null}
        </> : <div className="rounded-xl border border-[#29465f] bg-[#091b2b] p-6 sm:py-12"><FileSearch className="mb-3 h-6 w-6 text-sky-300" aria-hidden /><h3 className="font-bold text-white">{explored ? "Sin trabajos con estos criterios" : "Explora a partir de tu necesidad"}</h3><p className="mt-2 max-w-[70ch] text-sm leading-6 text-slate-300">{explored ? "Cambia la actividad o el contexto, quita un filtro o amplía el periodo. No se han encontrado fuentes autorizadas con estos criterios." : "Inicia la búsqueda para revisar trabajos, coincidencias y aspectos pendientes de confirmar."}</p></div>}

        {!searching && chosen.length ? <aside aria-label="Selección para evaluación" className="mt-4 rounded-xl border border-blue-700 bg-[#102941] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-white">{chosen.length} {chosen.length === 1 ? "trabajo seleccionado" : "trabajos seleccionados"}</h3><Button type="button" variant="ghost" disabled={submitting} className="min-h-11 text-sky-300 hover:bg-[#193750]" onClick={() => chosen.forEach(match => onToggle(match.professionalProfileId, match.revisionId))}><X className="h-4 w-4" aria-hidden />Vaciar selección</Button></div>
          <p className="mt-1 text-sm leading-6 text-slate-300">Cada expediente captura referencias y versiones autorizadas de un profesional. Se comprueban los permisos antes de guardar.</p>
          <div className="mt-3 flex flex-wrap gap-3">{profiles.map(profileId => {
            const entries = chosen.filter(match => match.professionalProfileId === profileId);
            const name = publicHref(entries[0].professionalHref) ? entries[0].professionalName : "profesional de la selección";
            return <Button key={profileId} type="button" disabled={!writable || submitting} className={`${primaryButton} h-auto max-w-full whitespace-normal py-3 text-left`} onClick={() => onCreate(profileId)}>Crear expediente · {name} ({entries.length})</Button>;
          })}</div>
        </aside> : null}
      </div>

      <aside aria-labelledby="discovery-need-heading" className="min-w-0 rounded-xl border border-[#29465f] bg-[#081724] p-4 lg:sticky lg:top-5">
        <div className="flex items-center justify-between gap-2"><h3 id="discovery-need-heading" className="whitespace-nowrap font-bold text-white">Tu necesidad</h3><Button type="button" variant="outline" aria-label="Editar necesidad" className={`${secondaryButton} px-2 text-xs`} disabled={!writable || searching || submitting} onClick={onEdit}><Pencil className="h-3.5 w-3.5" aria-hidden />Editar</Button></div>
        <p className="mt-2 text-xs text-slate-400">Versión {need.version} · {need.lifecycle === "DRAFT" ? "Borrador privado" : need.lifecycle === "ARCHIVED" ? "Archivada" : "Activa"}</p>
        <dl className="mt-4 space-y-4 text-sm">
          {([
            [BriefcaseBusiness, "Actividad requerida", revision?.activities.join(" · ") || revision?.title || "Sin definir"],
            [ListChecks, "Contexto del trabajo", revision?.context || revision?.problem || "Sin definir"],
            [MapPin, "Ubicación", revision?.locationLabel || "Sin definir"],
            [CalendarDays, "Fechas solicitadas", [revision?.availableFrom, revision?.availableUntil].map(value => value ? workDate(value) : "Sin definir").join(" / ")],
            [Wrench, "Herramientas", revision?.requiredTools.join(" · ") || "Sin definir"],
          ] as const).map(([Icon, label, value]) => <div key={label} className="flex items-start gap-3"><span className="mt-0.5 rounded-full border border-[#29465f] bg-[#10263c] p-2 text-sky-200"><Icon className="h-4 w-4" aria-hidden /></span><div className="min-w-0"><dt className="text-xs leading-5 text-slate-400">{label}</dt><dd className="mt-0.5 break-words leading-6 text-slate-100">{value}</dd></div></div>)}
        </dl>
        <div className="mt-5 border-t border-[#29465f] pt-4"><h4 className="text-sm font-bold">Criterios de referencia</h4><p className="mt-2 text-xs leading-5 text-slate-400">Orientan las coincidencias; confirma el alcance de cada trabajo.</p><ul className="mt-3 space-y-3">{revision?.requirements.length ? revision.requirements.map((requirement, index) => <li key={`${index}-${requirement.label}`} className="break-words text-sm leading-6 text-slate-200">{requirement.label}<span className="block text-xs text-slate-400">{requirement.priority === "REQUIRED" ? "Obligatorio" : "Deseable"}</span></li>) : <li className="text-sm leading-6 text-slate-400">Sin criterios adicionales definidos.</li>}</ul></div>
        <p className="mt-5 flex items-start gap-2 border-t border-[#29465f] pt-4 text-xs leading-5 text-slate-300"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden />{revision?.endorsementNeeded ? "Respaldo verificable solicitado." : "Respaldo adicional sin solicitar."} La evaluación conserva la versión de la necesidad y las fuentes autorizadas.</p>
      </aside>
    </div>
  </section>;
}
