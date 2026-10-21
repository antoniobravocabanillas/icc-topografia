"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Check, History, RotateCcw, Send, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/terraqo/user-avatar";

type Proposal = {
  id: string;
  revisionNo: number;
  scope: string;
  roleTitle: string;
  deliverables: string[];
  startsOn: string | null;
  endsOn: string | null;
  conditions: string | null;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CHANGES_REQUESTED" | "WITHDRAWN" | "SUPERSEDED";
  decisionComment: string | null;
  createdBy: { id: string; name: string | null };
  acceptances: Array<{
    id: string;
    party: "WORKSPACE" | "PROFESSIONAL";
    acceptedAt: string;
    actor: { id: string; name: string | null };
  }>;
};

type Collaboration = {
  id: string;
  status: "PROPOSAL_PENDING" | "ACCEPTED" | "IN_PROGRESS" | "CLOSURE_PROPOSED" | "CHANGES_REQUESTED" | "CLOSED" | "CANCELLED";
  version: number;
  acceptedRevisionNo: number | null;
  conversationId: string;
  workspace: { id: string; name: string };
  professional: { id: string; name: string | null; image: string | null };
  proposals: Proposal[];
};

type ConversationOption = {
  id: string;
  label: string;
  professionalName: string;
};

type Envelope<T> = { data?: T; error?: { message?: string } | string };

function errorMessage<T>(payload: Envelope<T>, fallback: string) {
  if (typeof payload.error === "string") return payload.error;
  return payload.error?.message || fallback;
}

function dateValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

const proposalStatus: Record<Proposal["status"], string> = {
  PENDING: "Pendiente de aceptación",
  ACCEPTED: "Aceptada",
  REJECTED: "Rechazada",
  CHANGES_REQUESTED: "Cambios solicitados",
  WITHDRAWN: "Retirada",
  SUPERSEDED: "Sustituida",
};

export function CollaborationPanel({
  mode,
  basePath,
  conversations = [],
}: {
  mode: "workspace" | "professional";
  basePath: "/portal/mensajes" | "/admin/terraqo/mensajes";
  conversations?: ConversationOption[];
}) {
  const [items, setItems] = useState<Collaboration[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [conversationId, setConversationId] = useState(conversations[0]?.id || "");
  const [scope, setScope] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [deliverables, setDeliverables] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [conditions, setConditions] = useState("");
  const [commentById, setCommentById] = useState<Record<string, string>>({});
  const operationKeys = useRef(new Map<string, string>());

  const load = useCallback(async () => {
    try {
      const suffix = mode === "workspace" ? "?view=workspace" : "";
      const response = await fetch(`/api/v1/collaborations${suffix}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as Envelope<Collaboration[]>;
      if (!response.ok) {
        setMessage({ kind: "error", text: errorMessage(payload, "No se pudieron cargar las colaboraciones.") });
        return;
      }
      setItems(payload.data || []);
    } catch {
      setMessage({ kind: "error", text: "No hay conexión para cargar las colaboraciones. Revisa tu red e inténtalo nuevamente." });
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const existing = useMemo(
    () => items.find((item) => item.conversationId === conversationId) || null,
    [conversationId, items],
  );

  function prepareRevision(collaboration: Collaboration) {
    const proposal = collaboration.proposals[0];
    if (!proposal) return;
    setConversationId(collaboration.conversationId);
    setScope(proposal.scope);
    setRoleTitle(proposal.roleTitle);
    setDeliverables(proposal.deliverables.join("\n"));
    setStartsOn(dateValue(proposal.startsOn));
    setEndsOn(dateValue(proposal.endsOn));
    setConditions(proposal.conditions || "");
    document.getElementById("collaboration-proposal-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submitProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      ...(existing ? { expectedVersion: existing.version } : { conversationId }),
      scope,
      roleTitle,
      deliverables: deliverables.split(/\n|,/).map((item) => item.trim()).filter(Boolean),
      startsOn: startsOn || null,
      endsOn: endsOn || null,
      conditions: conditions.trim() || null,
    };
    const signature = JSON.stringify({ existingId: existing?.id || null, payload });
    const operationKey = operationKeys.current.get(signature) || crypto.randomUUID();
    operationKeys.current.set(signature, operationKey);
    setSubmitting(true);
    setMessage(null);
    const endpoint = existing
      ? `/api/v1/collaborations/${encodeURIComponent(existing.id)}/proposals`
      : "/api/v1/collaborations";
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": operationKey },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as Envelope<Collaboration>;
      if (!response.ok) {
        setMessage({ kind: "error", text: errorMessage(body, "No se pudo enviar la propuesta.") });
      } else {
        operationKeys.current.delete(signature);
        setMessage({
          kind: "success",
          text: existing
            ? "Nueva versión enviada. La versión anterior no fue modificada."
            : "Propuesta enviada. La colaboración solo nace cuando el profesional acepta esta versión.",
        });
        await load();
      }
    } catch {
      setMessage({ kind: "error", text: "La propuesta no se envió por un problema de conexión. Puedes reintentarla sin duplicarla." });
    } finally {
      setSubmitting(false);
    }
  }

  async function decide(
    collaboration: Collaboration,
    action: "ACCEPT" | "REJECT" | "REQUEST_CHANGES",
  ) {
    const proposal = collaboration.proposals[0];
    if (!proposal) return;
    const comment = commentById[collaboration.id]?.trim() || "";
    if (action !== "ACCEPT" && !comment) {
      setMessage({ kind: "error", text: "Explica el rechazo o los cambios solicitados." });
      return;
    }
    const payload = {
      action,
      expectedRevisionNo: proposal.revisionNo,
      ...(comment ? { comment } : {}),
    };
    const signature = JSON.stringify({ collaborationId: collaboration.id, payload });
    const operationKey = operationKeys.current.get(signature) || crypto.randomUUID();
    operationKeys.current.set(signature, operationKey);
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/v1/collaborations/${encodeURIComponent(collaboration.id)}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": operationKey },
          body: JSON.stringify(payload),
        },
      );
      const body = (await response.json().catch(() => ({}))) as Envelope<Collaboration>;
      if (!response.ok)
        setMessage({ kind: "error", text: errorMessage(body, "No se pudo registrar la decisión.") });
      else {
        operationKeys.current.delete(signature);
        setMessage({
          kind: "success",
          text: action === "ACCEPT"
            ? "Versión aceptada explícitamente. Ya puede iniciar la colaboración."
            : "Decisión registrada sin alterar el historial.",
        });
        await load();
      }
    } catch {
      setMessage({ kind: "error", text: "La decisión no se envió por un problema de conexión. Puedes reintentarla sin duplicarla." });
    } finally {
      setSubmitting(false);
    }
  }

  if (!loading && mode === "professional" && !items.length && !message) return null;

  return (
    <section aria-busy={loading || submitting} className="rounded-[1.4rem] border border-slate-200 bg-white shadow-[0_18px_60px_-44px_rgba(15,23,42,0.6)]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-[linear-gradient(120deg,#071d2a_0%,#0c3740_70%,#126a64_145%)] px-5 py-5 text-white">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200">Acuerdo explícito</p>
          <h2 className="mt-1 font-display text-xl font-bold">Propuestas de colaboración</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-200">
            Cada alcance es inmutable. Un cambio crea otra versión y nunca implica contrato legal ni pago procesado.
          </p>
        </div>
        <ShieldCheck className="h-8 w-8 text-cyan-200" aria-hidden />
      </header>

      {message ? (
        <p role={message.kind === "error" ? "alert" : "status"} aria-live={message.kind === "error" ? "assertive" : "polite"} aria-atomic="true" className={`mx-5 mt-4 rounded-xl border px-4 py-3 text-sm font-semibold ${message.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800"}`}>
          {message.text}
        </p>
      ) : null}

      {mode === "workspace" && conversations.length ? (
        <form id="collaboration-proposal-form" onSubmit={submitProposal} className="grid gap-4 border-b p-5 lg:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold lg:col-span-2">
            Profesional y conversación
            <select value={conversationId} onChange={(event) => setConversationId(event.target.value)} className="min-h-11 rounded-xl border bg-white px-3 text-sm">
              {conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.professionalName} · {conversation.label}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold lg:col-span-2">Alcance de esta versión<Textarea required minLength={12} value={scope} onChange={(event) => setScope(event.target.value)} className="min-h-28" placeholder="Describe el trabajo, límites y responsabilidades acordables." /></label>
          <label className="grid gap-2 text-sm font-semibold">Rol propuesto<Input required minLength={2} value={roleTitle} onChange={(event) => setRoleTitle(event.target.value)} placeholder="Ej. Especialista en levantamiento" /></label>
          <label className="grid gap-2 text-sm font-semibold">Entregables, uno por línea<Textarea required value={deliverables} onChange={(event) => setDeliverables(event.target.value)} className="min-h-24" placeholder={"Informe de levantamiento\nPlanos de campo"} /></label>
          <label className="grid gap-2 text-sm font-semibold">Inicio, si corresponde<Input type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} /></label>
          <label className="grid gap-2 text-sm font-semibold">Fin, si corresponde<Input type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} /></label>
          <label className="grid gap-2 text-sm font-semibold lg:col-span-2">Condiciones pertinentes, sin datos de pago implícitos<Textarea value={conditions} onChange={(event) => setConditions(event.target.value)} className="min-h-20" placeholder="Disponibilidad, coordinación o restricciones operativas." /></label>
          <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
            <p className="text-xs text-slate-500">{existing ? `Crearás la versión ${((existing.proposals[0]?.revisionNo || 0) + 1)}. La anterior seguirá auditable.` : "Enviar crea la versión 1 pendiente de aceptación."}</p>
            <Button type="submit" disabled={submitting || !conversationId}><Send className="h-4 w-4" />{existing ? "Enviar nueva versión" : "Enviar propuesta"}</Button>
          </div>
        </form>
      ) : mode === "workspace" ? (
        <p className="border-b px-5 py-5 text-sm text-slate-600">Primero debe existir una conversación aceptada con contexto profesional.</p>
      ) : null}

      <div className="divide-y">
        {loading ? <p role="status" aria-live="polite" className="p-5 text-sm text-slate-500">Cargando propuestas…</p> : items.map((collaboration) => {
          const current = collaboration.proposals[0];
          if (!current) return null;
          const pendingProfessional = mode === "professional" && current.status === "PENDING";
          return (
            <article key={collaboration.id} className="p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <UserAvatar name={mode === "workspace" ? collaboration.professional.name : collaboration.workspace.name} image={mode === "workspace" ? collaboration.professional.image : null} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-lg font-bold text-slate-950">{current.roleTitle}</h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">v{current.revisionNo} · {proposalStatus[current.status]}</span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-[#0b6f68]">{collaboration.workspace.name} · {collaboration.professional.name || "Profesional"}</p>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{current.scope}</p>
                    <div className="mt-3 rounded-xl bg-slate-50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Entregables</p>
                      <ul className="mt-2 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">{current.deliverables.map((item) => <li key={item} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0b6f68]" />{item}</li>)}</ul>
                    </div>
                    {current.decisionComment ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{current.decisionComment}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>{current.startsOn ? `Inicio: ${dateValue(current.startsOn)}` : "Inicio por acordar"}</span>
                      <span>·</span>
                      <span>{current.endsOn ? `Fin: ${dateValue(current.endsOn)}` : "Fin por acordar"}</span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 xl:max-w-xs xl:justify-end">
                  <Button asChild variant="outline" size="sm"><Link href={`${basePath}?conversation=${collaboration.conversationId}`}>Conversación <ArrowRight className="h-4 w-4" /></Link></Button>
                  {mode === "workspace" && current.status !== "PENDING" && collaboration.status !== "CLOSED" && collaboration.status !== "CANCELLED" ? <Button type="button" variant="outline" size="sm" onClick={() => prepareRevision(collaboration)}><RotateCcw className="h-4 w-4" />Nueva versión</Button> : null}
                </div>
              </div>

              {pendingProfessional ? (
                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                  <label className="grid gap-2 text-sm font-semibold">Comentario para rechazo o cambios<Textarea value={commentById[collaboration.id] || ""} onChange={(event) => setCommentById((currentValue) => ({ ...currentValue, [collaboration.id]: event.target.value }))} maxLength={1200} className="min-h-20 bg-white" placeholder="Aclara qué debería corregirse." /></label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button disabled={submitting} onClick={() => void decide(collaboration, "ACCEPT")}><Check className="h-4 w-4" />Aceptar esta versión</Button>
                    <Button disabled={submitting} variant="outline" onClick={() => void decide(collaboration, "REQUEST_CHANGES")}><History className="h-4 w-4" />Pedir cambios</Button>
                    <Button disabled={submitting} variant="ghost" onClick={() => void decide(collaboration, "REJECT")}><X className="h-4 w-4" />Rechazar</Button>
                  </div>
                  <p className="mt-3 text-xs text-blue-900/70">Aceptar no firma un contrato, no procesa pagos y no autoriza futuras modificaciones.</p>
                </div>
              ) : null}

              {collaboration.proposals.length > 1 ? (
                <details className="mt-4 rounded-xl border px-4 py-3">
                  <summary className="cursor-pointer text-sm font-bold text-slate-700">Historial de versiones ({collaboration.proposals.length})</summary>
                  <ol className="mt-3 space-y-2">{collaboration.proposals.map((proposal) => <li key={proposal.id} className="flex flex-wrap justify-between gap-2 border-t pt-2 text-xs text-slate-600"><span>Versión {proposal.revisionNo} · {proposal.roleTitle}</span><strong>{proposalStatus[proposal.status]}</strong></li>)}</ol>
                </details>
              ) : null}
            </article>
          );
        })}
        {!loading && !items.length ? <div className="grid min-h-32 place-items-center p-6 text-center"><div><BriefcaseBusiness className="mx-auto h-7 w-7 text-[#0b6f68]" /><p className="mt-2 text-sm font-semibold">Aún no hay propuestas en este contexto.</p></div></div> : null}
      </div>
    </section>
  );
}
