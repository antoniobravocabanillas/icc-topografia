"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CheckCircle2, Clock3, LoaderCircle, MessageSquareText, Send, ShieldAlert, UserCheck, XCircle } from "lucide-react";

const aspects = [
  ["title", "Título"], ["summary", "Descripción"], ["outcome", "Resultado"],
  ["contributionRole", "Rol"], ["responsibilities", "Responsabilidades"],
  ["methods", "Métodos"], ["tools", "Herramientas"], ["occurredAt", "Fecha"],
  ["locationLabel", "Lugar"],
] as const;
type Aspect = (typeof aspects)[number][0];
type Decision = "CONFIRMED" | "UNABLE_TO_CONFIRM" | "CHANGES_REQUESTED";
type Revision = { id: string; title: string; summary: string; revisionNo: number; occurredAt: string; contentHash: string };
type RequestItem = {
  id: string;
  requesterId: string;
  reviewerUserId: string | null;
  reviewerEmail: string | null;
  relationshipLabel: string;
  requestedScope: string[];
  revisionHash: string;
  status: string;
  version: number;
  expiresAt: string;
  sentAt: string | null;
  revision: Revision;
  requester: { id: string; name: string | null; image: string | null };
  reviewerUser: { id: string; name: string | null; email: string; image: string | null } | null;
  organization: { id: string; name: string; brandName: string | null; logoUrl: string | null } | null;
  decisions: Array<{ id: string; responses: unknown; summaryComment: string | null; decidedAt: string; reviewer: { name: string | null } }>;
};

function key() { return crypto.randomUUID(); }
async function api(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "No se pudo completar la operación.");
  return payload.data;
}

const statusLabels: Record<string, string> = {
  DRAFT: "Borrador", PENDING: "Pendiente", IN_REVIEW: "En revisión", PARTIAL: "Parcial",
  CHANGES_REQUESTED: "Requiere aclaración", DECLINED: "No confirmado", CONFIRMED: "Confirmado",
  EXPIRED: "Caducado", CANCELLED: "Cancelado", REVOKED: "Revocado",
};

export function EndorsementConsole({ currentUserId, revisions, requests }: { currentUserId: string; revisions: Revision[]; requests: RequestItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [revisionId, setRevisionId] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [expiry, setExpiry] = useState("");
  const [scope, setScope] = useState<Aspect[]>([]);
  const [sendNow, setSendNow] = useState(false);
  const [answers, setAnswers] = useState<Record<string, Record<string, { decision?: Decision; comment: string }>>>({});
  const [summary, setSummary] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const selectedRevision = useMemo(() => revisions.find((revision) => revision.id === revisionId), [revisionId, revisions]);

  function run(action: () => Promise<void>) {
    setNotice(null);
    startTransition(async () => {
      try { await action(); router.refresh(); }
      catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : "Ocurrió un error inesperado." }); }
    });
  }

  const canCreate = Boolean(selectedRevision && reviewerEmail && relationship.trim().length >= 3 && expiry && scope.length);

  return <div className="space-y-8">
    {notice ? <div role="status" className={`rounded-xl border px-4 py-3 text-sm font-semibold ${notice.error ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>{notice.text}</div> : null}
    <section className="overflow-hidden rounded-2xl border bg-white shadow-technical">
      <div className="border-b bg-gradient-to-r from-[#071c2d] via-[#0a354d] to-[#0c5b62] p-6 text-white sm:p-8">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">Nueva solicitud</p>
        <h2 className="mt-2 font-display text-2xl font-bold">Pide respaldo sobre una versión inmutable</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Elige evidencia, persona, relación y aspectos concretos. Guardar como borrador no envía la solicitud.</p>
      </div>
      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_22rem] sm:p-7">
        <div className="space-y-5">
          <label className="block text-sm font-bold">Versión de evidencia
            <select value={revisionId} onChange={(event) => setRevisionId(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border bg-white px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
              <option value="">Selecciona una versión</option>{revisions.map((revision) => <option key={revision.id} value={revision.id}>{revision.title} · v{revision.revisionNo}</option>)}
            </select>
          </label>
          {selectedRevision ? <div className="rounded-xl border border-primary/20 bg-primary/[0.035] p-4"><div className="flex items-center justify-between gap-3"><strong>{selectedRevision.title}</strong><span className="font-mono text-[10px] text-slate-500">{selectedRevision.contentHash.slice(0, 12)}</span></div><p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{selectedRevision.summary}</p></div> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold">Correo del revisor<input type="email" value={reviewerEmail} onChange={(event) => setReviewerEmail(event.target.value)} placeholder="supervisor@empresa.com" className="mt-2 min-h-11 w-full rounded-lg border px-3 font-normal outline-none focus:border-primary" /></label>
            <label className="text-sm font-bold">Relación profesional<input value={relationship} onChange={(event) => setRelationship(event.target.value)} placeholder="Supervisor directo" maxLength={120} className="mt-2 min-h-11 w-full rounded-lg border px-3 font-normal outline-none focus:border-primary" /></label>
          </div>
          <label className="block text-sm font-bold">Vigencia<input type="datetime-local" value={expiry} onChange={(event) => setExpiry(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border px-3 font-normal outline-none focus:border-primary" /></label>
          <fieldset><legend className="text-sm font-bold">Aspectos que podrá revisar</legend><p className="mt-1 text-xs text-slate-500">No hay respuestas ni aspectos preseleccionados.</p><div className="mt-3 flex flex-wrap gap-2">{aspects.map(([value, label]) => <label key={value} className={`cursor-pointer rounded-full border px-3 py-2 text-xs font-semibold ${scope.includes(value) ? "border-primary bg-primary text-white" : "bg-white hover:border-primary/40"}`}><input type="checkbox" className="sr-only" checked={scope.includes(value)} onChange={() => setScope((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} />{label}</label>)}</div></fieldset>
        </div>
        <aside className="h-fit rounded-xl border bg-slate-50 p-5 lg:sticky lg:top-24">
          <MessageSquareText className="h-6 w-6 text-primary" /><h3 className="mt-3 font-display text-lg font-bold">Confirmación previa</h3>
          <dl className="mt-4 space-y-3 text-sm"><div><dt className="text-slate-500">Persona</dt><dd className="font-semibold">{reviewerEmail || "Sin elegir"}</dd></div><div><dt className="text-slate-500">Relación</dt><dd className="font-semibold">{relationship || "Sin indicar"}</dd></div><div><dt className="text-slate-500">Alcance</dt><dd className="font-semibold">{scope.length ? `${scope.length} aspectos` : "Sin elegir"}</dd></div></dl>
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-3 text-sm"><input type="checkbox" checked={sendNow} onChange={(event) => setSendNow(event.target.checked)} className="mt-1 h-4 w-4 accent-primary" /><span><strong>{sendNow ? "Enviar al crear" : "Guardar como borrador"}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{sendNow ? "La solicitud quedará pendiente de revisión." : "No se notificará al revisor."}</span></span></label>
          <button disabled={!canCreate || pending} onClick={() => run(async () => { await api("/api/v1/endorsement-requests", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key() }, body: JSON.stringify({ revisionId, reviewerEmail, relationshipLabel: relationship.trim(), requestedScope: scope, expiresAt: new Date(expiry).toISOString(), sendNow }) }); setRevisionId(""); setReviewerEmail(""); setRelationship(""); setExpiry(""); setScope([]); setSendNow(false); setNotice({ error: false, text: sendNow ? "Solicitud enviada con alcance fijo." : "Borrador guardado sin enviar." }); })} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-45">{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : sendNow ? <Send className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}{sendNow ? "Crear y enviar" : "Guardar borrador"}</button>
        </aside>
      </div>
    </section>

    <section><div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Historial verificable</p><h2 className="mt-1 font-display text-2xl font-bold">Solicitudes y revisiones</h2></div><span className="text-sm text-slate-500">{requests.length} registros</span></div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">{requests.map((request) => {
        const incoming = request.requesterId !== currentUserId;
        const actionable = incoming && ["PENDING", "IN_REVIEW"].includes(request.status) && new Date(request.expiresAt) > new Date();
        const requestAnswers = answers[request.id] || {};
        const complete = request.requestedScope.every((field) => requestAnswers[field]?.decision && (requestAnswers[field].decision !== "CHANGES_REQUESTED" || requestAnswers[field].comment.trim()));
        return <article key={request.id} className="rounded-2xl border bg-white p-5 shadow-technical sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{incoming ? "Para revisar" : "Solicitada por ti"}</p><h3 className="mt-1 font-display text-xl font-bold">{request.revision.title}</h3><p className="mt-1 text-sm text-slate-500">{request.relationshipLabel} · v{request.revision.revisionNo}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${request.status === "CONFIRMED" ? "bg-emerald-100 text-emerald-800" : request.status === "CHANGES_REQUESTED" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>{statusLabels[request.status] || request.status}</span></div>
          <div className="mt-4 rounded-lg border bg-slate-50 p-3 text-sm"><p className="line-clamp-3 leading-6 text-slate-600">{request.revision.summary}</p><p className="mt-2 font-mono text-[10px] text-slate-400">Huella {request.revisionHash.slice(0, 16)}</p></div>
          {actionable ? <div className="mt-5 space-y-4 border-t pt-5"><p className="text-sm font-bold">Responde cada aspecto</p>{request.requestedScope.map((field) => {
            const answer = requestAnswers[field] || { comment: "" };
            return <fieldset key={field} className="rounded-xl border p-4"><legend className="px-1 text-sm font-bold">{aspects.find(([value]) => value === field)?.[1] || field}</legend><div className="mt-2 grid gap-2 sm:grid-cols-3">{[["CONFIRMED", "Confirmar", CheckCircle2], ["UNABLE_TO_CONFIRM", "No puedo", XCircle], ["CHANGES_REQUESTED", "Aclarar", ShieldAlert]].map(([value, label, Icon]) => <label key={value as string} className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-xs font-semibold ${answer.decision === value ? "border-primary bg-primary text-white" : "bg-white"}`}><input type="radio" name={`${request.id}-${field}`} className="sr-only" checked={answer.decision === value} onChange={() => setAnswers((current) => ({ ...current, [request.id]: { ...(current[request.id] || {}), [field]: { ...answer, decision: value as Decision } } }))} /><Icon className="mx-auto mb-1 h-4 w-4" />{label as string}</label>)}</div>{answer.decision === "CHANGES_REQUESTED" ? <textarea value={answer.comment} onChange={(event) => setAnswers((current) => ({ ...current, [request.id]: { ...(current[request.id] || {}), [field]: { ...answer, comment: event.target.value } } }))} placeholder="Indica qué debe aclararse" maxLength={1200} rows={2} className="mt-3 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" /> : null}</fieldset>;
          })}<textarea value={summary[request.id] || ""} onChange={(event) => setSummary((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Comentario general opcional" maxLength={1200} rows={2} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" /><button disabled={!complete || pending} onClick={() => run(async () => { await api(`/api/v1/endorsement-requests/${request.id}/decisions`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key() }, body: JSON.stringify({ expectedVersion: request.version, responses: request.requestedScope.map((field) => ({ field, decision: requestAnswers[field].decision, comment: requestAnswers[field].comment || undefined })), summaryComment: summary[request.id] || undefined }) }); setNotice({ error: false, text: "Revisión registrada sobre la versión solicitada." }); })} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-45"><UserCheck className="h-4 w-4" /> Registrar revisión</button></div> : null}
          {!incoming && !["REVOKED", "CANCELLED", "EXPIRED"].includes(request.status) ? <button disabled={pending} onClick={() => run(async () => { await api(`/api/v1/endorsement-requests/${request.id}/decisions`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: request.version }) }); setNotice({ error: false, text: "Solicitud revocada; el historial de decisiones se conserva." }); })} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-xs font-bold text-red-700 hover:bg-red-50">Revocar solicitud</button> : null}
          {!incoming && request.status === "DRAFT" ? <button disabled={pending} onClick={() => run(async () => { await api(`/api/v1/endorsement-requests/${request.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: request.version }) }); setNotice({ error: false, text: "Solicitud enviada; el alcance y la versión quedaron fijados." }); })} className="ml-2 mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-bold text-white hover:bg-primary/90"><Send className="h-4 w-4" /> Enviar borrador</button> : null}
          {request.decisions.length ? <div className="mt-4 border-t pt-4 text-sm"><div className="flex items-center gap-2 font-bold text-emerald-800"><BadgeCheck className="h-4 w-4" /> Decisión registrada</div>{request.decisions[0].summaryComment ? <p className="mt-2 leading-6 text-slate-600">{request.decisions[0].summaryComment}</p> : null}</div> : null}
        </article>;
      })}{!requests.length ? <div className="rounded-2xl border border-dashed bg-white p-10 text-center xl:col-span-2"><UserCheck className="mx-auto h-7 w-7 text-slate-400" /><h3 className="mt-3 font-display text-lg font-bold">Sin solicitudes todavía</h3><p className="mt-2 text-sm text-slate-500">Cuando pidas o recibas un respaldo aparecerá aquí.</p></div> : null}</div>
    </section>
  </div>;
}
