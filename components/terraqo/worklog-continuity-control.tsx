"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Link2, Search, Unlink2 } from "lucide-react";

export type WorklogContinuityOption = {
  id: string;
  title: string;
  occurredAt: string;
  workspaceId: string | null;
  projectId: string | null;
  previousWorklogId: string | null;
  hasNext: boolean;
};

export function WorklogContinuityControl({
  worklogId,
  occurredAt,
  previousWorklogId,
  nextWorklogId,
  options,
}: {
  worklogId: string;
  occurredAt: string;
  previousWorklogId: string | null;
  nextWorklogId: string | null;
  options: WorklogContinuityOption[];
}) {
  const router = useRouter();
  const initialValue = previousWorklogId || nextWorklogId || "";
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => setValue(initialValue), [initialValue]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return options.filter((item) => {
      const matches = !normalized || `${item.title} ${item.id}`.toLocaleLowerCase("es").includes(normalized);
      return item.id !== worklogId && (matches || item.id === value);
    });
  }, [options, query, value, worklogId]);
  const selected = options.find((item) => item.id === value) || null;
  const previous = options.find((item) => item.id === previousWorklogId) || null;
  const next = options.find((item) => item.id === nextWorklogId) || null;
  const dirty = value !== initialValue;

  async function save(nextValue = value) {
    setBusy(true);
    setMessage("");
    try {
      const nextSelection = options.find((item) => item.id === nextValue);
      const selectedIsLater = nextSelection && new Date(nextSelection.occurredAt).getTime() > new Date(occurredAt).getTime();
      const targetWorklogId = selectedIsLater ? nextSelection.id : worklogId;
      const targetPreviousId = selectedIsLater ? worklogId : nextValue || null;
      const unlinkWorklogId = !nextValue && nextWorklogId && !previousWorklogId ? nextWorklogId : worklogId;
      const response = await fetch("/api/terraqo/worklog", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          worklogId: nextValue ? targetWorklogId : unlinkWorklogId,
          previousWorklogId: nextValue ? targetPreviousId : null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          payload?.error?.message || "No pudimos enlazar las bitacoras.",
        );
      setValue(nextValue);
      setMessage(nextValue ? "Secuencia actualizada y ordenada por fecha." : "Vínculo eliminado.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No pudimos guardar el enlace.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 border-t pt-4" aria-labelledby={`continuity-${worklogId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
      <label id={`continuity-${worklogId}`} className="flex items-center gap-2 text-xs font-bold text-[#35485b]">
        <Link2 className="h-4 w-4 text-primary" /> Continuidad del trabajo
      </label>
        {initialValue ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Vínculo activo
          </span>
        ) : null}
      </div>

      {previous || next ? (
        <div className="mt-3 rounded-lg border border-[#d8e0ec] bg-[#f7f9fc] p-3" aria-label="Secuencia vinculada actual">
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#607083]">Secuencia actual</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#35485b]">
            {previous ? <span className="rounded-md bg-white px-2.5 py-1.5 shadow-sm">{previous.title}</span> : null}
            {previous ? <ArrowRight className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> : null}
            <span className="rounded-md border border-primary/25 bg-primary/10 px-2.5 py-1.5 text-primary">Esta bitácora</span>
            {next ? <ArrowRight className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> : null}
            {next ? <span className="rounded-md bg-white px-2.5 py-1.5 shadow-sm">{next.title}</span> : null}
          </div>
        </div>
      ) : null}
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por título o ID del registro"
          className="h-11 w-full rounded-md border bg-white pl-9 pr-3 text-sm"
        />
      </div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <select
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-10 min-w-0 flex-1 rounded-md border bg-white px-3 text-xs"
        >
          <option value="">Sin registro vinculado</option>
          {filtered.map((item) => (
            <option key={item.id} value={item.id}>
              {new Date(item.occurredAt).getTime() < new Date(occurredAt).getTime() ? "Anterior" : "Posterior"} · {item.title} ·{" "}
              {new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(
                new Date(item.occurredAt),
              )}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => save()}
          disabled={busy || !dirty}
          aria-busy={busy}
          className="min-h-11 rounded-md bg-primary px-4 text-xs font-bold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-[#dbe3ee] disabled:text-[#607083] disabled:opacity-100"
        >
          {busy ? "Guardando…" : !dirty && initialValue ? "Vínculo guardado" : !dirty ? "Selecciona un registro" : value ? "Guardar vínculo" : "Desvincular"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs leading-5 text-muted-foreground">Puedes elegir cualquier registro de la misma obra. Terraqo reunirá la cadena completa y la ordenará por fecha.</p>
        {initialValue ? (
          <button type="button" onClick={() => save("")} disabled={busy} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-[#b42318] transition hover:bg-[#fff1f0] disabled:opacity-50">
            <Unlink2 className="h-3.5 w-3.5" aria-hidden="true" /> Quitar vínculo actual
          </button>
        ) : null}
      </div>
      {selected && dirty ? <p className="mt-2 text-xs font-semibold text-primary">Se ordenará junto con “{selected.title}” al guardar.</p> : null}
      {query && !filtered.length ? <p className="mt-2 text-xs text-muted-foreground">No hay registros disponibles que coincidan con “{query}”.</p> : null}
      {message ? (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {message}
        </p>
      ) : null}
    </section>
  );
}
