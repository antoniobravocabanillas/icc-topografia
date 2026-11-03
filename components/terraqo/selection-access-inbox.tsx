"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = { id: string; version: number; collectionVersion: number | null; message: string | null; requester: { name: string | null }; collection: { version: number; title: string; items: { allowedFields: string[]; includeMedia: boolean; mediaIds: string[] }[] } | null };
export function SelectionAccessInbox({ requests }: { requests: Item[] }) {
  return <section className="space-y-4 rounded-xl border border-[#294057] bg-[#07111e] p-5 text-white"><h2 className="text-xl font-semibold text-white">Solicitudes de acceso</h2>
    <p className="text-sm text-slate-300">La aprobación comparte únicamente la selección indicada, no el registro original completo.</p>
    {!requests.length ? <p className="text-sm text-slate-400">No hay solicitudes pendientes.</p> : requests.map(item => <RequestCard key={`${item.id}:${item.version}:${item.collection?.version}`} item={item} />)}
  </section>;
}
const fieldLabels: Record<string, string> = { title: "Título", summary: "Resumen", result: "Resultado", responsibilities: "Responsabilidades", locationLabel: "Lugar", occurredAt: "Fecha", methods: "Métodos", tools: "Herramientas" };
function RequestCard({ item }: { item: Item }) {
  const router = useRouter();
  const scopeChanged = item.collectionVersion !== item.collection?.version;
  const [scopeConfirmed, setScopeConfirmed] = useState(false);
  const [expiry, setExpiry] = useState("");
  const [download, setDownload] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [resolved, setResolved] = useState(false);
  async function decide(decision: "APPROVED" | "DECLINED") {
    if (busy || resolved) return;
    setBusy(true); setStatus("Guardando decisión…");
    try {
      const payload = { requestId: item.id, expectedVersion: item.version, decision, ...(decision === "APPROVED" ? { confirmed, expectedCollectionVersion: item.collection?.version, scopeChangeConfirmed: scopeConfirmed, allowDownload: download, expiresAt: new Date(expiry).toISOString() } : {}) };
      const response = await fetch("/api/v1/selection-access-requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "No pudimos guardar la decisión.");
      setResolved(true); setStatus(decision === "APPROVED" ? "Acceso concedido." : "Solicitud rechazada. No se concedió acceso."); router.refresh();
    } catch (error) { setStatus(error instanceof Error ? error.message : "No pudimos guardar la decisión."); }
    finally { setBusy(false); }
  }
  return <article className="space-y-4 rounded-xl border border-[#294057] bg-[#101d2d] p-5">
    <h3 className="text-lg font-semibold text-white">{item.requester.name || "Usuario registrado"} · {item.collection?.title}</h3>
    {item.message ? <p className="whitespace-pre-line text-sm text-slate-300">{item.message}</p> : null}
    <p className="text-sm text-slate-300">{item.collection?.items.length || 0} registros con sus campos seleccionados.</p>
    <ul className="space-y-2 text-sm text-slate-300">{item.collection?.items.map((record, index) => <li key={index}>Registro {index + 1}: {record.allowedFields.map(field => fieldLabels[field] || field).join(", ") || "Sin campos de texto"}{record.includeMedia ? ` · ${record.mediaIds.length} adjuntos incluidos` : " · Sin adjuntos"}</li>)}</ul>
    {scopeChanged ? <div className="rounded-lg border border-amber-700 bg-amber-950/30 p-4 text-sm text-amber-100"><p>La selección cambió desde que se solicitó el acceso. Revisa los campos y adjuntos indicados arriba.</p><label className="mt-3 flex min-h-11 items-center gap-3"><input type="checkbox" checked={scopeConfirmed} onChange={event => setScopeConfirmed(event.target.checked)} disabled={busy || resolved} />He revisado el alcance actualizado</label></div> : null}
    <label className="grid gap-2 text-sm text-slate-300">Acceso hasta (hora de este dispositivo)<input type="datetime-local" value={expiry} onChange={event => setExpiry(event.target.value)} disabled={busy || resolved} className="min-h-11 min-w-0 rounded-lg border border-[#355471] bg-[#07111e] px-3 text-base text-white" /></label>
    <label className="flex min-h-11 items-center gap-3 text-sm text-slate-300"><input type="checkbox" checked={download} onChange={event => setDownload(event.target.checked)} disabled={busy || resolved || !item.collection?.items.some(record => record.includeMedia && record.mediaIds.length)} />Permitir descargar los adjuntos incluidos</label>
    <label className="flex min-h-11 items-center gap-3 text-sm text-slate-300"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy || resolved} />Confirmo el acceso a esta selección y su vigencia</label>
    <div className="flex flex-wrap gap-3"><button type="button" onClick={() => void decide("APPROVED")} disabled={busy || resolved || !confirmed || !expiry || (scopeChanged && !scopeConfirmed)} className="min-h-11 rounded-lg bg-[#2869c7] px-4 text-sm text-white disabled:opacity-50">Conceder acceso</button><button type="button" onClick={() => void decide("DECLINED")} disabled={busy || resolved} className="min-h-11 rounded-lg border border-[#355471] px-4 text-sm text-slate-300">Rechazar</button></div>
    <p role="status" className="text-sm text-slate-300">{status}</p>
  </article>;
}
