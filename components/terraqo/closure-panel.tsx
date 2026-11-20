"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { BadgeCheck, Check, FileCheck2, LockKeyhole, RotateCcw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ClosureRevision = {
  id: string;
  revisionNo: number;
  contribution: string;
  deliverables: string[];
  result: string;
  authorizedExcerpt: string | null;
  status: "DRAFT" | "SUBMITTED" | "CHANGES_REQUESTED" | "ACCEPTED" | "DECLINED" | "SUPERSEDED";
  decisionComment: string | null;
  submittedAt?: string | null;
  decidedAt?: string | null;
  references: Array<{ worklogRevisionId: string; worklogRevision: { title: string } }>;
};

const closureStatusLabel: Record<ClosureRevision["status"], string> = {
  DRAFT: "Borrador", SUBMITTED: "En revisión", CHANGES_REQUESTED: "Corrección solicitada",
  ACCEPTED: "Aceptado", DECLINED: "No aceptado", SUPERSEDED: "Versión anterior",
};

type Certificate = {
  id: string;
  workspaceName: string;
  professionalName: string;
  roleTitle: string;
  scope: string;
  proposalRevisionNo: number;
  closureRevisionNo: number;
  contribution: string;
  deliverables: string[];
  result: string;
  authorizedExcerpt: string | null;
  privateByDefault: boolean;
  issuedAt: string;
};

type Collaboration = {
  id: string;
  status: "PROPOSAL_PENDING" | "ACCEPTED" | "IN_PROGRESS" | "CLOSURE_PROPOSED" | "CHANGES_REQUESTED" | "CLOSED" | "CANCELLED";
  acceptedRevisionNo: number | null;
  workspace: { name: string };
  professional: { name: string | null };
  proposals: Array<{ revisionNo: number; roleTitle: string; scope: string }>;
  closure: null | {
    id: string;
    version: number;
    currentRevision: ClosureRevision | null;
    certificate: Certificate | null;
    revisions: ClosureRevision[];
  };
};

function acceptedProposal(collaboration: Collaboration) {
  return collaboration.proposals.find(
    (proposal) => proposal.revisionNo === collaboration.acceptedRevisionNo,
  );
}

function closureDate(value: string | null | undefined) {
  if (!value) return "Fecha no disponible";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima",
  }).format(date);
}

type ClosureForm = { contribution: string; deliverables: string; result: string; excerpt: string };

function revisionForm(revision: ClosureRevision | null | undefined): ClosureForm {
  if (!revision || !["DRAFT", "CHANGES_REQUESTED", "DECLINED"].includes(revision.status))
    return { contribution: "", deliverables: "", result: "", excerpt: "" };
  return {
    contribution: revision.contribution,
    deliverables: revision.deliverables.join("\n"),
    result: revision.result,
    excerpt: revision.authorizedExcerpt || "",
  };
}

type Envelope<T> = { data?: T; error?: { message?: string } | string };

function errorMessage<T>(payload: Envelope<T>, fallback: string) {
  if (typeof payload.error === "string") return payload.error;
  return payload.error?.message || fallback;
}

export function ClosurePanel({ mode }: { mode: "workspace" | "professional" }) {
  const [items, setItems] = useState<Collaboration[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, ClosureForm>>({});
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [savedRevisionIds, setSavedRevisionIds] = useState<Record<string, string>>({});
  const [commentById, setCommentById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const operationKeys = useRef(new Map<string, string>());

  const load = useCallback(async () => {
    try {
      const suffix = mode === "workspace" ? "?view=workspace" : "";
      const response = await fetch(`/api/v1/collaborations${suffix}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as Envelope<Collaboration[]>;
      if (!response.ok) {
        setMessage({ kind: "error", text: errorMessage(payload, "No se pudo cargar el flujo de cierre.") });
        return null;
      }
      const available = (payload.data || []).filter(
        (item) =>
          item.acceptedRevisionNo != null &&
          (mode === "workspace" || item.closure != null),
      );
      setItems(available);
      setSelectedId((current) => current && available.some((item) => item.id === current) ? current : available[0]?.id || "");
      return available;
    } catch {
      setMessage({ kind: "error", text: "No hay conexión para cargar el flujo de cierre. Revisa tu red e inténtalo nuevamente." });
      return null;
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId]);

  const baseline = revisionForm(selected?.closure?.currentRevision);
  const form = drafts[selectedId] || baseline;
  const { contribution, deliverables, result, excerpt } = form;
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const revisionMismatch = savedRevisionIds[selectedId] !== undefined && savedRevisionIds[selectedId] !== selected?.closure?.currentRevision?.id;
  const canEdit = selected != null && ["ACCEPTED", "IN_PROGRESS", "CHANGES_REQUESTED"].includes(selected.status);

  function updateForm(field: keyof ClosureForm, value: string) {
    setDrafts((current) => ({ ...current, [selectedId]: { ...form, [field]: value } }));
  }

  async function refresh() {
    if (working) return;
    setWorking(true);
    const refreshed = await load();
    if (refreshed) setRefreshRequired(false);
    setWorking(false);
  }

  function operationKey(signature: string) {
    const existing = operationKeys.current.get(signature);
    if (existing) return existing;
    const next = crypto.randomUUID();
    operationKeys.current.set(signature, next);
    return next;
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || working || !canEdit || refreshRequired) return;
    const payload = {
      contribution,
      deliverables: deliverables.split(/\n|,/).map((item) => item.trim()).filter(Boolean),
      result,
      authorizedExcerpt: excerpt.trim() || null,
      // Keep only references returned by the server's current authorization projection.
      referenceRevisionIds: selected.closure?.currentRevision?.references.map((reference) => reference.worklogRevisionId) || [],
      expectedVersion: selected.closure?.version || null,
    };
    const signature = JSON.stringify({ action: "save", selectedId: selected.id, payload });
    const key = operationKey(signature);
    setWorking(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/collaborations/${encodeURIComponent(selected.id)}/closures`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as Envelope<{ currentRevision: { id: string } | null }>;
      if (!response.ok)
        setMessage({ kind: "error", text: errorMessage(body, "No se pudo guardar el borrador.") });
      else {
        const savedRevisionId = body.data?.currentRevision?.id || "";
        setSavedRevisionIds((current) => ({ ...current, [selected.id]: savedRevisionId }));
        setRefreshRequired(true);
        setMessage({ kind: "success", text: "Borrador guardado como nueva revisión. Todavía no fue enviado ni publicado." });
        const refreshed = await load();
        if (refreshed) {
          operationKeys.current.delete(signature);
          setRefreshRequired(false);
          if (savedRevisionId && refreshed.find((item) => item.id === selected.id)?.closure?.currentRevision?.id === savedRevisionId) {
            setDrafts((current) => {
              const next = { ...current };
              delete next[selected.id];
              return next;
            });
          } else {
            setMessage({ kind: "error", text: "No se pudo confirmar la revisión guardada como vigente. Tu texto se conserva; revisa el cierre antes de guardar de nuevo." });
          }
        }
      }
    } catch {
      setMessage({ kind: "error", text: "El borrador no se guardó por un problema de conexión. Puedes reintentarlo sin duplicarlo." });
    } finally {
      setWorking(false);
    }
  }

  async function submitCurrent(collaboration: Collaboration) {
    const revision = collaboration.closure?.currentRevision;
    if (!revision || revision.status !== "DRAFT" || working || refreshRequired) return;
    // A pending edit must never send the previous persisted revision.
    if (collaboration.id !== selectedId || dirty || revisionMismatch) {
      setMessage({ kind: "error", text: "Guarda los cambios antes de enviar esta revisión de cierre." });
      return;
    }
    const payload = { expectedRevisionNo: revision.revisionNo };
    const signature = JSON.stringify({ action: "submit", closureId: collaboration.closure?.id, payload });
    const key = operationKey(signature);
    setWorking(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/collaborations/${encodeURIComponent(collaboration.id)}/closures/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as Envelope<unknown>;
      if (!response.ok)
        setMessage({ kind: "error", text: errorMessage(body, "No se pudo enviar el cierre.") });
      else {
        operationKeys.current.delete(signature);
        setMessage({ kind: "success", text: "Cierre enviado para revisión. No se publicó ni se movieron archivos." });
        setRefreshRequired(true);
        if (await load()) setRefreshRequired(false);
      }
    } catch {
      setMessage({ kind: "error", text: "El cierre no se envió por un problema de conexión. Puedes reintentarlo sin duplicarlo." });
    } finally {
      setWorking(false);
    }
  }

  async function decide(
    collaboration: Collaboration,
    action: "ACCEPT" | "REQUEST_CHANGES" | "DECLINE",
  ) {
    const closure = collaboration.closure;
    const revision = closure?.currentRevision;
    if (!closure || !revision || working || refreshRequired) return;
    const comment = commentById[closure.id]?.trim() || "";
    if (action !== "ACCEPT" && !comment) {
      setMessage({ kind: "error", text: "Explica la corrección o el desacuerdo." });
      return;
    }
    const payload = {
      action,
      expectedRevisionNo: revision.revisionNo,
      ...(comment ? { comment } : {}),
    };
    const signature = JSON.stringify({ action: "decision", closureId: closure.id, payload });
    const key = operationKey(signature);
    setWorking(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/closures/${encodeURIComponent(closure.id)}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as Envelope<unknown>;
      if (!response.ok)
        setMessage({ kind: "error", text: errorMessage(body, "No se pudo registrar la revisión.") });
      else {
        operationKeys.current.delete(signature);
        setMessage({
          kind: "success",
          text: action === "ACCEPT"
            ? "Cierre aceptado. Se emitió una constancia privada de esta versión."
            : "Respuesta registrada. No se emitió constancia.",
        });
        setRefreshRequired(true);
        if (await load()) setRefreshRequired(false);
      }
    } catch {
      setMessage({ kind: "error", text: "La revisión no se envió por un problema de conexión. Puedes reintentarla sin duplicarla." });
    } finally {
      setWorking(false);
    }
  }

  if (!loading && !items.length && !message) return null;

  return (
    <section aria-busy={loading || working} className="rounded-[1.4rem] border border-slate-200 bg-white shadow-[0_18px_60px_-44px_rgba(15,23,42,0.6)]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0b6f68]">Cierre bilateral</p>
          <h2 className="mt-1 font-display text-xl font-bold text-slate-950">Cierre y constancia privada</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">Guardar, enviar, aceptar y compartir son acciones separadas. La constancia no concede acceso a archivos internos.</p>
        </div>
        <LockKeyhole className="h-8 w-8 text-[#0b6f68]" aria-hidden />
      </header>

      {message ? <p role={message.kind === "error" ? "alert" : "status"} aria-live={message.kind === "error" ? "assertive" : "polite"} aria-atomic="true" className={`mx-5 mt-4 rounded-xl border px-4 py-3 text-sm font-semibold ${message.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800"}`}>{message.text}</p> : null}

      {refreshRequired ? <div className="mx-5 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><p role="status" className="text-sm text-amber-900">Actualiza el cierre para confirmar la versión vigente antes de continuar. Tu texto se conserva.</p><Button type="button" variant="outline" disabled={working} onClick={() => void refresh()}>Actualizar cierre</Button></div> : null}

      {mode === "workspace" && selected ? (
        <form onSubmit={saveDraft}>
          <div className="px-5 pt-5"><label className="grid gap-2 text-sm font-semibold">Colaboración aceptada<select disabled={working || refreshRequired} value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="min-h-11 rounded-xl border bg-white px-3 text-sm">{items.map((item) => <option key={item.id} value={item.id}>{item.professional.name || "Profesional"} · {acceptedProposal(item)?.roleTitle || "Colaboración"}</option>)}</select></label></div>
          <div className="px-5 pt-4 text-sm text-slate-700"><p className="font-semibold">{selected.workspace.name} · {selected.professional.name || "Profesional"} · Alcance aceptado v{selected.acceptedRevisionNo}</p><p className="mt-1 whitespace-pre-wrap leading-6">{acceptedProposal(selected)?.scope || "La versión aceptada no está disponible."}</p></div>
          <fieldset disabled={working || !canEdit || refreshRequired} className="grid min-w-0 gap-4 border-b p-5 lg:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold lg:col-span-2">Contribución realizada<Textarea required minLength={12} value={contribution} onChange={(event) => updateForm("contribution", event.target.value)} className="min-h-28" /></label>
          <label className="grid gap-2 text-sm font-semibold">Entregables, uno por línea<Textarea required value={deliverables} onChange={(event) => updateForm("deliverables", event.target.value)} className="min-h-24" /></label>
          <label className="grid gap-2 text-sm font-semibold">Resultado<Textarea required minLength={4} value={result} onChange={(event) => updateForm("result", event.target.value)} className="min-h-24" /></label>
          <label className="grid gap-2 text-sm font-semibold lg:col-span-2">Extracto autorizado opcional<Textarea value={excerpt} onChange={(event) => updateForm("excerpt", event.target.value)} className="min-h-20" placeholder="Texto que podría incorporarse a la constancia. No publica nada." /></label>
          <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
            <p id="closure-save-status" role="status" className="text-xs text-slate-600">{!canEdit ? "Este cierre no admite edición en su estado actual." : revisionMismatch ? "La revisión vigente no coincide con la guardada. Revisa el cierre y guarda de nuevo antes de enviarlo." : dirty ? "Cambios sin guardar. Guarda el borrador antes de enviarlo." : selected.closure?.currentRevision?.status === "DRAFT" ? `Borrador guardado v${selected.closure.currentRevision.revisionNo}. Enviar remitirá exactamente esta revisión.` : "Guardar crea una revisión privada y auditable."}</p>
            <div className="flex flex-wrap gap-2"><Button type="submit" variant="outline" disabled={working}><FileCheck2 className="h-4 w-4" />Guardar borrador</Button>{selected.closure?.currentRevision?.status === "DRAFT" ? <Button type="button" disabled={working || dirty || refreshRequired || revisionMismatch} aria-describedby="closure-save-status" onClick={() => void submitCurrent(selected)}><Send className="h-4 w-4" />Enviar cierre a revisión</Button> : null}</div>
          </div>
          </fieldset>
        </form>
      ) : null}

      <div className="divide-y">
        {loading ? <p role="status" aria-live="polite" className="p-5 text-sm text-slate-500">Cargando cierres…</p> : items.map((collaboration) => {
          const closure = collaboration.closure;
          const revision = closure?.currentRevision;
          if (!closure || !revision) return null;
          const proposal = acceptedProposal(collaboration);
          return (
            <article key={collaboration.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#0b6f68]">Cierre v{revision.revisionNo} · {closureStatusLabel[revision.status]}</p><h3 className="mt-1 font-display text-lg font-bold">{proposal?.roleTitle || "Colaboración"}</h3><p className="text-xs text-slate-500">{collaboration.workspace.name} · {collaboration.professional.name || "Profesional"}</p></div>
                {closure.certificate ? <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800"><BadgeCheck className="h-4 w-4" />Constancia privada emitida</span> : null}
              </div>
              <div className="mt-3 text-sm text-slate-700"><p className="font-semibold">Alcance aceptado v{collaboration.acceptedRevisionNo}</p><p className="mt-1 whitespace-pre-wrap leading-6">{proposal?.scope || "La versión aceptada no está disponible. Actualiza antes de continuar."}</p></div>
              <div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3 md:col-span-2"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Contribución</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{revision.contribution}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Resultado</p><p className="mt-1 text-sm leading-6">{revision.result}</p></div></div>
              <ul className="mt-3 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">{revision.deliverables.map((item) => <li key={item} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0b6f68]" />{item}</li>)}</ul>
              {revision.references.length ? <div className="mt-3 text-sm text-slate-700"><p className="font-semibold">Referencias autorizadas de esta revisión</p><ul className="mt-1 list-inside list-disc">{revision.references.map((reference) => <li key={reference.worklogRevisionId}>{reference.worklogRevision.title}</li>)}</ul><p className="mt-1 text-xs text-slate-500">Se conservan al guardar; el acceso a archivos se autoriza por separado.</p></div> : null}
              {revision.decisionComment ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{revision.decisionComment}</p> : null}
              {revision.authorizedExcerpt ? <div className="mt-3 rounded-xl border border-slate-200 p-3"><p className="text-xs font-semibold text-slate-500">Extracto de esta versión</p><p className="mt-1 whitespace-pre-wrap text-sm">{revision.authorizedExcerpt}</p><p className="mt-2 text-xs text-slate-500">Revisarlo o aceptar el cierre no publica este contenido.</p></div> : null}
              {closure.revisions.some((item) => item.id !== revision.id) ? <div className="mt-4 border-t border-slate-200 pt-4"><h4 className="text-sm font-semibold">Historial del cierre</h4><div className="mt-2 divide-y divide-slate-200">{closure.revisions.filter((item) => item.id !== revision.id).map((item) => <details key={item.id} className="py-3"><summary className="cursor-pointer rounded text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">Versión {item.revisionNo} · {closureStatusLabel[item.status]}</summary><div className="mt-3 space-y-3 text-sm"><p className="text-xs text-slate-500">{item.submittedAt ? `Enviada ${closureDate(item.submittedAt)} · Hora de Perú` : "Borrador no enviado"}</p><div><p className="font-semibold">Contribución</p><p className="whitespace-pre-wrap">{item.contribution}</p></div><div><p className="font-semibold">Entregables</p><ul className="list-inside list-disc">{item.deliverables.map((deliverable, index) => <li key={index}>{deliverable}</li>)}</ul></div><div><p className="font-semibold">Resultado</p><p className="whitespace-pre-wrap">{item.result}</p></div>{item.decisionComment ? <p className="rounded-lg bg-slate-50 p-3">{item.decisionComment}</p> : null}{item.authorizedExcerpt ? <p className="whitespace-pre-wrap">{item.authorizedExcerpt}</p> : null}{item.references.length ? <div><p className="font-semibold">Referencias con acceso vigente</p><ul className="list-inside list-disc">{item.references.map((reference) => <li key={reference.worklogRevisionId}>{reference.worklogRevision.title}</li>)}</ul></div> : null}<p className="text-xs text-slate-500">Versión anterior de solo lectura. Los archivos conservan sus propios permisos.</p></div></details>)}</div></div> : null}

              {mode === "professional" && revision.status === "SUBMITTED" ? <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4"><label className="grid gap-2 text-sm font-semibold">Comentario para corrección o desacuerdo<Textarea value={commentById[closure.id] || ""} onChange={(event) => setCommentById((current) => ({ ...current, [closure.id]: event.target.value }))} className="min-h-20 bg-white" /></label><div className="mt-3 flex flex-wrap gap-2"><Button disabled={working || refreshRequired} onClick={() => void decide(collaboration, "ACCEPT")}><Check className="h-4 w-4" />Aceptar y emitir constancia</Button><Button disabled={working || refreshRequired} variant="outline" onClick={() => void decide(collaboration, "REQUEST_CHANGES")}><RotateCcw className="h-4 w-4" />Solicitar corrección</Button><Button disabled={working || refreshRequired} variant="ghost" onClick={() => void decide(collaboration, "DECLINE")}><X className="h-4 w-4" />No aceptar</Button></div></div> : null}

              {closure.certificate ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4"><div className="flex items-center gap-2"><BadgeCheck className="h-5 w-5 text-emerald-700" /><h4 className="font-bold">Constancia de colaboración</h4></div><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Partes</dt><dd className="font-semibold">{closure.certificate.workspaceName} · {closure.certificate.professionalName}</dd></div><div><dt className="text-xs text-slate-500">Versiones aceptadas</dt><dd className="font-semibold">Alcance v{closure.certificate.proposalRevisionNo} · Cierre v{closure.certificate.closureRevisionNo}</dd></div><div><dt className="text-xs text-slate-500">Emitida · Hora de Perú</dt><dd>{closureDate(closure.certificate.issuedAt)}</dd></div><div><dt className="text-xs text-slate-500">Rol acordado</dt><dd>{closure.certificate.roleTitle}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-slate-500">Alcance de la constancia</dt><dd className="mt-1 whitespace-pre-wrap leading-6">{closure.certificate.scope}</dd></div></dl><p className="mt-3 text-xs text-slate-600">Privada por defecto. Compartirla requerirá una acción posterior y contenido autorizado. Esta constancia no concede acceso a los archivos referenciados.</p></div> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
