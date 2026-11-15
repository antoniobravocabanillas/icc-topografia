"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Plus, Save, Sparkles, Trash2, X, BriefcaseBusiness, ListChecks, MapPin, CalendarDays, Wrench, ShieldCheck, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type NeedRequirement = { label: string; priority: "REQUIRED" | "DESIRED" };
export type NeedContent = {
  title: string;
  problem: string;
  activities: string[];
  context?: string | null;
  locationLabel?: string | null;
  availableFrom?: string | null;
  availableUntil?: string | null;
  requiredTools: string[];
  endorsementNeeded?: boolean;
  requirements: NeedRequirement[];
};
export type EditableNeed = {
  id: string;
  lifecycle: "DRAFT" | "ACTIVE" | "ARCHIVED";
  version: number;
  currentRevision: (NeedContent & { id: string }) | null;
};

export async function needApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await response.json() as { data?: T; error?: string | { message?: string } };
  if (!response.ok || body.data === undefined) throw new Error(typeof body.error === "string" ? body.error : body.error?.message || "No se pudo completar la operación.");
  return body.data;
}

const splitLines = (value: string) => value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
const dateValue = (value?: string | null) => value?.slice(0, 10) ?? "";
const displayDate = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const normalize = (value: string) => value.trim().toLocaleLowerCase("es-PE");

export function DiscoveryNeedEditor({ need, writable, onSaved, onDirtyChange, onBusyChange }: {
  need: EditableNeed | null;
  writable: boolean;
  onSaved: (need: EditableNeed, search: boolean) => void | Promise<void>;
  onBusyChange: (busy: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const revision = need?.currentRevision;
  const [activity, setActivity] = useState(revision?.title ?? "");
  const [context, setContext] = useState(revision?.problem ?? "");
  const [requirements, setRequirements] = useState<(NeedRequirement & { key: string })[]>(() => (revision?.requirements ?? []).map((item, index) => ({ ...item, key: `existing-${index}` })));
  const [suggestions, setSuggestions] = useState<(NeedRequirement & { key: string; decision: "pending" | "accepted" | "discarded" })[]>([]);
  const [source, setSource] = useState<"ai" | "local">("local");
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [optional, setOptional] = useState({ location: revision?.locationLabel ?? "", tools: revision?.requiredTools.join(", ") ?? "", from: dateValue(revision?.availableFrom), until: dateValue(revision?.availableUntil), endorsement: revision?.endorsementNeeded ?? false });
  const [conflict, setConflict] = useState(false);
  const pendingOperation = useRef<{ body: string; key: string } | null>(null);
  const suggestionGeneration = useRef(0);
  useEffect(() => () => { suggestionGeneration.current++; }, []);
  const busy = saving || suggesting;
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  const pending = suggestions.some((item) => item.decision === "pending");

  function change() {
    setDirty(true);
    onDirtyChange(true);
    setError(null);
  }

  function changeBase() {
    change();
    // Results belong to the exact input snapshot; late responses must never replace newer edits.
    suggestionGeneration.current++;
    setSuggestions([]);
    setSuggesting(false);
  }

  async function suggest() {
    if (busy || !writable || activity.trim().length < 2 || context.trim().length < 2) return;
    const generation = ++suggestionGeneration.current;
    setSuggesting(true);
    setError(null);
    onDirtyChange(true);
    try {
      const result = await needApi<{ source: "ai" | "local"; suggestions: NeedRequirement[] }>("/api/v1/work-needs/suggestions", {
        method: "POST", body: JSON.stringify({ activity: activity.trim(), context: context.trim() }),
      });
      if (generation !== suggestionGeneration.current) return;
      if (!["ai", "local"].includes(result.source) || !Array.isArray(result.suggestions) || result.suggestions.some((item) => typeof item.label !== "string" || item.label.trim().length < 2 || item.label.length > 180 || !["REQUIRED", "DESIRED"].includes(item.priority))) throw new Error("Las sugerencias recibidas no son válidas. Continúa con tus criterios manuales.");
      const seen = new Set(requirements.map((item) => normalize(item.label)));
      const items = result.suggestions.filter((item) => {
        const label = normalize(item.label);
        if (seen.has(label)) return false;
        seen.add(label);
        return true;
      }).slice(0, 40 - requirements.length);
      setSource(result.source);
      setSuggestions(items.map((item) => ({ ...item, key: crypto.randomUUID(), decision: "pending" })));
      onDirtyChange(dirty || items.length > 0);
      if (!items.length) setError("No hay criterios nuevos para revisar. Puedes continuar manualmente.");
    } catch (cause) {
      if (generation !== suggestionGeneration.current) return;
      setError(cause instanceof Error ? cause.message : "No se pudieron obtener sugerencias.");
      onDirtyChange(dirty || pending);
    } finally {
      if (generation === suggestionGeneration.current) setSuggesting(false);
    }
  }

  function decide(key: string, accepted: boolean) {
    const item = suggestions.find((candidate) => candidate.key === key);
    if (!item || item.decision !== "pending") return;
    if (accepted && requirements.length >= 40) { setError("Puedes incluir hasta 40 requisitos."); return; }
    change();
    if (accepted && !requirements.some((candidate) => normalize(candidate.label) === normalize(item.label))) {
      setRequirements((current) => [...current, { label: item.label, priority: item.priority, key: item.key }]);
    }
    setSuggestions((current) => current.map((candidate) => candidate.key === key ? { ...candidate, decision: accepted ? "accepted" : "discarded" } : candidate));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!writable || busy || pending || conflict) return;
    const search = (event.nativeEvent as SubmitEvent).submitter instanceof HTMLButtonElement && ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement).value === "search";
    if (need && !dirty && search) { setSaving(true); try { await onSaved(need, true); } finally { setSaving(false); } return; }
    const form = event.currentTarget;
    const data = new FormData(form);
    const from = String(data.get("availableFrom") || "");
    const until = String(data.get("availableUntil") || "");
    if (until && from && until <= from) { setError("La fecha final debe ser posterior a la inicial."); return; }
    const normalized = requirements.map((item) => normalize(item.label));
    if (new Set(normalized).size !== normalized.length) { setError("Cada requisito debe aparecer una sola vez."); return; }
    const body = JSON.stringify({
      title: activity.trim(), problem: context.trim(),
      activities: [activity.trim(), ...splitLines(String(data.get("activities") || "")).filter((item) => normalize(item) !== normalize(activity))],
      // Preserve legacy internal context separately when reopening an existing need.
      context: revision?.context || undefined,
      locationLabel: String(data.get("locationLabel") || "").trim() || undefined,
      availableFrom: from ? dateValue(revision?.availableFrom) === from ? revision?.availableFrom : `${from}T00:00:00.000Z` : undefined,
      availableUntil: until ? dateValue(revision?.availableUntil) === until ? revision?.availableUntil : `${until}T00:00:00.000Z` : undefined,
      requiredTools: splitLines(String(data.get("requiredTools") || "")),
      endorsementNeeded: data.get("endorsementNeeded") === "on",
      requirements: requirements.map(({ label, priority }) => ({ label: label.trim(), priority })),
      ...(need ? { expectedVersion: need.version } : {}),
    });
    // A failed transport keeps its operation key for an identical retry, preventing duplicate drafts.
    if (pendingOperation.current?.body !== body) pendingOperation.current = { body, key: crypto.randomUUID() };
    setSaving(true);
    setError(null);
    try {
      const saved = await needApi<EditableNeed>(need ? `/api/v1/work-needs/${need.id}/revisions` : "/api/v1/work-needs", {
        method: "POST", headers: { "Idempotency-Key": pendingOperation.current.key }, body,
      });
      pendingOperation.current = null;
      onDirtyChange(false);
      setDirty(false);
      await onSaved(saved, search);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No se pudo guardar el borrador.";
      setError(message);
      if (/otra sesión|Recarga antes/i.test(message)) setConflict(true);
    } finally { setSaving(false); }
  }

  return <section className="grid min-w-0 overflow-hidden rounded-2xl border border-slate-700 bg-[#091827] text-slate-100 lg:grid-cols-[minmax(0,1.7fr)_minmax(260px,0.85fr)] [&_input:not([type=checkbox])]:border-slate-600 [&_input:not([type=checkbox])]:bg-[#0c2033] [&_input:not([type=checkbox])]:text-slate-100 [&_input]:font-normal [&_input]:[color-scheme:dark] [&_input]:placeholder:text-slate-400 [&_input]:focus-visible:ring-blue-400 [&_textarea]:border-slate-600 [&_textarea]:bg-[#0c2033] [&_textarea]:text-slate-100 [&_textarea]:font-normal [&_textarea]:placeholder:text-slate-400 [&_textarea]:focus-visible:ring-blue-400 [&_select]:border-slate-600 [&_select]:bg-[#0c2033] [&_select]:text-slate-100 [&_button]:focus-visible:ring-blue-400 [&_button]:disabled:opacity-50" aria-labelledby="need-editor-heading">
    <div className="min-w-0"><header className="border-b border-slate-700 px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="need-editor-heading" className="text-xl font-bold text-slate-50">{need ? "Editar necesidad" : "¿Qué trabajo necesitas resolver?"}</h2><span className="text-xs font-semibold text-slate-300">{need ? `Borrador · v${need.version}` : "Borrador privado"}</span></div>
      <p className="mt-2 text-sm leading-6 text-slate-300">Empieza con una actividad y su contexto. Puedes precisar los demás criterios después.</p>
      {need ? <p className="mt-3 text-sm leading-6 text-slate-300">Guardar crea la versión {need.version + 1}. Las evaluaciones previas conservan su versión original.</p> : null}
    </header>
    <form onSubmit={(event) => void save(event)} onChange={(event) => { change(); const values = new FormData(event.currentTarget); setOptional({ location: String(values.get("locationLabel") || ""), tools: String(values.get("requiredTools") || ""), from: String(values.get("availableFrom") || ""), until: String(values.get("availableUntil") || ""), endorsement: values.get("endorsementNeeded") === "on" }); }} className="space-y-5 p-5 sm:p-6">
      <fieldset disabled={!writable || busy} className="min-w-0 space-y-5 disabled:opacity-70">
        <label className="grid gap-2 text-sm font-semibold"><span>Actividad principal <span className="font-normal text-slate-400">· obligatoria</span></span><Input name="activity" value={activity} onChange={(event) => { changeBase(); setActivity(event.target.value); }} required minLength={2} maxLength={180} placeholder="Ej. Replanteo y control de niveles" /></label>
        <label className="grid gap-2 text-sm font-semibold"><span>Contexto básico <span className="font-normal text-slate-400">· obligatorio</span></span><Textarea name="problem" value={context} onChange={(event) => { changeBase(); setContext(event.target.value); }} required minLength={2} maxLength={2400} className="min-h-28" placeholder="¿En qué entorno se hará el trabajo y qué necesitas resolver?" /></label>

        <details className="group border-y border-slate-700 py-1">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Precisar criterios y condiciones <span className="font-normal text-slate-400">· opcional</span></summary>
          <div className="space-y-4 pb-4 pt-3">
            <label className="grid gap-2 text-sm font-semibold sm:grid-cols-[150px_minmax(0,1fr)] sm:items-start"><span>Otras actividades</span><Textarea className="min-h-20" name="activities" defaultValue={revision?.activities.filter((item) => item !== revision.title).join("\n") ?? ""} maxLength={5400} placeholder="Una por línea" /></label>
            <fieldset className="space-y-3"><legend className="text-sm font-semibold">Requisitos <span className="font-normal text-slate-400">· hasta 40</span></legend>
              {!requirements.length ? <p className="text-sm leading-6 text-slate-400">Sin requisitos adicionales. Puedes buscar solo con actividad y contexto.</p> : null}
              {requirements.map((item, index) => <div key={item.key} className="grid min-w-0 grid-cols-[minmax(0,1fr)_44px] gap-2 sm:grid-cols-[minmax(0,1fr)_140px_44px]">
                <Input aria-label={`Requisito ${index + 1}`} value={item.label} required minLength={2} maxLength={180} onChange={(event) => setRequirements((current) => current.map((candidate) => candidate.key === item.key ? { ...candidate, label: event.target.value } : candidate))} />
                <Button type="button" variant="ghost" className="text-slate-300 hover:bg-[#18354f] h-11 w-11 p-0 sm:col-start-3" aria-label={`Eliminar requisito ${index + 1}`} onClick={() => { change(); setRequirements((current) => current.filter((candidate) => candidate.key !== item.key)); }}><Trash2 className="h-4 w-4" aria-hidden /></Button>
                <select aria-label={`Importancia del requisito ${index + 1}`} value={item.priority} onChange={(event) => setRequirements((current) => current.map((candidate) => candidate.key === item.key ? { ...candidate, priority: event.target.value as NeedRequirement["priority"] } : candidate))} className="col-span-2 sm:col-span-1 sm:col-start-2 sm:row-start-1 min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="REQUIRED">Obligatorio</option><option value="DESIRED">Deseable</option></select>
              </div>)}
              <Button type="button" variant="outline" className="border-slate-600 bg-[#10263c] text-slate-100 hover:bg-[#18354f] min-h-11" disabled={requirements.length >= 40} onClick={() => { change(); setRequirements((current) => [...current, { label: "", priority: "DESIRED", key: crypto.randomUUID() }]); }}><Plus className="h-4 w-4" aria-hidden />Añadir requisito</Button>
            </fieldset>
            <label className="grid gap-2 text-sm font-semibold sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center"><span>Ubicación · opcional</span><Input name="locationLabel" defaultValue={revision?.locationLabel ?? ""} maxLength={180} placeholder="Ej. San Isidro, Lima" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid min-w-0 gap-2 text-sm font-semibold"><span>Desde · opcional</span><Input type="date" name="availableFrom" defaultValue={dateValue(revision?.availableFrom)} className="min-w-0" /></label>
              <label className="grid min-w-0 gap-2 text-sm font-semibold"><span>Hasta · opcional</span><Input type="date" name="availableUntil" defaultValue={dateValue(revision?.availableUntil)} className="min-w-0" /></label>
            </div>
            <label className="grid gap-2 text-sm font-semibold sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center"><span>Herramientas · opcional</span><Input name="requiredTools" defaultValue={revision?.requiredTools.join(", ") ?? ""} maxLength={3600} placeholder="Separadas por comas" /></label>
            <label className="flex min-h-11 items-start gap-3 py-2 text-sm"><input type="checkbox" name="endorsementNeeded" defaultChecked={revision?.endorsementNeeded ?? false} className="mt-0.5 h-4 w-4 shrink-0 accent-teal-700" /><span>Solicitar respaldo verificable <span className="text-slate-400">· opcional</span></span></label>
          </div>
        </details>

        <section aria-labelledby="need-suggestions-heading" className="space-y-3">
          <div><h3 id="need-suggestions-heading" className="text-sm font-bold">Sugerencias de criterios</h3><p className="mt-1 text-sm leading-6 text-slate-300">Revisa cada propuesta antes de buscar. Ninguna se aplica automáticamente.</p></div>
          <Button type="button" variant="outline" className="border-slate-600 bg-[#10263c] text-slate-100 hover:bg-[#18354f] min-h-11 w-full whitespace-normal" disabled={busy || pending || activity.trim().length < 2 || context.trim().length < 2} onClick={() => void suggest()}>{suggesting ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles className="h-4 w-4 shrink-0" aria-hidden />}{suggesting ? "Preparando sugerencias…" : "Solicitar sugerencias"}</Button>
          {suggestions.length ? <div className="space-y-3" aria-live="polite"><p className="text-xs leading-5 text-slate-300">{source === "ai" ? "Propuestas de IA. Confirma que correspondan al trabajo real." : "Propuestas locales extraídas de tu actividad. No se consultó un proveedor de IA."}</p>{suggestions.map((item) => <article key={item.key} className="border-b border-slate-700 py-3"><p className="break-words text-sm font-semibold">{item.label}</p><p className="mt-1 text-xs text-slate-400">{item.priority === "REQUIRED" ? "Obligatorio" : "Deseable"}</p>{item.decision === "pending" ? <div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" className="border-slate-600 bg-[#10263c] text-slate-100 hover:bg-[#18354f] min-h-11" onClick={() => decide(item.key, true)}><Check className="h-4 w-4" aria-hidden />Aceptar</Button><Button type="button" variant="ghost" className="text-slate-300 hover:bg-[#18354f] min-h-11" onClick={() => decide(item.key, false)}><X className="h-4 w-4" aria-hidden />Descartar</Button></div> : <p className="mt-2 text-xs font-semibold text-blue-200">{item.decision === "accepted" ? "Aceptado · editable en criterios y condiciones" : "Descartado"}</p>}</article>)}</div> : null}
        </section>
        {pending ? <p role="status" className="text-sm font-medium text-amber-200">Acepta o descarta las sugerencias pendientes antes de guardar y buscar.</p> : null}
        {error ? <p role="alert" className="break-words rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-900">{error}{conflict ? " Tu edición se conserva aquí. Abre la versión vigente para revisar los cambios antes de volver a guardar." : ""}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Button type="submit" name="intent" value="save" variant="outline" className="min-h-11 border-slate-600 bg-[#10263c] text-slate-100 hover:bg-[#18354f]" disabled={busy || pending || conflict || (!!need && !dirty)}><Save className="h-4 w-4 shrink-0" aria-hidden />{need ? "Guardar nueva versión" : "Guardar borrador"}</Button>
          <Button type="submit" name="intent" value="search" className="min-h-11 h-auto whitespace-normal bg-blue-600 py-3 text-white hover:bg-blue-500" disabled={busy || pending || conflict}>{saving ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden /> : <Search className="h-4 w-4 shrink-0" aria-hidden />}{saving ? "Guardando y preparando…" : "Buscar evidencia relacionada"}</Button>
        </div>
      </fieldset>
    </form></div>
    <aside className="min-w-0 border-t border-slate-700 bg-[#081522] p-5 sm:p-6 lg:border-l lg:border-t-0" aria-labelledby="need-summary-heading">
      <h3 id="need-summary-heading" className="text-lg font-bold">Resumen de la necesidad</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">Así se buscará la evidencia relacionada.</p>
      <dl className="mt-6 space-y-6">
        <SummaryRow icon={<BriefcaseBusiness className="h-4 w-4" />} label="Trabajo" value={activity || "Describe la actividad principal"} />
        <SummaryRow icon={<ListChecks className="h-4 w-4" />} label="Contexto del proyecto" value={context || "Añade el contexto básico"} />
        <SummaryRow icon={<Wrench className="h-4 w-4" />} label="Herramientas" value={optional.tools || "Por determinar · opcional"} />
        <SummaryRow icon={<MapPin className="h-4 w-4" />} label="Ubicación" value={optional.location || "Por determinar · opcional"} />
        <SummaryRow icon={<CalendarDays className="h-4 w-4" />} label="Fechas" value={optional.from || optional.until ? [optional.from ? displayDate(optional.from) : "Inicio por determinar", optional.until ? displayDate(optional.until) : "Fin por determinar"].join(" / ") : "Por determinar · opcional"} />
        <SummaryRow icon={<ShieldCheck className="h-4 w-4" />} label="Respaldo" value={optional.endorsement ? "Solicitar respaldo verificable" : "Sin solicitar · opcional"} />
      </dl>
      {requirements.length ? <div className="mt-6 border-t border-slate-700 pt-5"><h4 className="text-sm font-semibold">Criterios definidos</h4><ul className="mt-3 space-y-3">{requirements.map((item) => <li key={item.key} className="break-words text-sm leading-6 text-slate-300">{item.label || "Requisito por completar"}<span className="block text-xs text-blue-200">{item.priority === "REQUIRED" ? "Obligatorio" : "Deseable"}</span></li>)}</ul></div> : null}
      <div className="mt-8 flex gap-3 border-t border-slate-700 pt-5"><ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-blue-300" aria-hidden /><p className="text-sm leading-6 text-slate-300"><strong className="block font-semibold text-slate-100">Evidencia profesional pertinente</strong>Sin filtros personales sensibles. El borrador es privado y puedes revisarlo antes de buscar.</p></div>
    </aside>
  </section>;
}

function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex min-w-0 items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-700 bg-[#102336] text-blue-200" aria-hidden>{icon}</span><div className="min-w-0"><dt className="text-sm font-semibold text-slate-100">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{value}</dd></div></div>;
}
