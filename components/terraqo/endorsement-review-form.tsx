"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";

const choices = [
  ["CONFIRMED", "Confirmar"],
  ["UNABLE_TO_CONFIRM", "No puedo confirmar"],
  ["CHANGES_REQUESTED", "Solicitar aclaración"],
] as const;
type Decision = (typeof choices)[number][0];
type Answer = { decision?: Decision; comment: string };
const control = "mt-2 min-h-11 w-full min-w-0 rounded-lg border border-[#486a88] bg-[#0b2033] px-3 py-2 text-sm font-normal text-[#edf4fc] placeholder:text-[#b2c9de] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#69b9ff]";

/** Mount with a version/hash key so answers never migrate to a different revision. */
export function EndorsementReviewForm({ requestId, version, fields, expectedRevisionId, expectedRevisionHash, expiresAt, organizationName, onAccessLost, blocked = false }: {
  requestId: string; version: number; fields: Array<{ field: string; label: string; value: string | null }>;
  expectedRevisionId?: string; expectedRevisionHash?: string; blocked?: boolean;
  expiresAt?: string; organizationName?: string; onAccessLost?: () => void;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [summary, setSummary] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const inFlight = useRef(false);
  const operation = useRef<{ payload: string; key: string } | null>(null);
  const complete = fields.length > 0 && fields.every(({ field }) => answers[field]?.decision &&
    (answers[field].decision !== "CHANGES_REQUESTED" || answers[field].comment.trim()));
  const locked = pending || done || stale || blocked;
  const answered = fields.filter(({ field }) => answers[field]?.decision).length;
  const confirmed = fields.filter(({ field }) => answers[field]?.decision === "CONFIRMED").length;
  function update(field: string, patch: Partial<Answer>) {
    setAnswers(current => ({ ...current, [field]: { ...(current[field] || { comment: "" }), ...patch } }));
  }
  async function submit() {
    if (!complete || inFlight.current || locked) return;
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) { setStale(true); onAccessLost?.(); return; }
    inFlight.current = true; setPending(true); setNotice(null);
    const payload = JSON.stringify({ expectedVersion: version, expectedRevisionId, expectedRevisionHash, responses: fields.map(({ field }) => ({
      field, decision: answers[field].decision, comment: answers[field].comment.trim() || undefined,
    })), summaryComment: summary.trim() || undefined });
    // The exact same retry retains its key after an uncertain response. A synchronous lock
    // prevents two clicks from writing before React renders the pending state.
    if (operation.current?.payload !== payload) operation.current = { payload, key: crypto.randomUUID() };
    try {
      const response = await fetch(`/api/v1/endorsement-requests/${encodeURIComponent(requestId)}/decisions`, {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": operation.current.key }, body: payload,
      });
      const result = await response.json().catch(() => null);
      if ([403, 404, 409, 410].includes(response.status)) {
        setStale(true);
        if (response.status !== 409) onAccessLost?.();
        setNotice({ error: true, text: response.status === 409 ? "La solicitud o su versión cambió. Recarga la solicitud para comprobar la evidencia antes de responder." : "Esta solicitud ya no está disponible para tu cuenta. Recarga para comprobar tu acceso." });
        return;
      }
      if (!response.ok || !result || !("data" in result)) throw new Error(result?.error?.message || "No se pudo registrar la revisión. Tus respuestas se conservan; puedes reintentar.");
      setDone(true); setNotice({ error: false, text: "Revisión registrada sobre la versión solicitada." }); router.refresh();
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : "No se pudo enviar. Tus respuestas se conservan; puedes reintentar." }); }
    finally { inFlight.current = false; setPending(false); }
  }
  return <section aria-label="Revisar aspectos solicitados" aria-busy={pending} className="mt-5 space-y-5 border-t border-[#294963] pt-5 text-[#edf4fc]">
    <div className="flex items-start gap-3 text-sm leading-6 text-[#b2c9de]"><ShieldCheck aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[#79bdff]" /><p className="min-w-0 break-words"><strong className="text-[#edf4fc]">{organizationName ? `Revisión vinculada a ${organizationName}.` : "Revisas a título personal."}</strong> {organizationName ? "Tu permiso empresarial se comprueba al registrar. " : "Tu respuesta aplica a tu experiencia. "}No poder confirmar no significa que el trabajo sea falso ni reduce una puntuación.</p></div>
    {blocked && <p data-testid="s08-historical-unavailable" role="alert" className="rounded-lg border border-[#856323] bg-[#403014] p-3 text-sm leading-6 text-[#ffe19d]">No hay una copia histórica de la fecha o el lugar solicitado. No puedes enviar esta revisión. Solicita al autor una nueva solicitud con evidencia fijada.</p>}
    <fieldset disabled={locked} className="min-w-0 space-y-5">
      <legend className="mb-3 text-sm font-semibold">Responde cada aspecto · {answered} de {fields.length}</legend>
      {fields.map(({ field, label, value }) => {
        const answer = answers[field] || { comment: "" };
        return <fieldset key={field} data-testid={`s08-aspect-${field}`} className="min-w-0 border-b border-[#294963] pb-5">
          <legend className="text-sm font-semibold">{label}</legend>
          <p className="my-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#b2c9de]">{value || "Sin información registrada"}</p>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">{choices.map(([decision, text]) => <label key={decision} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#69b9ff] ${answer.decision === decision ? "border-[#69b9ff] bg-[#143858]" : "border-[#486a88] bg-[#0b2033] hover:bg-[#18354e]"}`}>
            <input type="radio" name={`${requestId}-${field}`} checked={answer.decision === decision} onChange={() => update(field, { decision })} className="h-4 w-4 shrink-0 accent-[#69b9ff]" />{text}
          </label>)}</div>
          {answer.decision ? <label className="mt-3 block text-sm font-medium">{answer.decision === "CHANGES_REQUESTED" ? "Aclaración necesaria" : "Comentario (opcional)"}
            <textarea aria-label={answer.decision === "CHANGES_REQUESTED" ? "Aclaración necesaria" : "Comentario (opcional)"} required={answer.decision === "CHANGES_REQUESTED"} value={answer.comment} onChange={event => update(field, { comment: event.target.value })} maxLength={1200} rows={2} className={control} />
            {answer.decision === "CHANGES_REQUESTED" && !answer.comment.trim() && <span className="mt-1 block text-xs leading-5 text-[#ffe19d]">Explica qué necesita aclararse antes de registrar.</span>}
          </label> : null}
        </fieldset>;
      })}
      <label className="block text-sm font-medium">Comentario general (opcional)<textarea value={summary} onChange={event => setSummary(event.target.value)} maxLength={1200} rows={2} className={control} /></label>
    </fieldset>
    <div aria-label="Resumen de respuestas" className="border-y border-[#294963] py-4 text-sm"><h3 className="font-semibold">Antes de registrar</h3><ul className="mt-2 space-y-2 break-words text-[#b2c9de]">{fields.map(({ field, label }) => <li key={field}>{label}: {choices.find(([value]) => value === answers[field]?.decision)?.[1] || "Sin responder"}</li>)}</ul></div>
    {notice && <p role={notice.error ? "alert" : "status"} className={`break-words rounded-lg border p-3 text-sm leading-6 ${notice.error ? "border-[#9d5764] bg-[#391e2b] text-[#ffd5dd]" : "border-[#41807a] bg-[#123835] text-[#ccf4e9]"}`}>{notice.text}</p>}
    {stale && <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-lg border border-[#486a88] px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#69b9ff]">Recargar solicitud</button>}
    <button data-testid="s08-submit" type="button" onClick={submit} disabled={!complete || locked} className="min-h-11 w-full rounded-lg bg-[#316cce] px-4 py-3 text-sm font-semibold text-white hover:bg-[#245dbb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#69b9ff] disabled:cursor-not-allowed disabled:opacity-50">{done ? "Revisión registrada" : pending ? "Registrando revisión…" : `Registrar revisión de ${fields.length} ${fields.length === 1 ? "aspecto" : "aspectos"}`}</button>
    <p className="text-xs leading-5 text-[#b2c9de]">{confirmed} por confirmar · {fields.filter(({ field }) => answers[field]?.decision === "UNABLE_TO_CONFIRM").length} sin confirmar · {fields.filter(({ field }) => answers[field]?.decision === "CHANGES_REQUESTED").length} por aclarar. Solo se registra la versión solicitada.</p>
  </section>;
}
