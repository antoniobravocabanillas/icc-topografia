"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, BadgeCheck, Check, FileCheck2, LockKeyhole, RotateCcw, Send, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import styles from "./closure-page.module.css";
import { ClosureReferencePicker, closureReferenceKey, type ClosureReferenceSource } from "./closure-reference-picker";
import { ClosureReferencePreview } from "./closure-reference-preview";

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
  unavailableReferenceCount?: number;
  references: Array<{ id?: string; worklogRevisionId: string; worklogRevision: { title?: string }; source?: ClosureReferenceSource }>;
};

const closureStatusLabel: Record<ClosureRevision["status"], string> = {
  DRAFT: "Borrador", SUBMITTED: "En revisión", CHANGES_REQUESTED: "Corrección solicitada",
  ACCEPTED: "Aceptado", DECLINED: "No aceptado", SUPERSEDED: "Versión anterior",
};

const collaborationStatusLabel = {
  PROPOSAL_PENDING: "Propuesta pendiente", ACCEPTED: "Aceptada", IN_PROGRESS: "En curso",
  CLOSURE_PROPOSED: "Cierre propuesto", CHANGES_REQUESTED: "Cambios solicitados",
  CLOSED: "Cerrada", CANCELLED: "Cancelada",
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

type ClosureForm = { contribution: string; deliverables: string; result: string; excerpt: string; referenceSources?: ClosureReferenceSource[] };

function revisionForm(revision: ClosureRevision | null | undefined): ClosureForm {
  if (!revision || !["DRAFT", "CHANGES_REQUESTED", "DECLINED"].includes(revision.status))
    return { contribution: "", deliverables: "", result: "", excerpt: "", referenceSources: [] };
  return {
    contribution: revision.contribution,
    deliverables: revision.deliverables.join("\n"),
    result: revision.result,
    excerpt: revision.authorizedExcerpt || "",
    referenceSources: revision.references.every(reference => reference.source)
      ? revision.references.map(reference => reference.source!) : undefined,
  };
}

type Envelope<T> = { data?: T; error?: { message?: string } | string };

function errorMessage<T>(payload: Envelope<T>, fallback: string) {
  if (typeof payload.error === "string") return payload.error;
  return payload.error?.message || fallback;
}

function ClosureSummary({ revision }: { revision: ClosureRevision }) {
  return <dl className={styles.summary}>
    <div><dt>Contribución realizada</dt><dd>{revision.contribution}</dd></div>
    <div><dt>Entregables</dt><dd><ul>{revision.deliverables.map((item, index) => <li key={index}>{item}</li>)}</ul></dd></div>
    <div><dt>Resultado</dt><dd>{revision.result || "No se registró un resultado adicional."}</dd></div>
    {revision.authorizedExcerpt ? <div><dt>Extracto de esta versión</dt><dd>{revision.authorizedExcerpt}</dd></div> : null}
  </dl>;
}

export function ClosurePanel({ mode, collaborationId, presentation = "embedded" }: {
  mode: "workspace" | "professional";
  collaborationId?: string;
  presentation?: "embedded" | "dedicated";
}) {
  const dedicated = presentation === "dedicated";
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
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const query = new URLSearchParams();
      if (mode === "workspace") query.set("view", "workspace");
      if (dedicated && collaborationId) query.set("collaborationId", collaborationId);
      const suffix = query.size ? `?${query}` : "";
      const response = await fetch(`/api/v1/collaborations${suffix}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as Envelope<Collaboration[]>;
      if (sequence !== loadSequence.current) return null;
      if (!response.ok) {
        setMessage({ kind: "error", text: errorMessage(payload, "No se pudo cargar el flujo de cierre.") });
        return null;
      }
      const available = (payload.data || []).filter(
        (item) =>
          (dedicated ? item.id === collaborationId : !collaborationId || item.id === collaborationId) &&
          item.acceptedRevisionNo != null &&
          (mode === "workspace" || item.closure != null),
      );
      setItems(available);
      setSelectedId((current) => collaborationId
        ? available.find((item) => item.id === collaborationId)?.id || ""
        : dedicated ? "" : current && available.some((item) => item.id === current) ? current : available[0]?.id || "");
      return available;
    } catch {
      if (sequence !== loadSequence.current) return null;
      setMessage({ kind: "error", text: "No hay conexión para cargar el flujo de cierre. Revisa tu red e inténtalo nuevamente." });
      return null;
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [mode, collaborationId, dedicated]);

  useEffect(() => {
    setLoading(true);
    void load();
    return () => { loadSequence.current += 1; };
  }, [load]);

  const selected = useMemo(() => items.find((item) => item.id === selectedId && (!collaborationId || item.id === collaborationId)) || null, [items, selectedId, collaborationId]);

  const baseline = revisionForm(selected?.closure?.currentRevision);
  const form = drafts[selectedId] || baseline;
  const { contribution, deliverables, result, excerpt } = form;
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const revisionMismatch = savedRevisionIds[selectedId] !== undefined && savedRevisionIds[selectedId] !== selected?.closure?.currentRevision?.id;
  const canEdit = selected != null && ["ACCEPTED", "IN_PROGRESS", "CHANGES_REQUESTED"].includes(selected.status);

  function updateForm(field: "contribution" | "deliverables" | "result" | "excerpt", value: string) {
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
      ...(dedicated && form.referenceSources !== undefined
        ? { referenceSources: form.referenceSources }
        : { referenceRevisionIds: selected.closure?.currentRevision?.references.map((reference) => reference.worklogRevisionId) || [] }),
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

  if (dedicated) {
    const closure = selected?.closure;
    const revision = closure?.currentRevision;
    const proposal = selected ? acceptedProposal(selected) : null;
    const saveStatus = !canEdit ? "Este cierre no admite edición en su estado actual."
      : revisionMismatch ? "La revisión vigente cambió. Revisa el cierre y guarda de nuevo antes de enviarlo."
      : dirty ? "Cambios sin guardar. Guarda el borrador antes de enviarlo."
      : revision?.status === "DRAFT" ? `Borrador guardado v${revision.revisionNo}. Enviar remitirá exactamente esta revisión.`
      : "Guardar crea una revisión privada. Todavía no se envía al profesional.";
    const notice = message ? <p role={message.kind === "error" ? "alert" : "status"} aria-live={message.kind === "error" ? "assertive" : "polite"} className={message.kind === "error" ? styles.error : styles.notice}>{message.text}</p> : null;
    const referenceContent = (reference: ClosureRevision["references"][number]) => reference.id && selected
      ? <ClosureReferencePreview collaborationId={selected.id} referenceId={reference.id} revisionId={reference.worklogRevisionId} title={reference.worklogRevision.title} mode={mode} />
      : <span>{reference.worklogRevision.title || "Referencia autorizada"}</span>;
    const references = <section className={styles.references} aria-label="Referencias autorizadas">
      <h3>Evidencias de referencia</h3>
      {Boolean(selected?.closure?.currentRevision?.unavailableReferenceCount) ? <p role="status">{revision!.unavailableReferenceCount} respaldos ya no están disponibles con los permisos actuales. El historial se conserva; actualiza el cierre antes de confirmar una nueva versión.</p> : null}
      {mode === "workspace" && canEdit && form.referenceSources !== undefined && selected ? <ClosureReferencePicker key={selected.id} collaborationId={selected.id} selected={form.referenceSources} selectedTitles={Object.fromEntries((revision?.references || []).flatMap(reference => reference.source ? [[closureReferenceKey(reference.source), reference.worklogRevision.title || "Referencia autorizada"]] : []))} disabled={working || refreshRequired} onChange={referenceSources => setDrafts(current => ({ ...current, [selected.id]: { ...form, referenceSources } }))} /> : revision?.references.length ? <ul>{revision.references.map((reference) => <li key={reference.worklogRevisionId}>{referenceContent(reference)}</li>)}</ul>
        : <p>No hay referencias con acceso vigente para mostrar en esta revisión.</p>}
      <p className={styles.small}>Las evidencias conservan sus permisos de acceso.</p>
    </section>;
    const history = closure?.revisions.some((item) => item.id !== revision?.id) ? <section className={styles.history}>
      <h3>Historial del cierre</h3>
      {closure.revisions.filter((item) => item.id !== revision?.id).map((item) => <details key={item.id}>
        <summary>Versión {item.revisionNo} · {closureStatusLabel[item.status]}</summary>
        <p className={styles.small}>{item.submittedAt ? `Enviada ${closureDate(item.submittedAt)} · Hora de Perú` : "Borrador no enviado"}</p>
        <dl><div><dt>Contribución</dt><dd>{item.contribution}</dd></div><div><dt>Entregables</dt><dd><ul>{item.deliverables.map((entry, index) => <li key={index}>{entry}</li>)}</ul></dd></div><div><dt>Resultado</dt><dd>{item.result}</dd></div></dl>
        {item.authorizedExcerpt ? <p>Extracto: {item.authorizedExcerpt}</p> : null}
        {item.decisionComment ? <p>Respuesta: {item.decisionComment}</p> : null}
        {item.references.length ? <ul>{item.references.map((reference) => <li key={reference.worklogRevisionId}>{referenceContent(reference)}</li>)}</ul> : null}
        <p className={styles.small}>Versión anterior de solo lectura. Los archivos conservan sus permisos.</p>
      </details>)}
    </section> : null;
    const certificate = closure?.certificate ? <section className={styles.certificate}>
      <BadgeCheck size={24} aria-hidden /><h3>Constancia de colaboración</h3>
      <dl><div><dt>Partes</dt><dd>{closure.certificate.workspaceName} · {closure.certificate.professionalName}</dd></div>
        <div><dt>Versiones aceptadas</dt><dd>Alcance v{closure.certificate.proposalRevisionNo} · Cierre v{closure.certificate.closureRevisionNo}</dd></div>
        <div><dt>Emitida · Hora de Perú</dt><dd>{closureDate(closure.certificate.issuedAt)}</dd></div>
        <div><dt>Rol acordado</dt><dd>{closure.certificate.roleTitle}</dd></div><div><dt>Alcance de la constancia</dt><dd>{closure.certificate.scope}</dd></div>
        <div><dt>Contribución</dt><dd>{closure.certificate.contribution}</dd></div><div><dt>Entregables</dt><dd>{closure.certificate.deliverables.join(" · ")}</dd></div><div><dt>Resultado</dt><dd>{closure.certificate.result || "No se registró un resultado adicional."}</dd></div>
        {closure.certificate.authorizedExcerpt ? <div><dt>Extracto autorizado</dt><dd>{closure.certificate.authorizedExcerpt}</dd></div> : null}</dl>
      <p className={styles.small}>Privada por defecto. Compartir requiere una acción posterior y contenido autorizado; no concede acceso a archivos internos.</p>
    </section> : null;

    return <section data-testid="closure-panel" className={styles.page} aria-busy={loading || working} aria-label={mode === "workspace" ? "Preparar cierre" : "Revisar cierre"}>
      <Link className={styles.back} href={mode === "workspace" ? "/admin/mensajes" : "/portal/mensajes"}><ArrowLeft size={18} aria-hidden />Volver a las colaboraciones</Link>
      {notice}
      {refreshRequired ? <div className={styles.notice}><p>Actualiza el cierre para confirmar la versión vigente. Tu texto se conserva.</p><Button variant="outline" disabled={working} onClick={() => void refresh()}>Actualizar cierre</Button></div> : null}
      {loading ? <p role="status">Cargando cierre…</p> : !selected ? <div className={styles.empty}><h1>Cierre no disponible</h1><p>No se encontró esta colaboración entre tus accesos vigentes. No se ha seleccionado otra colaboración.</p><Button variant="outline" disabled={working} onClick={() => void refresh()}>Reintentar</Button></div> : <>
        {mode === "workspace" ? <>
          <header className={styles.header}><div><h1>{proposal?.roleTitle || "Colaboración"}</h1><h2>Preparar cierre del trabajo</h2><p>Revisa los aportes y confirma el resultado con {selected.professional.name || "el profesional"}.</p><p className={styles.small}>Estado de la colaboración: {collaborationStatusLabel[selected.status]}</p></div><span className={styles.state}>{revision ? closureStatusLabel[revision.status] : "Cierre pendiente"}</span></header>
          <div className={styles.workspaceGrid}>
            <div className={styles.main}>
              <section className={styles.surface}><h2>Aportes del profesional</h2><p className={styles.intro}>Documenta el trabajo realizado sobre el alcance que ambas partes aceptaron.</p>
                <dl className={styles.parties}><div><dt>Profesional</dt><dd>{selected.professional.name || "Profesional"}</dd></div><div><dt>Empresa</dt><dd>{selected.workspace.name}</dd></div><div><dt>Participación acordada · v{selected.acceptedRevisionNo}</dt><dd>{proposal?.roleTitle || "Versión aceptada no disponible"}</dd></div></dl>
                <div className={styles.scope}><h3>Alcance aceptado</h3><p>{proposal?.scope || "La versión aceptada no está disponible."}</p><p className={styles.small}>Modificar el alcance requiere una nueva propuesta aceptada.</p></div>
                {revision && !canEdit ? <ClosureSummary revision={revision} /> : null}
                {canEdit ? <form onSubmit={saveDraft} id="dedicated-closure-draft">
                  <fieldset disabled={working || refreshRequired} className={styles.fields}>
                    <label>Contribución realizada<Textarea aria-label="Contribución realizada" required minLength={12} value={contribution} onChange={(event) => updateForm("contribution", event.target.value)} /></label>
                    <div className={styles.fieldPair}><label>Entregables, uno por línea<Textarea aria-label="Entregables, uno por línea" required value={deliverables} onChange={(event) => updateForm("deliverables", event.target.value)} /></label><label>Resultado (opcional)<Textarea aria-label="Resultado" minLength={4} value={result} onChange={(event) => updateForm("result", event.target.value)} /></label></div>
                    <label>Extracto autorizado (opcional)<Textarea aria-label="Extracto autorizado (opcional)" value={excerpt} onChange={(event) => updateForm("excerpt", event.target.value)} placeholder="Texto que podría incorporarse a la constancia." /></label>
                  </fieldset>
                </form> : null}
                {revision?.decisionComment ? <div className={styles.notice}><h3>Respuesta del profesional</h3><p>{revision.decisionComment}</p></div> : null}
                {references}
              </section>
              <section className={styles.surface}><h2>Alcance del cierre</h2><p>El profesional revisará la versión enviada. Solo su aceptación explícita emitirá una constancia privada.</p><p className={styles.small}>Guardar, enviar, aceptar y compartir son acciones separadas.</p></section>
              <section className={styles.private}><LockKeyhole size={24} aria-hidden /><div><h2>Archivos del espacio privado</h2><p>Documentos internos, presupuestos y versiones de trabajo permanecen en el espacio de la empresa. No se incluyen automáticamente en la constancia.</p></div></section>
              {certificate}{history}
            </div>
            <aside className={styles.sidebar}><h2>Qué se confirma</h2><p>El profesional revisará esta información antes de aceptar el cierre.</p><dl><div><dt>Profesional</dt><dd>{selected.professional.name || "Profesional"}</dd></div><div><dt>Participación</dt><dd>{proposal?.roleTitle || "Versión aceptada no disponible"}</dd></div><div><dt>Entregables</dt><dd>{(canEdit ? deliverables : revision?.deliverables.join("\n")) || "Pendientes de documentar"}</dd></div><div><dt>Resultado</dt><dd>{(canEdit ? result : revision?.result) || "Pendiente de documentar"}</dd></div><div><dt>Evidencias</dt><dd>{canEdit && form.referenceSources ? form.referenceSources.length : revision?.references.length || 0} referencias seleccionadas</dd></div></dl><div className={styles.sidebarPrivate}><LockKeyhole size={22} aria-hidden /><h2>Qué permanece privado</h2><p>Archivos del proyecto, notas y comunicaciones internas.</p><p>El cierre no publica contenido ni transfiere permisos sobre los archivos.</p></div></aside>
          </div>
          <footer className={styles.actions}><p id="dedicated-save-status" role="status">{saveStatus}</p><div>{canEdit ? <Button type="submit" form="dedicated-closure-draft" variant="outline" disabled={working || refreshRequired}><FileCheck2 size={18} aria-hidden />Guardar borrador</Button> : null}{canEdit && revision?.status === "DRAFT" ? <Button disabled={working || dirty || refreshRequired || revisionMismatch || Boolean(selected?.closure?.currentRevision?.unavailableReferenceCount)} aria-describedby="dedicated-save-status" onClick={() => void submitCurrent(selected)}><Send size={18} aria-hidden />Enviar cierre a revisión</Button> : null}</div><p className={styles.small}>El cierre no publica archivos automáticamente.</p></footer>
        </> : <div className={styles.reviewGrid}>
          <aside className={styles.reviewIntro}><h1>Tu participación, documentada</h1><p>Revisa la información de tu participación y decide sobre esta versión del cierre.</p><div className={styles.ownership}><FileCheck2 size={28} aria-hidden /><h2>Tu trayectoria te pertenece</h2><p>La constancia será privada por defecto. Los archivos internos siguen en la empresa y conservan sus propios permisos.</p></div></aside>
          <div className={styles.main}>
            <article className={styles.surface}><span className={styles.state}>{revision ? closureStatusLabel[revision.status] : "Aún no hay un cierre enviado"}</span><h2 className={styles.reviewTitle}>{proposal?.roleTitle || "Colaboración"}</h2>
              <p className={styles.intro}>{selected.workspace.name} · {selected.professional.name || "Profesional"}<br />Estado de la colaboración: {collaborationStatusLabel[selected.status]}</p>
              <div className={styles.scope}><h3>Alcance aceptado · v{selected.acceptedRevisionNo}</h3><p>{proposal?.scope || "La versión aceptada no está disponible."}</p></div>
              {revision ? <><p className={styles.small}>Versión revisada: {revision.revisionNo} · {revision.submittedAt ? `${closureDate(revision.submittedAt)} · Hora de Perú` : "Fecha de envío no disponible"}</p><ClosureSummary revision={revision} />{references}
                {revision.decisionComment ? <div className={styles.notice}><h3>Respuesta registrada</h3><p>{revision.decisionComment}</p></div> : null}
                {revision.status === "SUBMITTED" && closure && selected.status === "CLOSURE_PROPOSED" ? <div className={styles.decision}><label>Comentario para corrección o desacuerdo<Textarea aria-label="Comentario para corrección o desacuerdo" disabled={working || refreshRequired} value={commentById[closure.id] || ""} onChange={(event) => setCommentById((current) => ({ ...current, [closure.id]: event.target.value }))} aria-describedby="closure-decision-help" /></label><p id="closure-decision-help" className={styles.small}>Obligatorio para solicitar corrección o no aceptar. Aceptar confirma únicamente la versión {revision.revisionNo} y emite una constancia privada.</p><div className={styles.decisionActions}><Button variant="outline" disabled={working || refreshRequired} onClick={() => void decide(selected, "REQUEST_CHANGES")}><RotateCcw size={18} aria-hidden />Solicitar corrección</Button><Button disabled={working || refreshRequired || Boolean(revision.unavailableReferenceCount)} onClick={() => void decide(selected, "ACCEPT")}><Check size={18} aria-hidden />Aceptar y emitir constancia</Button><Button variant="ghost" disabled={working || refreshRequired} onClick={() => void decide(selected, "DECLINE")}>No aceptar</Button></div></div> : null}
              </> : <p>La empresa todavía no ha enviado una revisión de cierre. Los borradores no se comparten contigo.</p>}
            </article>
            <section className={styles.private}><LockKeyhole size={24} aria-hidden /><div><h2>{closure?.certificate ? "Constancia privada" : "Después de aceptar: compartir por separado"}</h2><p>La aceptación no publica contenido en tu CV vivo. Compartir requiere una acción posterior y autorización sobre el contenido.</p></div></section>
            {certificate}{history}
          </div>
        </div>}
      </>}
    </section>;
  }

  if (!loading && !items.length && !message) return null;

  return (
    <section data-testid="closure-panel" aria-busy={loading || working} className="rounded-[1.4rem] border border-slate-200 bg-white shadow-[0_18px_60px_-44px_rgba(15,23,42,0.6)]">
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
          <label className="grid gap-2 text-sm font-semibold">Resultado (opcional)<Textarea aria-label="Resultado" minLength={4} value={result} onChange={(event) => updateForm("result", event.target.value)} className="min-h-24" /></label>
          <label className="grid gap-2 text-sm font-semibold lg:col-span-2">Extracto autorizado opcional<Textarea value={excerpt} onChange={(event) => updateForm("excerpt", event.target.value)} className="min-h-20" placeholder="Texto que podría incorporarse a la constancia. No publica nada." /></label>
          <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
            <p id="closure-save-status" role="status" className="text-xs text-slate-600">{!canEdit ? "Este cierre no admite edición en su estado actual." : revisionMismatch ? "La revisión vigente no coincide con la guardada. Revisa el cierre y guarda de nuevo antes de enviarlo." : dirty ? "Cambios sin guardar. Guarda el borrador antes de enviarlo." : selected.closure?.currentRevision?.status === "DRAFT" ? `Borrador guardado v${selected.closure.currentRevision.revisionNo}. Enviar remitirá exactamente esta revisión.` : "Guardar crea una revisión privada y auditable."}</p>
            <div className="flex flex-wrap gap-2"><Button type="submit" variant="outline" disabled={working}><FileCheck2 className="h-4 w-4" />Guardar borrador</Button>{selected.closure?.currentRevision?.status === "DRAFT" ? <Button type="button" disabled={working || dirty || refreshRequired || revisionMismatch || Boolean(selected?.closure?.currentRevision?.unavailableReferenceCount)} aria-describedby="closure-save-status" onClick={() => void submitCurrent(selected)}><Send className="h-4 w-4" />Enviar cierre a revisión</Button> : null}</div>
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
              <div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3 md:col-span-2"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Contribución</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{revision.contribution}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Resultado</p><p className="mt-1 text-sm leading-6">{revision.result || "No se registró un resultado adicional."}</p></div></div>
              <ul className="mt-3 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">{revision.deliverables.map((item) => <li key={item} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0b6f68]" />{item}</li>)}</ul>
              {revision.references.length ? <div className="mt-3 text-sm text-slate-700"><p className="font-semibold">Referencias autorizadas de esta revisión</p><ul className="mt-1 list-inside list-disc">{revision.references.map((reference) => <li key={reference.worklogRevisionId}>{reference.worklogRevision.title || "Referencia autorizada"}</li>)}</ul><p className="mt-1 text-xs text-slate-500">Se conservan al guardar; el acceso a archivos se autoriza por separado.</p></div> : null}
              {revision.decisionComment ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{revision.decisionComment}</p> : null}
              {revision.authorizedExcerpt ? <div className="mt-3 rounded-xl border border-slate-200 p-3"><p className="text-xs font-semibold text-slate-500">Extracto de esta versión</p><p className="mt-1 whitespace-pre-wrap text-sm">{revision.authorizedExcerpt}</p><p className="mt-2 text-xs text-slate-500">Revisarlo o aceptar el cierre no publica este contenido.</p></div> : null}
              {closure.revisions.some((item) => item.id !== revision.id) ? <div className="mt-4 border-t border-slate-200 pt-4"><h4 className="text-sm font-semibold">Historial del cierre</h4><div className="mt-2 divide-y divide-slate-200">{closure.revisions.filter((item) => item.id !== revision.id).map((item) => <details key={item.id} className="py-3"><summary className="cursor-pointer rounded text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">Versión {item.revisionNo} · {closureStatusLabel[item.status]}</summary><div className="mt-3 space-y-3 text-sm"><p className="text-xs text-slate-500">{item.submittedAt ? `Enviada ${closureDate(item.submittedAt)} · Hora de Perú` : "Borrador no enviado"}</p><div><p className="font-semibold">Contribución</p><p className="whitespace-pre-wrap">{item.contribution}</p></div><div><p className="font-semibold">Entregables</p><ul className="list-inside list-disc">{item.deliverables.map((deliverable, index) => <li key={index}>{deliverable}</li>)}</ul></div><div><p className="font-semibold">Resultado</p><p className="whitespace-pre-wrap">{item.result}</p></div>{item.decisionComment ? <p className="rounded-lg bg-slate-50 p-3">{item.decisionComment}</p> : null}{item.authorizedExcerpt ? <p className="whitespace-pre-wrap">{item.authorizedExcerpt}</p> : null}{item.references.length ? <div><p className="font-semibold">Referencias con acceso vigente</p><ul className="list-inside list-disc">{item.references.map((reference) => <li key={reference.worklogRevisionId}>{reference.worklogRevision.title || "Referencia autorizada"}</li>)}</ul></div> : null}<p className="text-xs text-slate-500">Versión anterior de solo lectura. Los archivos conservan sus propios permisos.</p></div></details>)}</div></div> : null}

              {mode === "professional" && revision.status === "SUBMITTED" ? <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4"><label className="grid gap-2 text-sm font-semibold">Comentario para corrección o desacuerdo<Textarea value={commentById[closure.id] || ""} onChange={(event) => setCommentById((current) => ({ ...current, [closure.id]: event.target.value }))} className="min-h-20 bg-white" /></label><div className="mt-3 flex flex-wrap gap-2"><Button disabled={working || refreshRequired} onClick={() => void decide(collaboration, "ACCEPT")}><Check className="h-4 w-4" />Aceptar y emitir constancia</Button><Button disabled={working || refreshRequired} variant="outline" onClick={() => void decide(collaboration, "REQUEST_CHANGES")}><RotateCcw className="h-4 w-4" />Solicitar corrección</Button><Button disabled={working || refreshRequired} variant="ghost" onClick={() => void decide(collaboration, "DECLINE")}><X className="h-4 w-4" />No aceptar</Button></div></div> : null}

              {closure.certificate ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4"><div className="flex items-center gap-2"><BadgeCheck className="h-5 w-5 text-emerald-700" /><h4 className="font-bold">Constancia de colaboración</h4></div><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Partes</dt><dd className="font-semibold">{closure.certificate.workspaceName} · {closure.certificate.professionalName}</dd></div><div><dt className="text-xs text-slate-500">Versiones aceptadas</dt><dd className="font-semibold">Alcance v{closure.certificate.proposalRevisionNo} · Cierre v{closure.certificate.closureRevisionNo}</dd></div><div><dt className="text-xs text-slate-500">Emitida · Hora de Perú</dt><dd>{closureDate(closure.certificate.issuedAt)}</dd></div><div><dt className="text-xs text-slate-500">Rol acordado</dt><dd>{closure.certificate.roleTitle}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-slate-500">Alcance de la constancia</dt><dd className="mt-1 whitespace-pre-wrap leading-6">{closure.certificate.scope}</dd></div></dl><p className="mt-3 text-xs text-slate-600">Privada por defecto. Compartirla requerirá una acción posterior y contenido autorizado. Esta constancia no concede acceso a los archivos referenciados.</p></div> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
