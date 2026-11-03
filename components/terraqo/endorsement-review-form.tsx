"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const choices = [
  ["CONFIRMED", "Confirmar"],
  ["UNABLE_TO_CONFIRM", "No puedo confirmar"],
  ["CHANGES_REQUESTED", "Solicitar aclaración"],
] as const;
type Decision = (typeof choices)[number][0];
type Answer = { decision?: Decision; comment: string };

/** Mount with a version/hash key so answers never migrate to a different revision. */
export function EndorsementReviewForm({ requestId, version, fields }: {
  requestId: string; version: number; fields: Array<{ field: string; label: string; value: string | null }>;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [summary, setSummary] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  const operation = useRef<{ payload: string; key: string } | null>(null);
  const complete = fields.length > 0 && fields.every(({ field }) => answers[field]?.decision &&
    (answers[field].decision !== "CHANGES_REQUESTED" || answers[field].comment.trim()));
  function update(field: string, patch: Partial<Answer>) {
    setAnswers(current => ({ ...current, [field]: { ...(current[field] || { comment: "" }), ...patch } }));
  }
  async function submit() {
    if (!complete || inFlight.current || done) return;
    inFlight.current = true; setPending(true); setNotice("");
    const payload = JSON.stringify({ expectedVersion: version, responses: fields.map(({ field }) => ({
      field, decision: answers[field].decision, comment: answers[field].comment.trim() || undefined,
    })), summaryComment: summary.trim() || undefined });
    // Retain the operation key for an identical retry after an ambiguous network failure.
    if (operation.current?.payload !== payload) operation.current = { payload, key: crypto.randomUUID() };
    try {
      const response = await fetch(`/api/v1/endorsement-requests/${requestId}/decisions`, {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": operation.current.key }, body: payload,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error?.message || "No se pudo registrar la revisión. Tus respuestas se conservan.");
      setDone(true); setNotice("Revisión registrada sobre la versión solicitada."); router.refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo enviar. Tus respuestas se conservan."); }
    finally { inFlight.current = false; setPending(false); }
  }
  return <section aria-label="Revisar aspectos solicitados" className="mt-5 space-y-4 border-t pt-5">
    <div className="rounded-xl bg-slate-50 p-4 text-sm leading-6"><strong>Tu respuesta se limita a estos aspectos.</strong><p>Respondes a título personal. No poder confirmar no significa que el trabajo sea falso.</p></div>
    <fieldset disabled={pending || done} className="min-w-0 space-y-4">
      <legend className="mb-3 text-sm font-bold">Responde cada aspecto</legend>
      {fields.map(({ field, label, value }) => {
        const answer = answers[field] || { comment: "" };
        return <fieldset key={field} className="min-w-0 rounded-xl border p-4">
          <legend className="px-1 text-sm font-bold">{label}</legend>
          <p className="mb-3 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm leading-6">{value || "Sin información registrada"}</p>
          <div className="grid gap-2">{choices.map(([decision, text]) => <label key={decision} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-primary ${answer.decision === decision ? "border-primary bg-primary/5" : "bg-white"}`}>
            <input type="radio" name={`${requestId}-${field}`} checked={answer.decision === decision} onChange={() => update(field, { decision })} className="h-4 w-4 accent-primary" />{text}
          </label>)}</div>
          {answer.decision ? <label className="mt-3 block text-sm font-medium">{answer.decision === "CHANGES_REQUESTED" ? "Aclaración necesaria" : "Comentario (opcional)"}
            <textarea required={answer.decision === "CHANGES_REQUESTED"} value={answer.comment} onChange={event => update(field, { comment: event.target.value })} maxLength={1200} rows={2} className="mt-2 w-full rounded-lg border px-3 py-2 font-normal focus:border-primary" />
          </label> : null}
        </fieldset>;
      })}
      <label className="block text-sm font-medium">Comentario general (opcional)<textarea value={summary} onChange={event => setSummary(event.target.value)} maxLength={1200} rows={2} className="mt-2 w-full rounded-lg border px-3 py-2 font-normal focus:border-primary" /></label>
    </fieldset>
    <div aria-label="Resumen de respuestas" className="rounded-xl border bg-slate-50 p-4 text-sm"><h4 className="font-bold">Antes de registrar</h4><ul className="mt-2 space-y-2">{fields.map(({ field, label }) => <li key={field}>{label}: {choices.find(([value]) => value === answers[field]?.decision)?.[1] || "Sin responder"}</li>)}</ul></div>
    {notice ? <p role="status" className="rounded-lg border p-3 text-sm">{notice}</p> : null}
    <button onClick={submit} disabled={!complete || pending || done} className="min-h-11 w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-white disabled:opacity-45">{done ? "Revisión registrada" : pending ? "Registrando revisión…" : `Registrar revisión de ${fields.length} ${fields.length === 1 ? "aspecto" : "aspectos"}`}</button>
  </section>;
}
