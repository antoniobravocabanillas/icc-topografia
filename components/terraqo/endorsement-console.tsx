"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BadgeCheck, Clock3, FileText, LoaderCircle, Send, UserCheck } from "lucide-react";
import { EndorsementReviewForm } from "./endorsement-review-form";

const aspects = [
  ["title", "Título"], ["summary", "Descripción"], ["outcome", "Resultado"],
  ["contributionRole", "Rol"], ["responsibilities", "Responsabilidades"],
  ["methods", "Métodos"], ["tools", "Herramientas"], ["occurredAt", "Fecha"],
  ["locationLabel", "Lugar"],
] as const;
type Aspect = (typeof aspects)[number][0];
export type EndorsementRevision = {
  id: string; revisionNo: number; contentHash: string; title?: string | null; summary?: string | null;
  outcome?: string | null; contributionRole?: string | null; responsibilities?: string[];
  methods?: string[]; tools?: string[];
  worklog?: { id: string; occurredAt?: string; locationLabel?: string | null };
  thumbnailMediaId?: string;
};
export type EndorsementRequestItem = {
  id: string; requesterId: string; reviewerUserId: string | null; reviewerEmail: string | null;
  relationshipLabel: string; requestedScope: string[]; revisionHash: string; status: string;
  version: number; expiresAt: string; sentAt: string | null; updatedAt?: string;
  revision: EndorsementRevision;
  requester: { id: string; name: string | null; image: string | null };
  reviewerUser: { id: string; name: string | null; email: string; image: string | null } | null;
  organization: { id: string; name: string; brandName: string | null; logoUrl: string | null } | null;
  decisions: Array<{ id: string; responses: unknown; summaryComment: string | null; decidedAt: string; reviewer: { name: string | null } }>;
};
const statusLabels: Record<string, string> = {
  DRAFT: "Borrador", PENDING: "Pendiente", IN_REVIEW: "En revisión", PARTIAL: "Parcial",
  CHANGES_REQUESTED: "Solicita cambios", DECLINED: "No confirmado", CONFIRMED: "Confirmado",
  EXPIRED: "Caducado", CANCELLED: "Cancelado", REVOKED: "Revocado",
};
const control = "mt-2 min-h-11 w-full min-w-0 rounded-lg border border-[#385873] bg-[#0b2033] px-3 text-sm font-normal text-white placeholder:text-[#adc2d6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#69b9ff] disabled:opacity-50";
const secondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#486a88] px-4 text-sm font-semibold text-[#e2edf8] hover:bg-[#18354e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#69b9ff] disabled:cursor-not-allowed disabled:opacity-50";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#316cce] px-4 text-sm font-semibold text-white hover:bg-[#245dbb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#69b9ff] disabled:cursor-not-allowed disabled:opacity-50";
function requestedValue(revision: EndorsementRevision, field: string) {
  const value = field === "occurredAt" ? revision.worklog?.occurredAt : field === "locationLabel" ? revision.worklog?.locationLabel : revision[field as keyof EndorsementRevision];
  if (Array.isArray(value)) return value.join(" · ");
  return typeof value === "string" ? value : null;
}
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "medium", timeStyle: "short" }) : "Fecha no disponible";
}
function OwnerThumbnail({ mediaId }: { mediaId?: string }) {
  const [failed, setFailed] = useState(false);
  if (!mediaId || failed) return <FileText aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[#79bdff]" />;
  // Native img preserves authenticated private evidence delivery and avoids image proxy caching.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/terraqo/worklog/evidence/${encodeURIComponent(mediaId)}`} alt="" width={96} height={72} onError={() => setFailed(true)} className="h-[72px] w-24 shrink-0 rounded-md object-cover" />;
}
async function api(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 429 ? "Aún no puedes reenviar. Espera 24 horas desde la última actualización e inténtalo de nuevo." : payload?.error?.message || "No se pudo completar la operación. Inténtalo de nuevo.");
  return payload.data;
}

export function EndorsementConsole({ currentUserId, revisions, requests, initialRevisionId }: { currentUserId: string; revisions: EndorsementRevision[]; requests: EndorsementRequestItem[]; initialRevisionId?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // A synchronous lock also blocks a second click before React renders pending.
  const inFlight = useRef(false);
  const operation = useRef<{ fingerprint: string; key: string } | null>(null);
  const [revisionId, setRevisionId] = useState(() => revisions.some(revision => revision.id === initialRevisionId) ? initialRevisionId! : "");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [expiry, setExpiry] = useState("");
  const [scope, setScope] = useState<Aspect[]>([]);
  const [sendNow, setSendNow] = useState(false);
  const [confirmedSend, setConfirmedSend] = useState<string | null>(null);
  const [confirmedDrafts, setConfirmedDrafts] = useState<Record<string, string>>({});
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [completed, setCompleted] = useState<Record<string, string>>({});
  const selectedRevision = useMemo(() => revisions.find(revision => revision.id === revisionId), [revisionId, revisions]);
  const expires = new Date(expiry).getTime();
  const validExpiry = Number.isFinite(expires) && expires > Date.now() + 3600000 && expires <= Date.now() + 30 * 86400000;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reviewerEmail.trim());
  const valid = Boolean(selectedRevision && validEmail && relationship.trim().length >= 3 && validExpiry && scope.length);
  const sendFingerprint = JSON.stringify([reviewerEmail, revisionId, relationship, expiry, scope]);

  function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setNotice(null);
    startTransition(async () => {
      try { await action(); router.refresh(); }
      catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : "Ocurrió un error inesperado." }); }
      finally { inFlight.current = false; }
    });
  }
  function create(send: boolean) {
    if (!valid || (send && confirmedSend !== sendFingerprint)) return;
    const payload = { revisionId, reviewerEmail: reviewerEmail.trim().toLowerCase(), relationshipLabel: relationship.trim(), requestedScope: scope, expiresAt: new Date(expiry).toISOString(), sendNow: send };
    const fingerprint = JSON.stringify(payload);
    // Retain the key after an uncertain response; changing the payload creates a new operation.
    if (operation.current?.fingerprint !== fingerprint) operation.current = { fingerprint, key: crypto.randomUUID() };
    const operationKey = operation.current.key;
    run(async () => {
      await api("/api/v1/endorsement-requests", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": operationKey }, body: JSON.stringify(payload) });
      operation.current = null;
      setRevisionId(""); setReviewerEmail(""); setRelationship(""); setExpiry(""); setScope([]); setSendNow(false); setConfirmedSend(null);
      setNotice({ error: false, text: send ? "Solicitud enviada con alcance fijo." : "Borrador guardado sin enviar. No se notificó al revisor." });
    });
  }

  return <div aria-busy={pending} className="s07-endorsements grid min-w-0 gap-6 rounded-2xl bg-[#061523] p-4 text-[#edf4fc] selection:bg-[#295b93] selection:text-white sm:p-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,1fr)] [&_input]:accent-[#69b9ff] [&_input]:[color-scheme:dark] [&_input]:caret-[#69b9ff]">
    {notice && <div data-testid="endorsement-notice" role={notice.error ? "alert" : "status"} className={`break-words rounded-lg border px-4 py-3 text-sm xl:col-span-2 ${notice.error ? "border-[#9d5764] bg-[#391e2b] text-[#ffd5dd]" : "border-[#41807a] bg-[#123835] text-[#ccf4e9]"}`}>{notice.text}</div>}
    <section aria-label="Solicitar respaldo" className="min-w-0 rounded-xl border border-[#294963] bg-[#091d2e] p-4 sm:p-6">
      {(selectedRevision?.worklog?.id || (revisions[0]?.worklog?.id && revisions.every(revision => revision.worklog?.id === revisions[0].worklog?.id))) && <Link href={`/portal/bitacora?registro=${encodeURIComponent(selectedRevision?.worklog?.id || revisions[0].worklog!.id)}#worklog-${encodeURIComponent(selectedRevision?.worklog?.id || revisions[0].worklog!.id)}`} className="mb-4 inline-flex min-h-11 items-center text-sm text-[#79bdff] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#69b9ff]">Volver al registro</Link>}
      <h1 className="font-display text-2xl font-semibold tracking-tight">Solicitar respaldo</h1>
      <p className="mt-2 text-sm leading-6 text-[#b2c9de]">Elige una versión y los aspectos concretos que revisará esta persona.</p>
      <form className="mt-6 space-y-5" onSubmit={event => { event.preventDefault(); create(true); }}>
        <fieldset disabled={pending} className="min-w-0 space-y-5">
          <label className="block text-sm font-semibold">Versión de evidencia
            <select required value={revisionId} onChange={event => { setRevisionId(event.target.value); setConfirmedSend(null); }} className={control}>
              <option value="">Selecciona una versión</option>{revisions.map(revision => <option key={revision.id} value={revision.id}>{revision.title || "Evidencia profesional"} · v{revision.revisionNo}</option>)}
            </select>
          </label>
          {!revisions.length && <p className="text-sm leading-6 text-[#b2c9de]">Aún no tienes versiones disponibles. Guarda un registro de trabajo antes de solicitar respaldo.</p>}
          {selectedRevision && <div className="flex min-w-0 items-start gap-3 border-y border-[#294963] py-4"><OwnerThumbnail key={selectedRevision.id} mediaId={selectedRevision.thumbnailMediaId} /><div className="min-w-0"><h3 className="break-words font-semibold">{selectedRevision.title || "Evidencia profesional"}</h3><p className="mt-1 text-sm text-[#b2c9de]">Versión {selectedRevision.revisionNo} · Contenido fijo</p><p className="mt-2 break-all font-mono text-xs text-[#b2c9de]">Huella {selectedRevision.contentHash.slice(0, 16)}</p></div></div>}
          <div className="grid min-w-0 gap-5 sm:grid-cols-2">
            <label className="block min-w-0 text-sm font-semibold">Correo del revisor<input required type="email" autoComplete="email" maxLength={254} value={reviewerEmail} onChange={event => { setReviewerEmail(event.target.value); setConfirmedSend(null); }} placeholder="nombre@empresa.com" className={control} /></label>
            <label className="block min-w-0 text-sm font-semibold">Relación profesional<input required minLength={3} maxLength={120} value={relationship} onChange={event => { setRelationship(event.target.value); setConfirmedSend(null); }} placeholder="Supervisor directo" className={control} /></label>
          </div>
          <label className="block min-w-0 text-sm font-semibold">Vigencia<input required type="datetime-local" value={expiry} aria-describedby="s07-expiry-help" onChange={event => { setExpiry(event.target.value); setConfirmedSend(null); }} className={control} /><span id="s07-expiry-help" className="mt-2 block text-xs font-normal leading-5 text-[#b2c9de]">Entre una hora y 30 días. Introduce la hora local de tu dispositivo.</span></label>
          {expiry && !validExpiry && <p role="alert" className="text-sm text-[#ffbecb]">Elige una vigencia de más de una hora y hasta 30 días.</p>}
          <fieldset aria-label="Aspectos que podrá revisar"><legend className="text-sm font-semibold">Alcance de la solicitud</legend><p className="mt-1 text-xs leading-5 text-[#b2c9de]">Selecciona solo lo que esta persona puede respaldar. No hay aspectos preseleccionados.</p><div className="mt-3 grid gap-2 sm:grid-cols-3">{aspects.map(([value, label]) => <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#69b9ff] ${scope.includes(value) ? "border-[#69b9ff] bg-[#143858]" : "border-[#385873] hover:bg-[#12304a]"}`}><input type="checkbox" className="h-4 w-4 shrink-0" checked={scope.includes(value)} onChange={() => { setScope(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]); setConfirmedSend(null); }} />{label}</label>)}</div></fieldset>
        </fieldset>
        <section aria-label="Contenido que revisará el destinatario" className="border-y border-[#294963] py-5">
          <h3 className="text-sm font-semibold">Vista previa del alcance</h3>
          <p className="mt-2 break-words text-sm leading-6 text-[#b2c9de]">{validEmail ? `A ${reviewerEmail.trim()}: ` : "Al revisor: "}solicito respaldo de {scope.length ? aspects.filter(([field]) => scope.includes(field)).map(([, label]) => label.toLowerCase()).join(", ") : "los aspectos que seleccione"}{selectedRevision ? ` de la versión ${selectedRevision.revisionNo}` : " de una versión del registro"}{relationship.trim() ? `, por nuestra relación profesional: ${relationship.trim()}.` : "."}</p>
          {selectedRevision && scope.length > 0 && <dl className="mt-4 space-y-3 break-words text-sm">{aspects.filter(([field]) => scope.includes(field)).map(([field, label]) => <div key={field}><dt className="font-semibold text-[#c3dbf0]">{label}</dt><dd className="mt-1 whitespace-pre-wrap">{requestedValue(selectedRevision, field) || "Sin información registrada"}</dd></div>)}</dl>}
          <p className="mt-4 text-xs leading-5 text-[#b2c9de]">Solo se conceden los campos seleccionados. Los archivos y demás campos quedan fuera. La solicitud no cambia el estado del registro.</p>
        </section>
        {sendNow && <div className="space-y-3 rounded-lg border border-[#4f86b7] p-4" data-testid="endorsement-send-confirmation"><h3 className="font-semibold">Confirma el destinatario y el alcance</h3><label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6"><input type="checkbox" disabled={pending} checked={confirmedSend === sendFingerprint} onChange={event => setConfirmedSend(event.target.checked ? sendFingerprint : null)} className="mt-1 h-4 w-4 shrink-0" /><span className="min-w-0 break-words">Confirmo enviar a <strong>{reviewerEmail || "la persona indicada"}</strong> {scope.length === 1 ? "el" : "los"} {scope.length} {scope.length === 1 ? "aspecto" : "aspectos"} de la versión {selectedRevision?.revisionNo || "seleccionada"}. Se notificará al revisor.</span></label><div className="flex flex-wrap gap-3"><button type="submit" disabled={!valid || pending || confirmedSend !== sendFingerprint} className={primary}>{pending ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Send aria-hidden="true" className="h-4 w-4" />}Confirmar y enviar</button><button type="button" disabled={pending} className={secondary} onClick={() => { setSendNow(false); setConfirmedSend(null); }}>Seguir editando</button></div></div>}
        <div className="flex flex-wrap justify-end gap-3"><button type="button" disabled={!valid || pending} className={secondary} onClick={() => create(false)}><Clock3 aria-hidden="true" className="h-4 w-4" />Guardar borrador</button><button type="button" disabled={!valid || pending || sendNow} className={primary} onClick={() => { setSendNow(true); setConfirmedSend(null); }}><Send aria-hidden="true" className="h-4 w-4" />Enviar solicitud</button></div>
        <p className="text-xs leading-5 text-[#b2c9de]">Guardar borrador no envía ni notifica. Enviar requiere una confirmación final en este formulario.</p>
      </form>
    </section>
    <section aria-label="Mis solicitudes de respaldo" className="min-w-0 rounded-xl border border-[#294963] bg-[#091d2e] p-4 sm:p-6">
      <h2 className="font-display text-xl font-semibold">Mis solicitudes de respaldo</h2><p className="mt-2 text-sm leading-6 text-[#b2c9de]">{requests.length} {requests.length === 1 ? "solicitud" : "solicitudes"} · Fechas en hora de Lima</p>
      <div className="mt-5 space-y-4">{requests.map(request => {
        const incoming = request.requesterId !== currentUserId;
        const expired = new Date(request.expiresAt).getTime() <= Date.now();
        const status = completed[`${request.id}:${request.version}`] === "REVOKED" ? "REVOKED" : expired && ["DRAFT", "PENDING", "IN_REVIEW"].includes(request.status) ? "EXPIRED" : request.status;
        const hidden = incoming && (expired || ["EXPIRED", "REVOKED", "CANCELLED"].includes(status));
        const actionable = incoming && ["PENDING", "IN_REVIEW"].includes(status);
        const terminal = ["REVOKED", "CANCELLED", "EXPIRED"].includes(status);
        const fingerprint = JSON.stringify([request.version, request.reviewerEmail, request.reviewerUserId, request.revisionHash, request.requestedScope, request.expiresAt]);
        const cooldownUntil = request.updatedAt ? new Date(request.updatedAt).getTime() + 86400000 : NaN;
        const resendAllowed = Number.isFinite(cooldownUntil) && cooldownUntil <= Date.now() && completed[`${request.id}:${request.version}`] !== "RESENT";
        const recipient = request.reviewerEmail || request.reviewerUser?.email || "la persona asignada";
        return <article key={request.id} data-testid={`endorsement-request-${request.id}`} className="min-w-0 rounded-lg border border-[#294963] p-4">
          {!incoming && request.revision.thumbnailMediaId && <div className="mb-3"><OwnerThumbnail key={request.revision.id} mediaId={request.revision.thumbnailMediaId} /></div>}<div className="flex flex-wrap items-start justify-between gap-3"><h3 className="min-w-0 break-words font-semibold">{hidden ? "Solicitud de respaldo" : request.revision.title || "Solicitud de respaldo"}</h3><span data-testid="endorsement-status" className={`rounded-full border px-3 py-1 text-xs font-semibold ${status === "CONFIRMED" ? "border-[#41807a] bg-[#123835] text-[#ccf4e9]" : status === "PENDING" ? "border-[#856323] bg-[#403014] text-[#ffe19d]" : status === "CHANGES_REQUESTED" ? "border-[#9d5764] bg-[#391e2b] text-[#ffd5dd]" : "border-[#486078] bg-[#1b3044] text-[#d9e6f2]"}`}>{statusLabels[status] || "Estado no disponible"}</span></div>
          <p className="mt-3 break-words text-sm text-[#c3dbf0]">{incoming ? `Solicitada por ${request.requester.name || "un profesional"}` : recipient}</p><p className="mt-1 break-words text-xs leading-5 text-[#b2c9de]">{request.relationshipLabel} · v{request.revision.revisionNo}</p>
          <dl className="mt-3 space-y-1 text-xs leading-5 text-[#b2c9de]">{request.sentAt && <div><dt className="inline">Primer envío: </dt><dd className="inline">{dateLabel(request.sentAt)}</dd></div>}<div><dt className="inline">Vigencia: </dt><dd className="inline">{dateLabel(request.expiresAt)}</dd></div></dl>
          {hidden ? <p className="mt-3 text-sm leading-6 text-[#b2c9de]">El contenido ya no está disponible. Se conserva el estado y la trazabilidad de la solicitud.</p> : <><dl className="mt-4 space-y-3 border-t border-[#294963] pt-3 text-sm">{request.requestedScope.map(field => <div key={field}><dt className="text-xs font-semibold text-[#b2c9de]">{aspects.find(([value]) => value === field)?.[1] || field}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{requestedValue(request.revision, field) || "Sin información registrada"}</dd></div>)}</dl>{request.decisions.length > 0 && <div className="mt-4 border-t border-[#294963] pt-3 text-sm"><p className="flex items-center gap-2 font-semibold text-[#a9dfce]"><BadgeCheck aria-hidden="true" className="h-4 w-4" />Decisión registrada</p>{request.decisions[0].summaryComment && <p className="mt-2 break-words leading-6">{request.decisions[0].summaryComment}</p>}<p className="mt-2 text-xs text-[#b2c9de]">Revocar conserva las decisiones y su trazabilidad.</p></div>}</>}
          {actionable && <div className="mt-4 rounded-lg bg-white p-3 text-slate-900"><EndorsementReviewForm key={`${request.id}:${request.version}:${request.revisionHash}`} requestId={request.id} version={request.version} fields={request.requestedScope.map(field => ({ field, label: aspects.find(([value]) => value === field)?.[1] || field, value: requestedValue(request.revision, field) }))} /></div>}
          {!incoming && request.status === "DRAFT" && !terminal && completed[`${request.id}:${request.version}`] !== "SENT" && <div className="mt-4 space-y-3"><label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6"><input type="checkbox" disabled={pending} className="mt-1 h-4 w-4 shrink-0" checked={confirmedDrafts[request.id] === fingerprint} onChange={event => setConfirmedDrafts(current => ({ ...current, [request.id]: event.target.checked ? fingerprint : "" }))} /><span className="min-w-0 break-words">Confirmo enviar este borrador a <strong>{recipient}</strong> con {request.requestedScope.length} {request.requestedScope.length === 1 ? "aspecto" : "aspectos"}.</span></label><button type="button" disabled={pending || confirmedDrafts[request.id] !== fingerprint} className={primary} onClick={() => run(async () => { await api(`/api/v1/endorsement-requests/${request.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: request.version }) }); setCompleted(current => ({ ...current, [`${request.id}:${request.version}`]: "SENT" })); setNotice({ error: false, text: "Solicitud enviada; el alcance y la versión quedaron fijados." }); })}>Enviar borrador</button></div>}
          {!incoming && ["PENDING", "IN_REVIEW"].includes(status) && <div className="mt-4 space-y-2"><button type="button" disabled={pending || !resendAllowed} className={secondary} onClick={() => run(async () => { await api(`/api/v1/endorsement-requests/${request.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resend", expectedVersion: request.version }) }); setCompleted(current => ({ ...current, [`${request.id}:${request.version}`]: "RESENT" })); setNotice({ error: false, text: "Solicitud reenviada. Podrás volver a reenviar después de 24 horas." }); })}>Reenviar solicitud</button><p className="text-xs leading-5 text-[#b2c9de]">{completed[`${request.id}:${request.version}`] === "RESENT" ? "Reenvío registrado; espera 24 horas." : !Number.isFinite(cooldownUntil) ? "Actualiza la página para consultar la disponibilidad de reenvío." : !resendAllowed ? `Disponible desde ${dateLabel(new Date(cooldownUntil).toISOString())}.` : "Un reenvío cada 24 horas. No crea otra solicitud."}</p></div>}
          {!incoming && !terminal && <div className="mt-4">{revokeId === request.id ? <div className="space-y-3 border-t border-[#294963] pt-3"><p className="text-sm leading-6">¿Revocar esta solicitud? Las decisiones emitidas y su historial se conservarán.</p><div className="flex flex-wrap gap-3"><button type="button" disabled={pending} className={secondary} onClick={() => run(async () => { await api(`/api/v1/endorsement-requests/${request.id}/decisions`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: request.version }) }); setCompleted(current => ({ ...current, [`${request.id}:${request.version}`]: "REVOKED" })); setRevokeId(null); setNotice({ error: false, text: "Solicitud revocada; el historial de decisiones se conserva." }); })}>Confirmar revocación</button><button type="button" disabled={pending} className={secondary} onClick={() => setRevokeId(null)}>Conservar solicitud</button></div></div> : <button type="button" disabled={pending || completed[`${request.id}:${request.version}`] === "SENT" || completed[`${request.id}:${request.version}`] === "RESENT"} className={secondary} onClick={() => setRevokeId(request.id)}>Revocar solicitud</button>}</div>}
        </article>;
      })}</div>
      {!requests.length && <div className="py-12 text-center"><UserCheck aria-hidden="true" className="mx-auto h-7 w-7 text-[#79bdff]" /><h3 className="mt-4 font-semibold">Sin solicitudes todavía</h3><p className="mt-2 text-sm leading-6 text-[#b2c9de]">Tus borradores, solicitudes y revisiones aparecerán aquí.</p></div>}
    </section>
  </div>;
}
