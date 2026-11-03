"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, ImageIcon, Link2, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type WorklogOption = {
  id: string;
  title: string;
  occurredAt: string;
  workspaceId: string | null;
  projectId: string | null;
  workCaseId: string | null;
  imageHref?: string | null;
};

type WorkCaseSummary = {
  id: string;
  title: string;
  description: string | null;
  version: number;
  records: Array<{
    id: string;
    worklogId: string;
    phase: "PREPARATION" | "EXECUTION" | "RESULT" | null;
    worklog: { id: string; title: string; occurredAt: string };
  }>;
};

const phaseLabels = {
  PREPARATION: "Preparación",
  EXECUTION: "Ejecución",
  RESULT: "Resultado",
} as const;

export function WorkCaseOrganizer({
  worklogs,
  initialCases,
}: {
  worklogs: WorklogOption[];
  initialCases: WorkCaseSummary[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Record<string, keyof typeof phaseLabels | "">>({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const available = useMemo(
    () => worklogs.filter((worklog) => !worklog.workCaseId),
    [worklogs],
  );
  const selectedIds = Object.keys(selected);
  const anchor = available.find((worklog) => worklog.id === selectedIds[0]);

  function isCompatible(worklog: WorklogOption) {
    if (!anchor || worklog.id === anchor.id) return true;
    return (
      worklog.workspaceId === anchor.workspaceId &&
      worklog.projectId === anchor.projectId
    );
  }

  async function createCase() {
    if (title.trim().length < 4 || selectedIds.length === 0) {
      setMessage("Escribe un nombre y selecciona al menos una bitácora.");
      return;
    }
    setSubmitting(true);
    setMessage("Organizando el trabajo…");
    try {
      const response = await fetch("/api/v1/work-cases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          workspaceId: anchor?.workspaceId || undefined,
          projectId: anchor?.projectId || undefined,
          records: selectedIds.map((worklogId) => ({
            worklogId,
            phase: selected[worklogId] || undefined,
          })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload?.error?.message || "No pudimos organizar estas bitácoras.");
      setMessage("Trabajo creado y relaciones confirmadas.");
      setTitle("");
      setDescription("");
      setSelected({});
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos completar la acción.");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeRecord(workCase: WorkCaseSummary, worklogId: string) {
    setSubmitting(true);
    setMessage("Desvinculando la bitácora…");
    try {
      const response = await fetch(`/api/v1/work-cases/${workCase.id}/records`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ worklogId, expectedVersion: workCase.version }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload?.error?.message || "No pudimos desvincular la bitácora.");
      setMessage("La bitácora quedó independiente; su contenido no fue eliminado.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos completar la acción.");
    } finally {
      setSubmitting(false);
    }
  }

  const visible = available.filter(worklog => worklog.title.toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es")));
  const control = "min-h-11 w-full min-w-0 rounded-lg border border-[#355471] bg-[#08131f] px-3 py-2 text-base text-white placeholder:text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 disabled:opacity-50";
  return (
    <section aria-labelledby="organizar-trabajo" className="rounded-xl border border-[#294057] bg-[#07111e] p-5 text-white sm:p-7">
      <header className="mb-6">
        <h2 id="organizar-trabajo" className="flex items-center gap-3 text-2xl font-semibold text-white"><BriefcaseBusiness aria-hidden="true" className="h-6 w-6 text-sky-400" />Organizar un trabajo</h2>
        <p className="mt-2 max-w-3xl text-base leading-7 text-slate-300">Selecciona las bitácoras que pertenecen al mismo trabajo. La agrupación conserva los registros originales y no cambia su visibilidad.</p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <div className="min-w-0">
          {anchor?.imageHref ? <div className="mb-5 overflow-hidden rounded-xl border border-[#294057]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={anchor.imageHref} alt={`Imagen de ${anchor.title}`} className="aspect-[16/9] w-full object-contain bg-[#08131f]" />
          </div> : null}
          <h3 className="text-lg font-semibold text-white">Registros para agrupar</h3>
          <p className="mt-1 text-sm text-slate-400">{selectedIds.length} seleccionados · {available.length} disponibles entre las últimas 200 bitácoras</p>
          <label className="relative my-4 block"><span className="sr-only">Buscar bitácoras para agrupar</span><Search aria-hidden="true" className="absolute left-3 top-3 h-5 w-5 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por título" className={`${control} pl-10`} /></label>
          <div className="space-y-3">{visible.map(worklog => {
            const checked = Object.hasOwn(selected, worklog.id);
            const compatible = isCompatible(worklog);
            return <div key={worklog.id} className={`rounded-xl border p-3 ${checked ? "border-sky-400 bg-[#102a3c]" : "border-[#294057] bg-[#101d2d]"}`}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <input type="checkbox" aria-label={`Seleccionar ${worklog.title}`} checked={checked} disabled={!compatible || submitting} onChange={event => setSelected(current => { const next = { ...current }; if (event.target.checked) next[worklog.id] = ""; else delete next[worklog.id]; return next; })} className="h-5 w-5 shrink-0 accent-sky-500" />
                {worklog.imageHref ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={worklog.imageHref} alt="" loading="lazy" className="h-16 w-20 shrink-0 rounded-lg object-cover" />
                ) : <ImageIcon aria-hidden="true" className="h-8 w-8 shrink-0 text-slate-500" />}
                <span className="min-w-0"><span className="block text-sm font-semibold text-white">{worklog.title}</span><span className="mt-1 block text-[13px] text-slate-400">{new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "medium" }).format(new Date(worklog.occurredAt))}</span></span>
              </label>
              {!compatible ? <p className="mt-2 text-[13px] text-amber-200">Pertenece a otra empresa o proyecto. Mantén este registro separado.</p> : null}
              {checked ? <label className="mt-3 grid gap-2 text-sm text-slate-300">Fase (opcional)<select aria-label={`Fase de ${worklog.title}`} value={selected[worklog.id]} disabled={submitting} onChange={event => setSelected(current => ({ ...current, [worklog.id]: event.target.value as keyof typeof phaseLabels | "" }))} className={control}><option value="">Sin clasificar</option>{Object.entries(phaseLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label> : null}
            </div>;
          })}</div>
          {!visible.length ? <p className="rounded-xl border border-[#294057] p-5 text-slate-300">{query ? "No hay coincidencias. Prueba otro título." : "No hay bitácoras independientes disponibles."}</p> : null}
        </div>
        <form onSubmit={event => { event.preventDefault(); void createCase(); }} className="grid gap-5 rounded-xl border border-[#294057] bg-[#101d2d] p-5">
          <h3 className="text-xl font-semibold text-white">Confirma el trabajo</h3>
          <label className="grid gap-2 text-sm text-slate-300">Nombre del trabajo<input required minLength={4} maxLength={180} disabled={submitting} value={title} onChange={event => setTitle(event.target.value)} className={control} placeholder="Ej. Control de niveles del sector B" /></label>
          <label className="grid gap-2 text-sm text-slate-300">Descripción (opcional)<textarea maxLength={1200} disabled={submitting} value={description} onChange={event => setDescription(event.target.value)} className={`${control} min-h-32`} placeholder="Objetivo y alcance del trabajo." /></label>
          <p className="text-sm leading-6 text-slate-300">Revisa las fechas y el contexto antes de confirmar. Preparación, ejecución y resultado son fases opcionales; no representan un porcentaje de avance.</p>
          <Button type="submit" disabled={submitting || !selectedIds.length || title.trim().length < 4} className="min-h-11 bg-[#2869c7] text-white hover:bg-[#347bdc]"><Link2 aria-hidden="true" className="mr-2 h-4 w-4" />{submitting ? "Guardando…" : "Confirmar agrupación"}</Button>
          <button type="button" disabled={submitting || !selectedIds.length} onClick={() => { setSelected({}); setMessage("Los registros permanecen separados. No se modificó su contenido."); }} className="min-h-11 rounded-lg border border-[#355471] px-4 text-sm text-slate-200 disabled:opacity-50">Mantener separados</button>
          <p role="status" aria-live="polite" className="text-sm leading-6 text-sky-200">{message}</p>
        </form>
      </div>
      <section aria-label="Trabajos organizados" className="mt-8 border-t border-[#294057] pt-6">
        <h3 className="mb-4 text-xl font-semibold text-white">Trabajos organizados</h3>
        <div className="grid gap-4 lg:grid-cols-2">{initialCases.map(workCase => <article key={workCase.id} className="rounded-xl border border-[#294057] bg-[#101d2d] p-5">
          <h4 className="text-lg font-semibold text-white">{workCase.title}</h4>
          {workCase.description ? <p className="mt-2 text-sm leading-6 text-slate-300">{workCase.description}</p> : null}
          <ul className="mt-3 divide-y divide-[#294057]">{workCase.records.map(record => <li key={record.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="text-sm font-semibold text-white">{record.worklog.title}</p><p className="mt-1 text-[13px] text-slate-400">{record.phase ? phaseLabels[record.phase] : "Sin fase"}</p></div><button type="button" disabled={submitting} onClick={() => void removeRecord(workCase, record.worklogId)} aria-label={`Desvincular ${record.worklog.title}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#355471] text-slate-300 hover:bg-red-950 hover:text-red-200"><Trash2 aria-hidden="true" className="h-4 w-4" /></button></li>)}</ul>
        </article>)}</div>
        {!initialCases.length ? <p className="text-sm text-slate-400">Todavía no organizaste bitácoras en un trabajo.</p> : null}
      </section>
    </section>
  );
}
