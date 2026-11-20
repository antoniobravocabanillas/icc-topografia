"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileCheck2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "./closure-reference-picker.module.css";
import { ClosureReferencePreview } from "./closure-reference-preview";

export type ClosureReferenceSource = {
  worklogRevisionId: string;
  accessKind: "PUBLIC_CV" | "PUBLIC_SELECTION";
  accessReferenceId: string;
};

export type ClosureReferenceCandidate = {
  source: ClosureReferenceSource;
  fields: { title?: string; summary?: string; outcome?: string; contributionRole?: string;
    responsibilities?: string | string[]; methods?: string[]; tools?: string[] };
};

export function closureReferenceKey(source: ClosureReferenceSource) {
  return JSON.stringify([source.worklogRevisionId, source.accessKind, source.accessReferenceId]);
}

export function ClosureReferencePicker({ collaborationId, selected, selectedTitles = {}, onChange, disabled = false }: {
  collaborationId: string;
  selected: ClosureReferenceSource[];
  selectedTitles?: Record<string, string>;
  onChange: (sources: ClosureReferenceSource[]) => void;
  disabled?: boolean;
}) {
  const [items, setItems] = useState<ClosureReferenceCandidate[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const request = useRef<AbortController | null>(null);
  const lastCursor = useRef<string | null>(null);

  const load = useCallback(async (after: string | null = null) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    lastCursor.current = after;
    setLoading(true);
    setError(false);
    try {
      const query = new URLSearchParams({ view: "workspace", limit: "20" });
      if (after) query.set("cursor", after);
      const response = await fetch(`/api/v1/collaborations/${encodeURIComponent(collaborationId)}/closure-references?${query}`, {
        cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) {
        if ([401, 403, 404, 410].includes(response.status) && !controller.signal.aborted) {
          setItems([]);
          setCursor(null);
        }
        throw new Error("References unavailable");
      }
      const body = await response.json() as { data?: { items?: ClosureReferenceCandidate[]; nextCursor?: string | null } };
      if (!Array.isArray(body.data?.items)) throw new Error("Invalid references");
      if (controller.signal.aborted) return;
      const rows = body.data.items;
      setItems(current => {
        const unique = new Map((after ? current : []).map(item => [closureReferenceKey(item.source), item]));
        for (const item of rows) unique.set(closureReferenceKey(item.source), item);
        return [...unique.values()];
      });
      setCursor(body.data.nextCursor || null);
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [collaborationId]);

  useEffect(() => { void load(); return () => request.current?.abort(); }, [load]);

  function toggle(source: ClosureReferenceSource) {
    if (disabled) return;
    const key = closureReferenceKey(source);
    const exists = selected.some(item => closureReferenceKey(item) === key);
    if (exists) onChange(selected.filter(item => closureReferenceKey(item) !== key));
    else {
      // One exact publication root per revision. Choosing a narrower root never
      // silently combines permissions with another exposure of the same evidence.
      const next = selected.filter(item => item.worklogRevisionId !== source.worklogRevisionId);
      if (next.length < 30) onChange([...next, source]);
    }
  }

  return <div aria-busy={loading} className={styles.picker} data-testid="closure-reference-picker">
    <p>{selected.length ? `${selected.length} ${selected.length === 1 ? "referencia seleccionada" : "referencias seleccionadas"}` : "Selecciona las evidencias que respaldan este cierre."}</p>
    {selected.length ? <div className={styles.selected}>{selected.map(source => {
      const key = closureReferenceKey(source);
      const title = items.find(item => closureReferenceKey(item.source) === key)?.fields.title || selectedTitles[key] || "Referencia autorizada";
      return <Button key={key} type="button" variant="outline" disabled={disabled} onClick={() => toggle(source)} aria-label={`Quitar ${title}`}><span className="min-w-0 break-words">{title}</span><X aria-hidden className="h-4 w-4 shrink-0" /></Button>;
    })}</div> : null}
    <p className={styles.help}>Solo puedes añadir evidencia con autorización pública vigente. La selección no cambia sus permisos.</p>
    {error ? <div role="alert"><p>No se pudieron cargar las evidencias. Tu selección se conserva.</p><Button type="button" variant="outline" onClick={() => void load(lastCursor.current)} disabled={loading}><RotateCcw aria-hidden className="h-4 w-4" />Reintentar evidencias</Button></div> : null}
    {!loading && !error && !items.length ? <p>{cursor ? "Todavía hay selecciones por consultar. Continúa para ver sus referencias disponibles." : "No hay evidencia pública autorizada para añadir a este cierre."}</p> : null}
    <ul className={styles.list}>
      {items.map(item => {
        const key = closureReferenceKey(item.source);
        const checked = selected.some(source => closureReferenceKey(source) === key);
        const full = selected.length >= 30 && !selected.some(source => source.worklogRevisionId === item.source.worklogRevisionId);
        const title = item.fields.title || "Referencia autorizada";
        return <li key={key} className={styles.item}>
          <label className={styles.choice}>
            <input type="checkbox" checked={checked} disabled={disabled || full} onChange={() => toggle(item.source)} aria-label={`Añadir ${title} · ${item.source.accessKind === "PUBLIC_CV" ? "CV público" : "Selección autorizada"}`} className="mt-1 h-5 w-5 shrink-0 accent-blue-500" />
            <span><span className={styles.title}>{title}</span><span className={styles.kind}>{item.source.accessKind === "PUBLIC_CV" ? "CV público" : "Selección autorizada"}</span></span>
            <FileCheck2 aria-hidden className="ml-auto h-5 w-5 shrink-0" />
          </label>
          <div className={styles.details}><ClosureReferencePreview compact collaborationId={collaborationId} source={item.source} revisionId={item.source.worklogRevisionId} title={item.fields.title} mode="workspace" /></div>
        </li>;
      })}
    </ul>
    {loading ? <p role="status">Cargando evidencias…</p> : cursor && !error ? <Button type="button" variant="outline" onClick={() => void load(cursor)}>Ver más evidencias</Button> : null}
    {selected.length >= 30 ? <p role="status">Puedes añadir hasta 30 referencias por cierre.</p> : null}
  </div>;
}
