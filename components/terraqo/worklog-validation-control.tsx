"use client";

import { useState } from "react";
import { BadgeCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

type Validation = { id: string; status: string; requestedAt: Date | string; resolvedAt: Date | string | null; validator: { id: string; name: string | null; image: string | null } };
type StatusPayload = { supervisors: Array<{ userId: string; name: string; image: string | null; title: string }> };

export function WorklogValidationControl({ worklogId, endpoint, validations }: { worklogId: string; endpoint: string; validations: Validation[] }) {
  const latest = validations[0];
  const [open, setOpen] = useState(false);
  const [supervisors, setSupervisors] = useState<StatusPayload["supervisors"]>([]);
  const [validatorUserId, setValidatorUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function showRequest() {
    setOpen(true);
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "status" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "No pudimos cargar tus responsables.");
      setSupervisors(payload.data.supervisors || []);
      setValidatorUserId(payload.data.supervisors?.[0]?.userId || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos cargar tus responsables.");
    } finally {
      setBusy(false);
    }
  }

  async function requestValidation() {
    if (!validatorUserId) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "request_worklog_validation", worklogId, data: { validatorUserId } })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || "No pudimos enviar la solicitud.");
      setMessage("Solicitud enviada. El responsable la vera en su panel de validaciones.");
      setOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos enviar la solicitud.");
    } finally {
      setBusy(false);
    }
  }

  if (latest?.status === "APPROVED") return <span className="inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700"><BadgeCheck className="h-4 w-4" />Validada por {latest.validator.name || "responsable"}</span>;
  if (latest?.status === "REQUESTED" || message.startsWith("Solicitud enviada")) return <span className="inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800"><Send className="h-4 w-4" />Validacion solicitada</span>;

  return <div className="min-w-0">
    {!open ? <Button type="button" variant="outline" size="sm" onClick={showRequest}><BadgeCheck className="mr-2 h-4 w-4" />Solicitar validacion</Button> : <div className="flex flex-col gap-2 rounded-md border bg-muted/25 p-3 sm:flex-row sm:items-end"><label className="grid flex-1 gap-1 text-xs font-semibold">Responsable de supervision<select value={validatorUserId} onChange={(event) => setValidatorUserId(event.target.value)} className="h-10 min-w-0 rounded-md border bg-white px-3 text-sm" disabled={busy}><option value="">Selecciona un responsable</option>{supervisors.map((supervisor) => <option key={supervisor.userId} value={supervisor.userId}>{supervisor.name} | {supervisor.title}</option>)}</select></label><Button type="button" size="sm" onClick={requestValidation} disabled={busy || !validatorUserId}>{busy ? "Enviando..." : "Enviar"}</Button><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button></div>}
    {message && !message.startsWith("Solicitud enviada") ? <p className="mt-2 text-xs font-semibold text-red-700">{message}</p> : null}
  </div>;
}
