"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Search } from "lucide-react";

export type WorklogContinuityOption = {
  id: string;
  title: string;
  occurredAt: string;
  workspaceId: string | null;
  projectId: string | null;
  hasNext: boolean;
};

export function WorklogContinuityControl({
  worklogId,
  previousWorklogId,
  options,
}: {
  worklogId: string;
  previousWorklogId: string | null;
  options: WorklogContinuityOption[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(previousWorklogId || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return options.filter((item) => {
      const eligible = item.id !== worklogId && (!item.hasNext || item.id === previousWorklogId);
      const matches = !normalized || `${item.title} ${item.id}`.toLocaleLowerCase("es").includes(normalized);
      return eligible && (matches || item.id === value);
    });
  }, [options, previousWorklogId, query, value, worklogId]);

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/terraqo/worklog", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          worklogId,
          previousWorklogId: value || null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          payload?.error?.message || "No pudimos enlazar las bitacoras.",
        );
      setMessage(value ? "Bitacoras enlazadas." : "Enlace eliminado.");
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
    <div className="mt-5 border-t pt-4">
      <label className="flex items-center gap-2 text-xs font-bold text-[#35485b]">
        <Link2 className="h-4 w-4 text-primary" /> Continuidad del trabajo
      </label>
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
          <option value="">Sin registro anterior</option>
          {filtered.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} ·{" "}
              {new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(
                new Date(item.occurredAt),
              )} · ID {item.id}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={busy || value === (previousWorklogId || "")}
          className="h-10 rounded-md bg-primary px-4 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy ? "Guardando…" : "Enlazar"}
        </button>
      </div>
      {query && !filtered.length ? <p className="mt-2 text-xs text-muted-foreground">No hay registros disponibles que coincidan con “{query}”.</p> : null}
      {message ? (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
