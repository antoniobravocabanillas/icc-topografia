"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Source = {
  sourceId: string;
  revisionId: string;
  fields: Partial<Record<"title" | "summary" | "outcome" | "contributionRole" | "responsibilities" | "methods" | "tools" | "occurredAt" | "locationLabel", unknown>>;
};
const labels: Record<keyof Source["fields"], string> = { title: "Trabajo", summary: "Descripción", outcome: "Resultado declarado", contributionRole: "Participación declarada", responsibilities: "Responsabilidades declaradas", methods: "Métodos", tools: "Herramientas", occurredAt: "Fecha del trabajo", locationLabel: "Ubicación" };
const valueText = (value: unknown): string => typeof value === "string" ? value : Array.isArray(value) ? value.filter(item => typeof item === "string").join(", ") : "";

export function DiscoveryEvaluationSource({ dossierId, sourceId, revisionId, onClose, onUnavailable }: { dossierId: string; sourceId: string; revisionId: string; onClose: () => void; onUnavailable: () => void }) {
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let retired = false;
    let controller: AbortController | null = null;
    async function load() {
      controller?.abort();
      controller = new AbortController();
      const request = controller;
      setSource(null);
      setError(null);
      setLoading(true);
      try {
        const response = await fetch(`/api/v1/evaluation-dossiers/${encodeURIComponent(dossierId)}/sources/${encodeURIComponent(sourceId)}`, { cache: "no-store", signal: request.signal });
        if (retired || request.signal.aborted) return;
        if (response.status === 410 || response.status === 404) { onUnavailable(); return; }
        if (!response.ok) throw new Error("No se pudo comprobar el acceso. Reintenta para abrir la fuente.");
        const body = await response.json() as { data?: Source };
        if (retired || request.signal.aborted) return;
        // Never show a different revision as support for a pinned assertion.
        if (!body.data || body.data.sourceId !== sourceId || body.data.revisionId !== revisionId) { onUnavailable(); return; }
        setSource(body.data);
      } catch {
        if (!retired && !request.signal.aborted) setError("No se pudo comprobar el acceso. Reintenta para abrir la fuente.");
      } finally {
        if (!retired && !request.signal.aborted) setLoading(false);
      }
    }
    const refresh = () => { if (!document.hidden) void load(); else { controller?.abort(); setSource(null); } };
    void load();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => { retired = true; controller?.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [dossierId, sourceId, revisionId, attempt, onUnavailable]);

  return <section id="evaluation-source-viewer" tabIndex={-1} aria-label="Detalle de fuente y versión" aria-busy={loading} className="scroll-mt-6 rounded-xl border border-[#36516b] bg-[#0b1d2e] p-4 focus:outline-none focus:ring-2 focus:ring-sky-300">
    <div className="flex items-start justify-between gap-3"><h4 className="font-bold text-white">Fuente y versión consultada</h4><Button type="button" variant="ghost" className="min-h-11 min-w-11 text-slate-200 hover:bg-slate-800 hover:text-white" aria-label="Cerrar fuente" onClick={onClose}><X className="h-4 w-4" aria-hidden /></Button></div>
    {loading ? <p role="status" className="flex items-center gap-2 text-sm text-slate-300"><LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />Comprobando autorización…</p> : null}
    {error ? <div role="alert"><p className="text-sm text-amber-200">{error}</p><Button type="button" variant="outline" className="mt-3 min-h-11 border-slate-600 bg-slate-800 text-white" onClick={() => setAttempt(value => value + 1)}><RotateCcw className="h-4 w-4" aria-hidden />Reintentar fuente</Button></div> : null}
    {source ? <><p className="mt-2 break-all text-xs text-sky-300">Versión exacta: {source.revisionId}</p><dl className="mt-4 space-y-4">{(Object.keys(labels) as Array<keyof Source["fields"]>).map(key => { const text = valueText(source.fields[key]); return text ? <div key={key}><dt className="text-xs font-semibold text-slate-400">{labels[key]}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-100">{text}</dd></div> : null; })}</dl><p className="mt-4 text-xs leading-5 text-slate-400">Solo se muestran los campos autorizados de esta versión. Su contenido requiere revisión humana.</p></> : null}
  </section>;
}
