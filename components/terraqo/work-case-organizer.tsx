"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, ChevronDown, Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type WorklogOption = {
  id: string;
  title: string;
  occurredAt: string;
  workspaceId: string | null;
  projectId: string | null;
  workCaseId: string | null;
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
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Record<string, keyof typeof phaseLabels>>({});
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
            phase: selected[worklogId],
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

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-technical">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="work-case-panel"
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-16 w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-800">
            <BriefcaseBusiness className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-display text-lg font-bold text-slate-950">Organizar por trabajo</span>
            <span className="block text-sm text-slate-600">Relaciona bitácoras solo cuando formen parte del mismo trabajo.</span>
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded ? (
        <div id="work-case-panel" className="grid gap-6 border-t border-slate-200 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,.9fr)]">
          <div className="grid content-start gap-4">
            <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-4 text-sm leading-6 text-slate-700">
              Terraqo no agrupa registros automáticamente. Selecciona los relacionados y confirma su fase. Las bitácoras permanecen independientes y auditables.
            </div>
            <label className="grid gap-2 text-sm font-semibold">
              Nombre del trabajo
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} className="h-11 rounded-md border bg-white px-3 font-normal" placeholder="Ej. Levantamiento topográfico del sector B" />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Descripción <span className="font-normal text-slate-500">(opcional)</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1200} className="min-h-24 rounded-md border bg-white px-3 py-3 font-normal" placeholder="Objetivo y alcance del trabajo documentado." />
            </label>
            <div className="grid gap-2">
              <span className="text-sm font-semibold">Bitácoras relacionadas</span>
              {available.length ? available.map((worklog) => {
                const checked = Boolean(selected[worklog.id]);
                const compatible = isCompatible(worklog);
                return (
                  <div key={worklog.id} className={`grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center ${!compatible ? "bg-slate-50 opacity-60" : "bg-white"}`}>
                    <label className="flex min-h-11 items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!compatible || submitting}
                        onChange={(event) => setSelected((current) => {
                          const next = { ...current };
                          if (event.target.checked) next[worklog.id] = "EXECUTION";
                          else delete next[worklog.id];
                          return next;
                        })}
                        className="mt-1 h-5 w-5"
                      />
                      <span>
                        <span className="block font-semibold text-slate-900">{worklog.title}</span>
                        <span className="block text-xs text-slate-500">{new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(new Date(worklog.occurredAt))}</span>
                      </span>
                    </label>
                    <select
                      aria-label={`Fase de ${worklog.title}`}
                      disabled={!checked || submitting}
                      value={selected[worklog.id] || "EXECUTION"}
                      onChange={(event) => setSelected((current) => ({ ...current, [worklog.id]: event.target.value as keyof typeof phaseLabels }))}
                      className="h-11 rounded-md border bg-white px-3 text-sm"
                    >
                      {Object.entries(phaseLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                );
              }) : <p className="rounded-xl border border-dashed p-4 text-sm text-slate-600">No hay bitácoras independientes disponibles.</p>}
            </div>
            <Button type="button" onClick={() => void createCase()} disabled={submitting || !selectedIds.length} className="min-h-11 sm:w-fit">
              <Link2 className="mr-2 h-4 w-4" /> Confirmar relaciones
            </Button>
          </div>

          <div className="grid content-start gap-3">
            <h3 className="font-display text-lg font-bold text-slate-950">Trabajos organizados</h3>
            {initialCases.length ? initialCases.map((workCase) => (
              <article key={workCase.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <h4 className="font-bold text-slate-950">{workCase.title}</h4>
                {workCase.description ? <p className="mt-1 text-sm leading-6 text-slate-600">{workCase.description}</p> : null}
                <ul className="mt-3 grid gap-2">
                  {workCase.records.map((record) => (
                    <li key={record.id} className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-900">{record.worklog.title}</span>
                        <span className="block text-xs text-slate-500">{record.phase ? phaseLabels[record.phase] : "Sin fase"}</span>
                      </span>
                      <button type="button" disabled={submitting} onClick={() => void removeRecord(workCase, record.worklogId)} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700" aria-label={`Desvincular ${record.worklog.title}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </article>
            )) : <p className="rounded-xl border border-dashed p-4 text-sm text-slate-600">Todavía no organizaste bitácoras en un trabajo.</p>}
          </div>
          <p role="status" aria-live="polite" className="text-sm font-medium text-slate-700 lg:col-span-2">{message}</p>
        </div>
      ) : null}
    </section>
  );
}
