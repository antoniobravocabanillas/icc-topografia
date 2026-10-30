"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ban, BookOpenCheck, Bot, BriefcaseBusiness, Check, ChevronRight, CircleAlert, FileSearch, LoaderCircle, MapPin, MessageSquareText, Plus, RotateCcw, ShieldCheck, Sparkles, UserRoundSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Requirement = { id?: string; label: string; priority: "REQUIRED" | "DESIRED" };
type Need = {
  id: string;
  lifecycle: "DRAFT" | "ACTIVE" | "ARCHIVED";
  version: number;
  currentRevision: null | {
    id: string;
    title: string;
    problem: string;
    activities: string[];
    locationLabel: string | null;
    requiredTools: string[];
    requirements: Requirement[];
  };
};
type MatchReason = {
  required: Array<{ label: string; terms: string[] }>;
  desirable: Array<{ label: string; terms: string[] }>;
  activityTerms: string[];
  toolTerms: string[];
  locationTerms: string[];
};
type EvidenceMatch = {
  revisionId: string;
  professionalProfileId: string;
  professionalName: string;
  professionalImage: string | null;
  headline: string | null;
  title?: string;
  summary?: string;
  occurredAt?: string;
  locationLabel?: string | null;
  accessKind: "PUBLIC_CV" | "PUBLIC_SELECTION";
  reasons: MatchReason;
};
type EvaluationAssessment = {
  id: string;
  requirementId: string | null;
  criterionKey: string;
  criterionLabel: string;
  claimState: "DOCUMENTED" | "DECLARED" | "ENDORSED" | "CONFIRMED" | "UNKNOWN";
  rationale: string | null;
  revisionNo: number;
  sourceIds: string[];
  sourceState: "ACTIVE" | "SOURCE_REVOKED";
};
type EvaluationDossier = {
  id: string;
  privateSummary: string | null;
  effectiveAnalysisStatus: "NOT_REQUESTED" | "PROCESSING" | "READY" | "FAILED" | "INSUFFICIENT" | "SOURCE_REVOKED";
  revokedSourceCount: number;
  needRevision: { id: string; title: string; revisionNo: number; requirements: Array<Requirement & { id: string }> };
  professionalProfile: { id: string; headline: string | null; user: { name: string | null; image: string | null } };
  sources: Array<{ id: string; accessKind: "PUBLIC_CV" | "PUBLIC_SELECTION" | "PRIVATE_GRANT"; worklogRevision: { id: string; title?: string; contentHash: string } }>;
  assessments: EvaluationAssessment[];
  notes: Array<{ id: string; body: string; createdAt: string; createdBy: { name: string | null } }>;
  questions: Array<{ id: string; text: string; revisionNo: number }>;
};

type AnalysisPurpose = "EVIDENCE_SUMMARY" | "REQUIREMENT_GAPS" | "QUESTION_DRAFTS";
type AnalysisJob = {
  id: string;
  dossierId: string;
  purpose: AnalysisPurpose;
  status: "QUEUED" | "PROCESSING" | "RETRY_WAIT" | "READY" | "INSUFFICIENT" | "FAILED" | "CANCELLED" | "SOURCE_REVOKED";
  claims: Array<{
    text: string;
    kind: "EXPLICIT_DATA" | "DECLARATION_SUMMARY" | "PROPOSED_INTERPRETATION";
    citations: Array<{ sourceId: string; revisionId: string; field: string; excerpt: string }>;
  }>;
  missing: string[];
  attemptCount: number;
  maxAttempts: number;
  failureCode: string | null;
  cancellable: boolean;
  retryable: boolean;
  usage: { inputTokens: number | null; outputTokens: number | null; estimatedCostMicros: string | null; latencyMs: number | null };
};

function lines(value: string) {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

async function api<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await response.json() as { data?: T; error?: { message?: string } };
  if (!response.ok || body.data === undefined) throw new Error(body.error?.message || "No se pudo completar la operación.");
  return body.data;
}

type EmployerNeedsEntitlement = { status: "DISABLED" | "PENDING_PILOT" | "LIMIT_REACHED" | "ACTIVE"; tier: string; limit: number | null; remaining: number | null };

export function DiscoveryNeedsConsole({ contextualMessagingEnabled = false, evidenceAnalysisEnabled = false, evidenceAnalysisUnavailableReason = null, employerNeedsEntitlement = { status: "DISABLED", tier: "FREE", limit: null, remaining: null } }: { contextualMessagingEnabled?: boolean; evidenceAnalysisEnabled?: boolean; evidenceAnalysisUnavailableReason?: string | null; employerNeedsEntitlement?: EmployerNeedsEntitlement }) {
  const [needs, setNeeds] = useState<Need[]>([]);
  const [selectedNeedId, setSelectedNeedId] = useState<string | null>(null);
  const [matches, setMatches] = useState<EvidenceMatch[]>([]);
  const [dossiers, setDossiers] = useState<EvaluationDossier[]>([]);
  const [selectedDossierId, setSelectedDossierId] = useState<string | null>(null);
  const [selectedRevisions, setSelectedRevisions] = useState<Record<string, string[]>>({});
  const [analysisPurposes, setAnalysisPurposes] = useState<Record<string, AnalysisPurpose>>({});
  const [analysisJobs, setAnalysisJobs] = useState<Record<string, AnalysisJob>>({});
  const analysisPollTimers = useRef<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const employerNeedsWritable = employerNeedsEntitlement.status === "ACTIVE";

  const loadNeeds = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Need[]>("/api/v1/work-needs", { cache: "no-store" });
      setNeeds(data);
      setSelectedNeedId((current) => current && data.some((need) => need.id === current) ? current : data[0]?.id ?? null);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudieron cargar las necesidades." });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDossiers = useCallback(async () => {
    try {
      const data = await api<EvaluationDossier[]>("/api/v1/evaluation-dossiers", { cache: "no-store" });
      setDossiers(data);
      setSelectedDossierId((current) => current && data.some((dossier) => dossier.id === current) ? current : data[0]?.id ?? null);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudieron cargar los expedientes." });
    }
  }, []);

  useEffect(() => { void Promise.all([loadNeeds(), loadDossiers()]); }, [loadNeeds, loadDossiers]);
  useEffect(() => () => {
    analysisPollTimers.current.forEach((timer) => window.clearTimeout(timer));
    analysisPollTimers.current.clear();
  }, []);

  const selectedNeed = useMemo(() => needs.find((need) => need.id === selectedNeedId) ?? null, [needs, selectedNeedId]);
  const selectedDossier = useMemo(() => dossiers.find((dossier) => dossier.id === selectedDossierId) ?? null, [dossiers, selectedDossierId]);
  const groupedMatches = useMemo(() => {
    const groups = new Map<string, { profileId: string; name: string; image: string | null; headline: string | null; matches: EvidenceMatch[] }>();
    for (const match of matches) {
      const group = groups.get(match.professionalProfileId) ?? {
        profileId: match.professionalProfileId,
        name: match.professionalName,
        image: match.professionalImage,
        headline: match.headline,
        matches: [],
      };
      group.matches.push(match);
      groups.set(match.professionalProfileId, group);
    }
    return [...groups.values()];
  }, [matches]);

  async function retryInitialLoad() {
    setMessage(null);
    await Promise.all([loadNeeds(), loadDossiers()]);
  }

  async function createNeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    setMessage(null);
    try {
      await api<Need>("/api/v1/work-needs", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          title: data.get("title"),
          problem: data.get("problem"),
          activities: lines(String(data.get("activities") || "")),
          context: String(data.get("context") || "") || undefined,
          locationLabel: String(data.get("locationLabel") || "") || undefined,
          requiredTools: lines(String(data.get("requiredTools") || "")),
          endorsementNeeded: data.get("endorsementNeeded") === "on",
          requirements: [
            ...lines(String(data.get("requiredRequirements") || "")).map((label) => ({ label, priority: "REQUIRED" })),
            ...lines(String(data.get("desiredRequirements") || "")).map((label) => ({ label, priority: "DESIRED" })),
          ],
        }),
      });
      form.reset();
      setMessage({ type: "success", text: "Necesidad privada creada con su primera versión inmutable." });
      await loadNeeds();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo crear la necesidad." });
    } finally {
      setSubmitting(false);
    }
  }

  async function discover() {
    if (!selectedNeedId) return;
    setSearching(true);
    setMessage(null);
    try {
      setMatches(await api<EvidenceMatch[]>(`/api/v1/work-needs/${selectedNeedId}/discover`, { cache: "no-store" }));
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo explorar la evidencia." });
    } finally {
      setSearching(false);
    }
  }

  function toggleEvidence(profileId: string, revisionId: string) {
    setSelectedRevisions((current) => {
      const existing = current[profileId] ?? [];
      return { ...current, [profileId]: existing.includes(revisionId) ? existing.filter((id) => id !== revisionId) : [...existing, revisionId] };
    });
  }

  async function createDossier(profileId: string) {
    const revisionIds = selectedRevisions[profileId] ?? [];
    if (!selectedNeed?.currentRevision || !revisionIds.length) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await api("/api/v1/evaluation-dossiers", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          needRevisionId: selectedNeed.currentRevision.id,
          professionalProfileId: profileId,
          worklogRevisionIds: revisionIds,
        }),
      });
      setMessage({ type: "success", text: "Expediente privado creado. Las fuentes conservaron su autorización y versión exactas." });
      setSelectedRevisions((current) => ({ ...current, [profileId]: [] }));
      await loadDossiers();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo crear el expediente." });
    } finally {
      setSubmitting(false);
    }
  }

  async function saveAssessment(event: FormEvent<HTMLFormElement>, dossier: EvaluationDossier, requirement: Requirement & { id: string }) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const existing = dossier.assessments.find((assessment) => assessment.requirementId === requirement.id);
    setSubmitting(true);
    setMessage(null);
    try {
      await api(`/api/v1/evaluation-dossiers/${dossier.id}/assessments`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          requirementId: requirement.id,
          criterionLabel: requirement.label,
          claimState: data.get("claimState"),
          rationale: String(data.get("rationale") || "") || undefined,
          sourceIds: data.getAll("sourceIds"),
          expectedRevisionNo: existing?.revisionNo ?? 0,
        }),
      });
      setMessage({ type: "success", text: `Criterio “${requirement.label}” guardado con historial.` });
      await loadDossiers();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo guardar el criterio." });
    } finally {
      setSubmitting(false);
    }
  }

  async function addNote(event: FormEvent<HTMLFormElement>, dossierId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    setMessage(null);
    try {
      await api(`/api/v1/evaluation-dossiers/${dossierId}/notes`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ body: data.get("body") }),
      });
      form.reset();
      setMessage({ type: "success", text: "Nota interna agregada al expediente." });
      await loadDossiers();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo guardar la nota." });
    } finally {
      setSubmitting(false);
    }
  }

  async function saveQuestion(event: FormEvent<HTMLFormElement>, dossierId: string, question?: { id: string; revisionNo: number }) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    setMessage(null);
    try {
      await api(`/api/v1/evaluation-dossiers/${dossierId}/questions`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          questionId: question?.id,
          text: data.get("text"),
          expectedRevisionNo: question?.revisionNo ?? 0,
        }),
      });
      if (!question) form.reset();
      setMessage({ type: "success", text: question ? "Pregunta actualizada como nueva versión." : "Pregunta preparada como borrador interno." });
      await loadDossiers();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo guardar la pregunta." });
    } finally {
      setSubmitting(false);
    }
  }

  async function requestConversation(event: FormEvent<HTMLFormElement>, dossierId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    setMessage(null);
    try {
      await api("/api/v1/conversation-requests", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ dossierId, note: String(data.get("note") || "") || undefined }),
      });
      form.reset();
      setMessage({ type: "success", text: "Solicitud enviada. La conversación solo se creará si el profesional acepta." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo enviar la solicitud." });
    } finally {
      setSubmitting(false);
    }
  }

  function rememberAnalysisJob(dossierId: string, job: AnalysisJob) {
    setAnalysisJobs((current) => ({ ...current, [dossierId]: job }));
  }

  async function pollAnalysis(dossierId: string, jobId: string, attemptsLeft = 90) {
    if (attemptsLeft <= 0) return;
    try {
      const job = await api<AnalysisJob>(`/api/v1/analysis-jobs/${jobId}`, { cache: "no-store" });
      rememberAnalysisJob(dossierId, job);
      if (["QUEUED", "PROCESSING", "RETRY_WAIT"].includes(job.status)) {
        const timer = window.setTimeout(() => void pollAnalysis(dossierId, jobId, attemptsLeft - 1), 2_000);
        analysisPollTimers.current.set(jobId, timer);
      } else {
        analysisPollTimers.current.delete(jobId);
        await loadDossiers();
      }
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo actualizar el análisis." });
    }
  }

  async function startAnalysis(dossier: EvaluationDossier) {
    if (!dossier.sources.length) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const job = await api<AnalysisJob>("/api/v1/analysis-jobs", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          dossierId: dossier.id,
          purpose: analysisPurposes[dossier.id] ?? "EVIDENCE_SUMMARY",
          sourceRevisionIds: dossier.sources.map((source) => source.worklogRevision.id),
          expectedPolicies: dossier.sources.map((source) => ({
            sourceRevisionId: source.worklogRevision.id,
            contentHash: source.worklogRevision.contentHash,
            accessKind: source.accessKind,
          })),
        }),
      });
      rememberAnalysisJob(dossier.id, job);
      setMessage({ type: "success", text: job.status === "READY" ? "Propuesta analítica preparada con citas verificadas." : "Análisis en cola. Puedes seguir trabajando en modo manual." });
      if (["QUEUED", "PROCESSING", "RETRY_WAIT"].includes(job.status)) void pollAnalysis(dossier.id, job.id);
      else await loadDossiers();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo iniciar el análisis." });
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelAnalysis(dossierId: string, jobId: string) {
    setSubmitting(true);
    try {
      const timer = analysisPollTimers.current.get(jobId);
      if (timer) window.clearTimeout(timer);
      const job = await api<AnalysisJob>(`/api/v1/analysis-jobs/${jobId}/cancel`, { method: "POST" });
      rememberAnalysisJob(dossierId, job);
      setMessage({ type: "success", text: "Cancelación registrada. Ningún borrador parcial se aplicará." });
      await loadDossiers();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo cancelar el análisis." });
    } finally {
      setSubmitting(false);
    }
  }

  async function retryAnalysis(dossierId: string, jobId: string) {
    setSubmitting(true);
    try {
      const job = await api<AnalysisJob>(`/api/v1/analysis-jobs/${jobId}/retry`, { method: "POST" });
      rememberAnalysisJob(dossierId, job);
      setMessage({ type: "success", text: "Reintento iniciado con el mismo ámbito autorizado." });
      if (["QUEUED", "PROCESSING", "RETRY_WAIT"].includes(job.status)) void pollAnalysis(dossierId, job.id);
      else await loadDossiers();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo reintentar el análisis." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-6" aria-busy={loading || searching || submitting}>
      <header className="rounded-2xl border border-slate-200 bg-[linear-gradient(120deg,#071d2a_0%,#0b3442_58%,#0f766e_135%)] px-5 py-6 text-white shadow-[0_24px_70px_-45px_rgba(7,29,42,0.9)] sm:px-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">Descubrimiento profesional privado</p>
            <h1 className="mt-2 text-balance font-display text-3xl font-bold sm:text-4xl">De una necesidad real a evidencia explicable</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">Define el trabajo que debe resolverse, encuentra trayectoria documentada y crea expedientes internos sin puntuar personas ni ampliar permisos.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur"><strong className="block text-2xl">{needs.length}</strong><span className="text-slate-200">necesidades</span></div>
            <div className="rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur"><strong className="block text-2xl">{groupedMatches.length}</strong><span className="text-slate-200">perfiles hallados</span></div>
            <div className="col-span-2 rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur sm:col-span-1"><strong className="block text-sm">Plan {employerNeedsEntitlement.tier}</strong><span className="text-slate-200">{employerNeedsEntitlement.remaining === null ? "Piloto controlado" : `${employerNeedsEntitlement.remaining} de ${employerNeedsEntitlement.limit} usos`}</span></div>
          </div>
        </div>
      </header>

      {message ? <div role={message.type === "error" ? "alert" : "status"} aria-live={message.type === "error" ? "assertive" : "polite"} aria-atomic="true" className={`flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm font-semibold sm:flex-row sm:items-center sm:justify-between ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}><span>{message.text}</span>{message.type === "error" ? <Button type="button" variant="outline" size="sm" className="min-h-11 shrink-0 border-red-300 bg-white text-red-900 hover:bg-red-100" onClick={() => void retryInitialLoad()} disabled={loading}>Reintentar carga</Button> : null}</div> : null}
      {!employerNeedsWritable ? <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><strong>Consulta conservada.</strong> Puedes revisar necesidades y expedientes existentes, pero el piloto no admite nuevas búsquedas o expedientes en este workspace.</div> : null}
      {evidenceAnalysisUnavailableReason ? <div role="status" className="flex gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950"><Bot className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span><strong>Evaluación manual activa.</strong> {evidenceAnalysisUnavailableReason}</span></div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.6fr)]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-slate-50/70">
              <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-cyan-800"><Plus className="h-5 w-5" aria-hidden /></span><div><CardTitle>Nueva necesidad</CardTitle><CardDescription>Versión privada para tu workspace.</CardDescription></div></div>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={createNeed} className="space-y-4">
                <fieldset disabled={!employerNeedsWritable} className="space-y-4 disabled:opacity-70">
                <Field label="Título"><Input name="title" required minLength={4} placeholder="Ej. Control topográfico de obra" /></Field>
                <Field label="Problema a resolver"><Textarea name="problem" required minLength={20} placeholder="Describe el resultado esperado y por qué es necesario." /></Field>
                <Field label="Actividades"><Textarea name="activities" className="min-h-24" placeholder="Una por línea: replanteo, nivelación, informe final" /></Field>
                <Field label="Requisitos indispensables"><Textarea name="requiredRequirements" required className="min-h-24" placeholder="Uno por línea" /></Field>
                <Field label="Requisitos deseables"><Textarea name="desiredRequirements" className="min-h-20" placeholder="Uno por línea" /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Lugar"><Input name="locationLabel" placeholder="Lurín, Lima" /></Field>
                  <Field label="Herramientas"><Input name="requiredTools" placeholder="GNSS, estación total" /></Field>
                </div>
                <Field label="Contexto interno"><Textarea name="context" className="min-h-20" placeholder="Restricciones, entorno o información operativa privada." /></Field>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border bg-slate-50 px-3 text-sm font-medium"><input name="endorsementNeeded" type="checkbox" className="h-4 w-4 accent-teal-700" /> Requiere respaldo verificable</label>
                <Button type="submit" className="w-full" disabled={submitting}>{submitting ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <BriefcaseBusiness className="h-4 w-4" aria-hidden />}Crear necesidad privada</Button>
                </fieldset>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader className="gap-4 border-b sm:flex-row sm:items-center sm:justify-between">
              <div><CardTitle>Necesidades vigentes</CardTitle><CardDescription>Selecciona una versión para explorar evidencia pública o autorizada.</CardDescription></div>
              <Button onClick={() => void discover()} disabled={!employerNeedsWritable || !selectedNeedId || searching} className="shrink-0">{searching ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <UserRoundSearch className="h-4 w-4" aria-hidden />}Explorar evidencia</Button>
            </CardHeader>
            <CardContent className="pt-5">
              {loading ? <div role="status" aria-label="Cargando necesidades" className="h-24 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" /> : needs.length ? <div className="grid gap-3 md:grid-cols-2">{needs.map((need) => <button key={need.id} type="button" aria-pressed={need.id === selectedNeedId} onClick={() => { setSelectedNeedId(need.id); setMatches([]); }} className={`min-h-24 rounded-xl border p-4 text-left transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${need.id === selectedNeedId ? "border-teal-600 bg-teal-50 shadow-sm" : "bg-white hover:border-slate-300 hover:bg-slate-50"}`}><span className="flex items-center justify-between gap-2"><strong className="line-clamp-2">{need.currentRevision?.title ?? "Sin versión"}</strong><span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold">v{need.version}</span></span><span className="mt-2 line-clamp-2 text-sm text-muted-foreground">{need.currentRevision?.problem}</span></button>)}</div> : <Empty icon={<BriefcaseBusiness className="h-6 w-6" />} title="Aún no hay necesidades" body="Crea la primera con el formulario. No será publicada ni convertida en una vacante automáticamente." />}
            </CardContent>
          </Card>

          {selectedNeed && matches.length === 0 && !searching ? <Card><CardContent className="pt-6"><Empty icon={<FileSearch className="h-6 w-6" />} title="Exploración bajo control" body="La búsqueda muestra razones concretas y señales faltantes. Nunca genera una calificación única de la persona." /></CardContent></Card> : null}

          {groupedMatches.map((group) => {
            const chosen = selectedRevisions[group.profileId] ?? [];
            return <Card key={group.profileId} className="overflow-hidden">
              <CardHeader className="border-b bg-slate-50/70">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    {group.image ? <Image src={group.image} alt={`Foto de ${group.name}`} width={48} height={48} unoptimized className="h-12 w-12 rounded-xl object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-xl bg-slate-900 text-sm font-bold text-white" aria-hidden>{group.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span>}
                    <div><CardTitle className="text-lg">{group.name}</CardTitle><CardDescription>{group.headline || "Trayectoria profesional documentada"}</CardDescription></div>
                  </div>
                  <Button variant="outline" disabled={!employerNeedsWritable || !chosen.length || submitting} onClick={() => void createDossier(group.profileId)}><ShieldCheck className="h-4 w-4" aria-hidden />Crear expediente ({chosen.length})</Button>
                </div>
              </CardHeader>
              <CardContent className="divide-y p-0">
                {group.matches.map((match) => {
                  const selected = chosen.includes(match.revisionId);
                  return <button key={match.revisionId} type="button" aria-pressed={selected} onClick={() => toggleEvidence(group.profileId, match.revisionId)} className="grid w-full gap-4 p-5 text-left transition motion-reduce:transition-none hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[1fr_220px]">
                    <div><div className="flex flex-wrap items-center gap-2"><strong>{match.title || "Evidencia profesional compartida"}</strong><span className="rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">{match.accessKind === "PUBLIC_CV" ? "Perfil público" : "Selección pública"}</span></div>{match.summary ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{match.summary}</p> : null}{match.locationLabel ? <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-slate-600"><MapPin className="h-3.5 w-3.5" aria-hidden />{match.locationLabel}</span> : null}</div>
                    <div className="rounded-xl bg-slate-50 p-3"><span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-teal-800"><Sparkles className="h-3.5 w-3.5" aria-hidden />Coincidencias observables</span><p className="mt-2 text-xs leading-5 text-slate-600">{[...match.reasons.required.map((item) => item.label), ...match.reasons.desirable.map((item) => item.label), ...match.reasons.activityTerms, ...match.reasons.toolTerms].slice(0, 5).join(" · ") || "Contexto relacionado"}</p><span className={`mt-3 inline-flex items-center gap-1 text-xs font-bold ${selected ? "text-emerald-700" : "text-slate-500"}`}>{selected ? <Check className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}{selected ? "Incluida en expediente" : "Seleccionar evidencia"}</span></div>
                  </button>;
                })}
              </CardContent>
            </Card>;
          })}

          <Card className="overflow-hidden">
            <CardHeader className="gap-4 border-b bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between">
              <div><CardTitle>Expedientes internos</CardTitle><CardDescription>Evaluación humana, fuentes vigentes y notas exclusivas del workspace.</CardDescription></div>
              <span className="rounded-full border bg-white px-3 py-1 text-xs font-bold text-slate-700">{dossiers.length} activos</span>
            </CardHeader>
            <CardContent className="pt-5">
              {dossiers.length ? <div className="grid gap-3 md:grid-cols-2">{dossiers.map((dossier) => <button key={dossier.id} type="button" aria-pressed={dossier.id === selectedDossierId} onClick={() => setSelectedDossierId(dossier.id)} className={`min-h-24 rounded-xl border p-4 text-left transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${dossier.id === selectedDossierId ? "border-teal-600 bg-teal-50" : "hover:bg-slate-50"}`}><span className="flex items-start justify-between gap-3"><span><strong className="block">{dossier.professionalProfile.user.name || "Profesional Terraqo"}</strong><small className="mt-1 block text-muted-foreground">{dossier.needRevision.title} · v{dossier.needRevision.revisionNo}</small></span><AnalysisBadge status={dossier.effectiveAnalysisStatus} /></span></button>)}</div> : <Empty icon={<BookOpenCheck className="h-6 w-6" />} title="Sin expedientes" body="Selecciona evidencia de un profesional para crear una evaluación privada." />}
            </CardContent>
          </Card>

          {selectedDossier ? <Card className="overflow-hidden">
            <CardHeader className="border-b bg-[linear-gradient(115deg,#f8fafc,#ecfeff)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">S14 · Evaluación privada</p><CardTitle className="mt-2">{selectedDossier.professionalProfile.user.name || "Profesional Terraqo"}</CardTitle><CardDescription>{selectedDossier.needRevision.title} · necesidad v{selectedDossier.needRevision.revisionNo}</CardDescription></div><AnalysisBadge status={selectedDossier.effectiveAnalysisStatus} /></div>
              {selectedDossier.revokedSourceCount ? <div role="status" className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{selectedDossier.revokedSourceCount} fuente(s) perdieron autorización. Se ocultaron y los criterios afectados quedaron marcados.</div> : null}
            </CardHeader>
            <CardContent className="space-y-7 pt-6">
              {evidenceAnalysisEnabled ? <AnalysisPanel
                dossier={selectedDossier}
                job={analysisJobs[selectedDossier.id]}
                purpose={analysisPurposes[selectedDossier.id] ?? "EVIDENCE_SUMMARY"}
                busy={submitting}
                onPurposeChange={(purpose) => setAnalysisPurposes((current) => ({ ...current, [selectedDossier.id]: purpose }))}
                onStart={() => void startAnalysis(selectedDossier)}
                onCancel={(jobId) => void cancelAnalysis(selectedDossier.id, jobId)}
                onRetry={(jobId) => void retryAnalysis(selectedDossier.id, jobId)}
              /> : null}
              <section aria-labelledby="evaluation-criteria-heading">
                <div className="flex items-end justify-between gap-3"><div><h3 id="evaluation-criteria-heading" className="text-lg font-bold">Criterios de la necesidad</h3><p className="text-sm text-muted-foreground">Un estado describe la evidencia disponible; no califica a la persona.</p></div><span className="text-xs font-bold text-slate-500">{selectedDossier.assessments.length}/{selectedDossier.needRevision.requirements.length} revisados</span></div>
                <div className="mt-4 space-y-3">{selectedDossier.needRevision.requirements.map((requirement) => {
                  const assessment = selectedDossier.assessments.find((item) => item.requirementId === requirement.id);
                  return <form key={requirement.id} onSubmit={(event) => void saveAssessment(event, selectedDossier, requirement)} className="rounded-xl border p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide">{requirement.priority === "REQUIRED" ? "Indispensable" : "Deseable"}</span><h4 className="mt-2 font-bold">{requirement.label}</h4>{assessment?.sourceState === "SOURCE_REVOKED" ? <p className="mt-1 text-xs font-semibold text-amber-700">Una fuente citada fue retirada; revisa el criterio.</p> : null}</div><select name="claimState" defaultValue={assessment?.claimState ?? "UNKNOWN"} disabled={!employerNeedsWritable} aria-label={`Estado de ${requirement.label}`} className="min-h-11 rounded-lg border bg-background px-3 text-sm font-semibold"><option value="UNKNOWN">Por confirmar</option><option value="DECLARED">Declarado</option><option value="DOCUMENTED">Documentado</option><option value="ENDORSED">Respaldado</option><option value="CONFIRMED">Confirmado con alcance</option></select></div>
                    <label className="mt-3 grid gap-2 text-sm font-semibold"><span>Conclusión y sustento</span><Textarea name="rationale" defaultValue={assessment?.rationale ?? ""} disabled={!employerNeedsWritable} className="min-h-20" placeholder="Conclusión manual o información que falta confirmar." /></label>
                    <fieldset disabled={!employerNeedsWritable} className="mt-3"><legend className="text-xs font-bold uppercase tracking-wide text-slate-500">Fuentes exactas</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{selectedDossier.sources.map((source) => <label key={source.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border bg-slate-50 px-3 text-xs font-medium"><input type="checkbox" name="sourceIds" value={source.id} defaultChecked={assessment?.sourceIds.includes(source.id)} className="h-4 w-4 accent-teal-700" /><span className="line-clamp-2">{source.worklogRevision.title || "Evidencia autorizada"}</span></label>)}</div></fieldset>
                    <div className="mt-3 flex justify-end"><Button type="submit" size="sm" disabled={!employerNeedsWritable || submitting}><Check className="h-4 w-4" aria-hidden />Guardar criterio</Button></div>
                  </form>;
                })}</div>
              </section>

              <section className="grid gap-5 lg:grid-cols-2">
                <div id="evaluation-notes" className="scroll-mt-24 rounded-xl border p-4"><div className="flex items-center gap-2"><MessageSquareText className="h-5 w-5 text-teal-700" aria-hidden /><h3 className="font-bold">Notas internas</h3></div><p className="mt-1 text-xs text-muted-foreground">Nunca se muestran al profesional ni salen en DTOs públicos.</p><form onSubmit={(event) => void addNote(event, selectedDossier.id)} className="mt-3 space-y-3"><label className="grid gap-2 text-sm font-semibold"><span>Observación del equipo</span><Textarea name="body" required minLength={2} disabled={!employerNeedsWritable} className="min-h-24" placeholder="Contexto privado para la evaluación." /></label><Button type="submit" variant="outline" disabled={!employerNeedsWritable || submitting}>Agregar nota</Button></form><div className="mt-4 space-y-2">{selectedDossier.notes.map((note) => <article key={note.id} className="rounded-lg bg-slate-50 p-3"><p className="text-sm leading-6">{note.body}</p><p className="mt-2 text-[11px] font-medium text-slate-500">{note.createdBy.name || "Equipo Terraqo"} · {new Date(note.createdAt).toLocaleString("es-PE")}</p></article>)}</div></div>
                <div className="rounded-xl border p-4"><div className="flex items-center gap-2"><FileSearch className="h-5 w-5 text-teal-700" aria-hidden /><h3 className="font-bold">Preguntas para confirmar</h3></div><p className="mt-1 text-xs text-muted-foreground">Borradores editables. Guardar no los envía.</p><form onSubmit={(event) => void saveQuestion(event, selectedDossier.id)} className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="grid gap-2 text-sm font-semibold"><span>Pregunta interna</span><Input name="text" required minLength={4} disabled={!employerNeedsWritable} placeholder="¿Qué alcance tuvo tu participación?" /></label><Button type="submit" size="icon" className="min-h-11 min-w-11 self-end" aria-label="Agregar pregunta" disabled={!employerNeedsWritable || submitting}><Plus className="h-4 w-4" aria-hidden /></Button></form><div className="mt-4 space-y-2">{selectedDossier.questions.map((question) => <form key={question.id} onSubmit={(event) => void saveQuestion(event, selectedDossier.id, question)} className="grid gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-[minmax(0,1fr)_auto]"><Input name="text" defaultValue={question.text} disabled={!employerNeedsWritable} aria-label="Editar pregunta" /><Button type="submit" variant="outline" size="sm" disabled={!employerNeedsWritable || submitting}>Guardar</Button></form>)}</div></div>
              </section>

              <section id="evaluation-sources" className="scroll-mt-24"><h3 className="font-bold">Fuentes autorizadas</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{selectedDossier.sources.map((source) => <details key={source.id} className="rounded-xl border bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-semibold">{source.worklogRevision.title || "Evidencia autorizada"}</summary><dl className="mt-3 grid gap-1 text-xs text-slate-600"><div><dt className="inline font-bold">Versión: </dt><dd className="inline">{source.worklogRevision.id}</dd></div><div><dt className="inline font-bold">Huella: </dt><dd className="inline break-all">{source.worklogRevision.contentHash}</dd></div><div><dt className="inline font-bold">Acceso: </dt><dd className="inline">{source.accessKind}</dd></div></dl></details>)}</div></section>
              {contextualMessagingEnabled && employerNeedsWritable ? <section className="rounded-xl border border-teal-200 bg-teal-50/60 p-4"><h3 className="font-bold text-teal-950">Solicitar conversación</h3><p className="mt-1 text-sm text-teal-900/75">La referencia al expediente será neutral para el profesional y no concede acceso a fuentes, criterios ni notas.</p><form onSubmit={(event) => void requestConversation(event, selectedDossier.id)} className="mt-3 flex flex-col gap-3 sm:flex-row"><Input name="note" maxLength={1200} placeholder="Motivo breve de contacto (opcional)" /><Button type="submit" disabled={submitting}><MessageSquareText className="h-4 w-4" aria-hidden />Enviar solicitud</Button></form></section> : null}
            </CardContent>
          </Card> : null}
        </div>
      </div>
    </section>
  );
}

function AnalysisPanel({ dossier, job, purpose, busy, onPurposeChange, onStart, onCancel, onRetry }: {
  dossier: EvaluationDossier;
  job?: AnalysisJob;
  purpose: AnalysisPurpose;
  busy: boolean;
  onPurposeChange: (purpose: AnalysisPurpose) => void;
  onStart: () => void;
  onCancel: (jobId: string) => void;
  onRetry: (jobId: string) => void;
}) {
  const sourceTitles = new Map(dossier.sources.map((source) => [source.id, source.worklogRevision.title || "Evidencia autorizada"]));
  const active = job && ["QUEUED", "PROCESSING", "RETRY_WAIT"].includes(job.status);
  const kinds = {
    EXPLICIT_DATA: "Dato explícito",
    DECLARATION_SUMMARY: "Resumen de declaración",
    PROPOSED_INTERPRETATION: "Interpretación propuesta",
  } as const;
  return <section aria-labelledby="analysis-heading" className="overflow-hidden rounded-2xl border border-cyan-200 bg-[linear-gradient(135deg,#f8fafc_0%,#ecfeff_100%)]">
    <div className="flex flex-col gap-4 border-b border-cyan-100 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-950 text-cyan-200"><Bot className="h-5 w-5" aria-hidden /></span>
        <div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-800">T18 · Asistencia con evidencia</p><h3 id="analysis-heading" className="mt-1 text-lg font-bold">Propuesta analítica con citas</h3><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Solo procesa las revisiones visibles del expediente. No confirma capacidades, no envía mensajes y no reemplaza la evaluación humana.</p></div>
      </div>
      {job ? <JobStatus status={job.status} /> : null}
    </div>
    <div className="space-y-4 p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <label className="grid gap-2 text-sm font-semibold"><span>Finalidad del análisis</span><select value={purpose} onChange={(event) => onPurposeChange(event.target.value as AnalysisPurpose)} disabled={Boolean(active) || busy} className="min-h-11 rounded-lg border bg-white px-3"><option value="EVIDENCE_SUMMARY">Resumir evidencia seleccionada</option><option value="REQUIREMENT_GAPS">Detectar información faltante</option><option value="QUESTION_DRAFTS">Proponer preguntas de confirmación</option></select></label>
        <div className="flex items-end gap-2"><Button type="button" onClick={onStart} disabled={busy || Boolean(active) || dossier.sources.length === 0}><Sparkles className="h-4 w-4" aria-hidden />{job && ["READY", "INSUFFICIENT", "CANCELLED", "SOURCE_REVOKED"].includes(job.status) ? "Nuevo análisis" : "Analizar fuentes"}</Button>{active && job?.cancellable ? <Button type="button" variant="outline" onClick={() => onCancel(job.id)} disabled={busy}><Ban className="h-4 w-4" aria-hidden />Cancelar</Button> : null}{job?.retryable ? <Button type="button" variant="outline" onClick={() => onRetry(job.id)} disabled={busy}><RotateCcw className="h-4 w-4" aria-hidden />Reintentar</Button> : null}</div>
      </div>
      {active ? <div role="status" aria-live="polite" aria-atomic="true" className="flex items-center gap-3 rounded-xl border bg-white p-4 text-sm"><LoaderCircle className="h-5 w-5 animate-spin text-cyan-700 motion-reduce:animate-none" aria-hidden /><span><strong>Validando y analizando.</strong> Intento {job.attemptCount}/{job.maxAttempts}. Puedes continuar con la revisión manual.</span></div> : null}
      {job?.claims.length ? <div className="space-y-3"><div><h4 className="font-bold">Hallazgos propuestos</h4><p className="text-xs text-muted-foreground">Cada tarjeta enlaza el fragmento exacto que la sustenta.</p></div>{job.claims.map((claim, index) => <article key={`${claim.text}-${index}`} className="rounded-xl border bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-2"><p className="max-w-3xl text-sm font-semibold leading-6">{claim.text}</p><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-700">{kinds[claim.kind]}</span></div><div className="mt-3 flex flex-wrap gap-2">{claim.citations.map((citation) => <span key={`${citation.sourceId}-${citation.field}-${citation.excerpt}`} title={citation.excerpt} className="rounded-lg border border-cyan-100 bg-cyan-50 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-950">{sourceTitles.get(citation.sourceId) || "Fuente autorizada"} · {citation.field}</span>)}</div></article>)}</div> : null}
      {job?.missing.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex gap-2"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden /><div><h4 className="font-bold text-amber-950">Información que no puede concluirse</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-amber-950/80">{job.missing.map((item) => <li key={item}>{item}</li>)}</ul></div></div></div> : null}
      {job?.status === "FAILED" ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">El análisis falló de forma segura ({job.failureCode || "sin detalle"}). No se aplicó ningún resultado parcial.</div> : null}
      {job?.status === "SOURCE_REVOKED" ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Una fuente fue editada, retirada o perdió autorización. Los resultados anteriores quedaron ocultos.</div> : null}
      {job?.status === "CANCELLED" ? <div role="status" className="rounded-xl border bg-white p-4 text-sm text-slate-700">Análisis cancelado. El expediente y la evaluación manual permanecen intactos.</div> : null}
      {job && !active && (job.usage.inputTokens !== null || job.usage.latencyMs !== null) ? <p className="text-[11px] text-slate-500">Trazabilidad: {job.usage.inputTokens ?? "—"} tokens de entrada · {job.usage.outputTokens ?? "—"} de salida · {job.usage.latencyMs ?? "—"} ms{job.usage.estimatedCostMicros ? ` · ${job.usage.estimatedCostMicros} micro-unidades estimadas` : ""}</p> : null}
      {job && !active ? <nav aria-label="Controles de revisión del análisis" className="flex flex-wrap gap-2 border-t border-cyan-100 pt-3 text-xs font-bold"><a href="#evaluation-criteria-heading" className="inline-flex min-h-11 items-center rounded-lg border bg-white px-3 py-2 text-slate-700 hover:border-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700">Corregir en evaluación manual</a><a href="#evaluation-sources" className="inline-flex min-h-11 items-center rounded-lg border bg-white px-3 py-2 text-slate-700 hover:border-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700">Volver a las fuentes</a><a href="#evaluation-notes" className="inline-flex min-h-11 items-center rounded-lg border bg-white px-3 py-2 text-slate-700 hover:border-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700">Reportar observación interna</a></nav> : null}
    </div>
  </section>;
}

function JobStatus({ status }: { status: AnalysisJob["status"] }) {
  const labels: Record<AnalysisJob["status"], string> = { QUEUED: "En cola", PROCESSING: "Procesando", RETRY_WAIT: "Reintentando", READY: "Listo para revisar", INSUFFICIENT: "Evidencia insuficiente", FAILED: "Falló", CANCELLED: "Cancelado", SOURCE_REVOKED: "Fuente retirada" };
  const warning = ["INSUFFICIENT", "FAILED", "CANCELLED", "SOURCE_REVOKED"].includes(status);
  return <span role="status" aria-live="polite" aria-atomic="true" className={`inline-flex min-h-8 shrink-0 items-center rounded-full border px-3 text-xs font-bold ${warning ? "border-amber-200 bg-amber-50 text-amber-900" : "border-cyan-200 bg-white text-cyan-900"}`}>{labels[status]}</span>;
}

function AnalysisBadge({ status }: { status: EvaluationDossier["effectiveAnalysisStatus"] }) {
  const labels: Record<EvaluationDossier["effectiveAnalysisStatus"], string> = { NOT_REQUESTED: "Manual", PROCESSING: "Procesando", READY: "Analizado", FAILED: "Falló", INSUFFICIENT: "Fuentes insuficientes", SOURCE_REVOKED: "Fuente retirada" };
  const warning = status === "FAILED" || status === "INSUFFICIENT" || status === "SOURCE_REVOKED";
  return <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-[11px] font-bold ${warning ? "border-amber-200 bg-amber-50 text-amber-800" : "border-teal-200 bg-teal-50 text-teal-800"}`}>{labels[status]}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-semibold"><span>{label}</span>{children}</label>;
}

function Empty({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <div className="grid min-h-44 place-items-center rounded-xl border border-dashed bg-slate-50 p-6 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-white text-slate-700 shadow-sm">{icon}</span><h3 className="mt-3 font-bold">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{body}</p></div></div>;
}
