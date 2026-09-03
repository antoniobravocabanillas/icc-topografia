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
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return options.filter((item) => {
      const matches = !normalized || `${item.title} ${item.id}`.toLocaleLowerCase("es").includes(normalized);
      return item.id !== worklogId && (matches || item.id === value);
    });
  }, [options, query, value, worklogId]);

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const selected = options.find((item) => item.id === value);
      const selectedIsLater = selected && new Date(selected.occurredAt).getTime() > new Date(occurredAt).getTime();
      const targetWorklogId = selectedIsLater ? selected.id : worklogId;
      const targetPreviousId = selectedIsLater ? worklogId : value || null;
      const unlinkWorklogId = !value && nextWorklogId ? nextWorklogId : worklogId;
      const response = await fetch("/api/terraqo/worklog", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          worklogId: value ? targetWorklogId : unlinkWorklogId,
          previousWorklogId: value ? targetPreviousId : null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          payload?.error?.message || "No pudimos enlazar las bitacoras.",
        );
      setMessage(value ? "Bitácoras enlazadas en orden cronológico." : "Enlace eliminado.");
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
          <option value="">Sin registro vinculado</option>
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
          disabled={busy || value === initialValue}
          className="h-10 rounded-md bg-primary px-4 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy ? "Guardando…" : "Enlazar"}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Puedes elegir una bitácora anterior o posterior; Terraqo ordenará la continuidad por fecha.</p>
      {query && !filtered.length ? <p className="mt-2 text-xs text-muted-foreground">No hay registros disponibles que coincidan con “{query}”.</p> : null}
      {message ? (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
