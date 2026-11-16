"use client";

import { DiscoveryEvidenceExplorer, emptyDiscoveryFilters, type DiscoveryFilters, type EvidenceMatch } from "@/components/admin/discovery-evidence-explorer";
import { DiscoveryNeedEditor, type EditableNeed } from "@/components/admin/discovery-need-editor";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ban, BookOpenCheck, Bot, BriefcaseBusiness, Check, CircleAlert, FileSearch, LoaderCircle, MessageSquareText, Plus, RotateCcw, Sparkles, UserRoundSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Requirement = { id?: string; label: string; priority: "REQUIRED" | "DESIRED" };
type Need = EditableNeed;
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
  const [explored, setExplored] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const discoveryGeneration = useRef(0);
  const dossierGeneration = useRef(0);
  const analysisGeneration = useRef(0);
  const discoveryAbort = useRef<AbortController | null>(null);
  const activeDiscovery = useRef<{ needId: string; filters: DiscoveryFilters } | null>(null);
  const refreshDiscovery = useRef<() => void>(() => {});
  const dossierSubmission = useRef(false);
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
  const [editingNeed, setEditingNeed] = useState<Need | null>(null);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const employerNeedsExistingWritable = ["ACTIVE", "LIMIT_REACHED"].includes(employerNeedsEntitlement.status);
  const employerNeedsWritable = employerNeedsEntitlement.status === "ACTIVE";

  const loadNeeds = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Need[]>("/api/v1/work-needs", { cache: "no-store" });
      setNeeds(data);
      setSelectedNeedId((current) => current && data.some((need) => need.id === current) ? current : data[0]?.id ?? null);
      return data;
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudieron cargar las necesidades." });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDossiers = useCallback(async () => {
    const generation = ++dossierGeneration.current;
    try {
      const data = await api<EvaluationDossier[]>("/api/v1/evaluation-dossiers", { cache: "no-store" });
      if (generation !== dossierGeneration.current) return;
      setDossiers(data);
      setAnalysisJobs(current => Object.fromEntries(Object.entries(current).filter(([id]) => {
        const dossier = data.find(item => item.id === id);
        return dossier && !dossier.revokedSourceCount && dossier.effectiveAnalysisStatus !== "SOURCE_REVOKED";
      })));
      setSelectedDossierId((current) => current && data.some((dossier) => dossier.id === current) ? current : data[0]?.id ?? null);
    } catch (error) {
      if (generation !== dossierGeneration.current) return;
      setDossiers([]);
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
  async function retryInitialLoad() {
    setMessage(null);
    await Promise.all([loadNeeds(), loadDossiers()]);
  }

  async function discardEditorChanges() {
    if (editorBusy || searching) return;
    if (editingNeed) {
      setEditorBusy(true);
      const data = await loadNeeds();
      setEditorBusy(false);
      if (!data) return;
      setEditingNeed(data.find((item) => item.id === editingNeed.id) ?? null);
    }
    setEditorDirty(false);
    setEditorEpoch((current) => current + 1);
  }

  // Any authorization refresh retires derived local content before fetching new policy projections.
  function clearDerivedContent() {
    dossierGeneration.current += 1;
    analysisGeneration.current += 1;
    analysisPollTimers.current.forEach(timer => window.clearTimeout(timer));
    analysisPollTimers.current.clear();
    setDossiers([]);
    setAnalysisJobs({});
    setAnalysisPurposes({});
  }

  function resetDiscovery() {
    discoveryGeneration.current += 1;
    discoveryAbort.current?.abort();
    activeDiscovery.current = null;
    setMatches([]);
    setSelectedRevisions({});
    setExplored(false);
    setDiscoveryError(null);
    setSearching(false);
  }

  async function discover(needId = selectedNeedId, filters = emptyDiscoveryFilters) {
    if (!needId || !employerNeedsExistingWritable) return null;
    const generation = ++discoveryGeneration.current;
    discoveryAbort.current?.abort();
    const controller = new AbortController();
    discoveryAbort.current = controller;
    activeDiscovery.current = { needId, filters: { ...filters } };
    setSearching(true);
    setDiscoveryError(null);
    setMessage(null);
    setMatches([]);
    try {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) if (value.trim()) query.set(key, value.trim());
      const data = await api<EvidenceMatch[]>(`/api/v1/work-needs/${encodeURIComponent(needId)}/discover${query.size ? `?${query}` : ""}`, { cache: "no-store", signal: controller.signal });
      if (generation !== discoveryGeneration.current) return null;
      // An older server response cannot produce a dossier bound to a guessed need revision.
      const authorized = data.filter(match => Boolean(match.revisionId && match.needRevisionId));
      if (matches.some(previous => !authorized.some(match => match.revisionId === previous.revisionId && match.accessKind === previous.accessKind && match.accessReferenceId === previous.accessReferenceId))) clearDerivedContent();
      setMatches(authorized);
      setSelectedRevisions(current => Object.fromEntries(Object.entries(current).map(([profileId, ids]) => [profileId,
        ids.filter(id => authorized.some(match => match.revisionId === id && match.professionalProfileId === profileId && matches.some(previous => previous.revisionId === id && previous.needRevisionId === match.needRevisionId && previous.accessKind === match.accessKind && previous.accessReferenceId === match.accessReferenceId))),
      ]).filter(([, ids]) => ids.length)));
      setExplored(true);
      await loadDossiers();
      return generation === discoveryGeneration.current ? authorized : null;
    } catch (error) {
      if (generation !== discoveryGeneration.current) return null;
      setMatches([]);
      setSelectedRevisions({});
      clearDerivedContent();
      setDiscoveryError(error instanceof Error ? error.message : "No se pudo explorar la evidencia.");
      return null;
    } finally {
      if (generation === discoveryGeneration.current) setSearching(false);
    }
  }

  function toggleEvidence(profileId: string, revisionId: string) {
    if (searching || submitting || !matches.some(match => match.revisionId === revisionId && match.professionalProfileId === profileId)) return;
    setSelectedRevisions(current => {
      const existing = current[profileId] ?? [];
      return { ...current, [profileId]: existing.includes(revisionId) ? existing.filter(id => id !== revisionId) : [...existing, revisionId] };
    });
  }

  async function createDossier(profileId: string) {
    if (dossierSubmission.current || !employerNeedsExistingWritable || searching || editorDirty || editorBusy) return;
    const chosen = matches.filter(match => match.professionalProfileId === profileId && selectedRevisions[profileId]?.includes(match.revisionId));
    const needRevisionId = chosen[0]?.needRevisionId;
    const scope = activeDiscovery.current;
    if (!scope || !needRevisionId || !chosen.length || chosen.some(match => match.needRevisionId !== needRevisionId)) return;
    dossierSubmission.current = true;
    setSubmitting(true);
    setMessage(null);
    try {
      const fresh = await discover(scope.needId, scope.filters);
      if (!fresh || chosen.some(reference => !fresh.some(match => match.revisionId === reference.revisionId && match.professionalProfileId === profileId && match.needRevisionId === needRevisionId && match.accessKind === reference.accessKind && match.accessReferenceId === reference.accessReferenceId))) {
        setSelectedRevisions({});
        setMessage({ type: "error", text: "La fuente o la versión de la necesidad cambió. Revisa los trabajos vigentes antes de crear el expediente." });
        return;
      }
      await api("/api/v1/evaluation-dossiers", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ needRevisionId, professionalProfileId: profileId, worklogRevisionIds: chosen.map(match => match.revisionId),
          sourceRefs: chosen.map(match => ({ revisionId: match.revisionId, accessKind: match.accessKind, accessReferenceId: match.accessReferenceId })),
        }),
      });
      setSelectedRevisions(current => ({ ...current, [profileId]: [] }));
      setMessage({ type: "success", text: "Expediente privado creado con las referencias y versiones autorizadas." });
      await loadDossiers();
    } catch (error) {
      resetDiscovery();
      clearDerivedContent();
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo crear el expediente. Vuelve a comprobar las fuentes." });
    } finally {
      dossierSubmission.current = false;
      setSubmitting(false);
    }
  }

  useEffect(() => {
    refreshDiscovery.current = () => {
      const scope = activeDiscovery.current;
      if (scope && !document.hidden && !searching && !submitting && !editorBusy) void discover(scope.needId, scope.filters);
    };
  });
  useEffect(() => {
    const refresh = () => refreshDiscovery.current();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  useEffect(() => () => { discoveryAbort.current?.abort(); discoveryGeneration.current += 1; dossierGeneration.current += 1; analysisGeneration.current += 1; }, []);

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
    setAnalysisJobs((current) => ({ ...current, [dossierId]: job.status === "SOURCE_REVOKED" ? { ...job, claims: [], missing: [] } : job }));
  }

  async function pollAnalysis(dossierId: string, jobId: string, attemptsLeft = 90) {
    if (attemptsLeft <= 0) return;
    const generation = analysisGeneration.current;
    try {
      const job = await api<AnalysisJob>(`/api/v1/analysis-jobs/${jobId}`, { cache: "no-store" });
      if (generation !== analysisGeneration.current) return;
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
    const generation = analysisGeneration.current;
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
      if (generation !== analysisGeneration.current) return;
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
    const generation = analysisGeneration.current;
    setSubmitting(true);
    try {
      const timer = analysisPollTimers.current.get(jobId);
      if (timer) window.clearTimeout(timer);
      const job = await api<AnalysisJob>(`/api/v1/analysis-jobs/${jobId}/cancel`, { method: "POST" });
      if (generation !== analysisGeneration.current) return;
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
    const generation = analysisGeneration.current;
    setSubmitting(true);
    try {
      const job = await api<AnalysisJob>(`/api/v1/analysis-jobs/${jobId}/retry`, { method: "POST" });
      if (generation !== analysisGeneration.current) return;
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
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Definir necesidad</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Describe el trabajo y revisa los criterios para encontrar evidencia relacionada.</p></div>
        <p className="text-sm text-muted-foreground">Plan {employerNeedsEntitlement.tier} · {employerNeedsEntitlement.remaining === null ? "Piloto controlado" : `${employerNeedsEntitlement.remaining} nuevas necesidades disponibles`}</p>
      </header>

      {message ? <div role={message.type === "error" ? "alert" : "status"} aria-live={message.type === "error" ? "assertive" : "polite"} aria-atomic="true" className={`flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm font-semibold sm:flex-row sm:items-center sm:justify-between ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}><span>{message.text}</span>{message.type === "error" ? <Button type="button" variant="outline" size="sm" className="min-h-11 shrink-0 border-red-300 bg-white text-red-900 hover:bg-red-100" onClick={() => void retryInitialLoad()} disabled={loading}>Reintentar carga</Button> : null}</div> : null}
      {!employerNeedsWritable ? <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{employerNeedsEntitlement.status === "LIMIT_REACHED" ? <><strong>Límite de nuevas necesidades alcanzado.</strong> Puedes editar y buscar con tus necesidades existentes.</> : <><strong>Consulta conservada.</strong> Puedes revisar las necesidades y evaluaciones existentes. La edición y búsqueda no están habilitadas.</>}</div> : null}
      {evidenceAnalysisUnavailableReason ? <div role="status" className="flex gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950"><Bot className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span><strong>Evaluación manual activa.</strong> {evidenceAnalysisUnavailableReason}</span></div> : null}

      <div className="space-y-6">
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {editingNeed ? <Button type="button" variant="outline" disabled={editorDirty || editorBusy} onClick={() => { setEditingNeed(null); setEditorEpoch((current) => current + 1); }}>Nueva necesidad</Button> : null}
            {editorDirty ? <Button type="button" variant="outline" disabled={editorBusy} onClick={() => void discardEditorChanges()}>Descartar cambios sin guardar</Button> : null}
          </div>
          <DiscoveryNeedEditor key={`${editingNeed?.id ?? "new"}-${editorEpoch}`} need={editingNeed} writable={!loading && !searching && (editingNeed ? employerNeedsExistingWritable && editingNeed.lifecycle !== "ARCHIVED" : employerNeedsWritable)} onDirtyChange={setEditorDirty} onBusyChange={setEditorBusy} onSaved={async (saved, search) => {
            setNeeds((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
            setSelectedNeedId(saved.id);
            setEditingNeed(saved);
            setEditorDirty(false);
            if (!search) setEditorEpoch((current) => current + 1);
            resetDiscovery();
            setMessage({ type: "success", text: `Borrador guardado · versión ${saved.version}. Las evaluaciones anteriores conservan su versión.` });
            if (search) { await discover(saved.id); setEditorEpoch((current) => current + 1); }
          }} />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader className="gap-4 border-b sm:flex-row sm:items-center sm:justify-between">
              <div><CardTitle>Borradores y necesidades</CardTitle><CardDescription>Selecciona una versión para explorar evidencia pública o autorizada.</CardDescription></div>
              <Button onClick={() => void discover()} disabled={!employerNeedsExistingWritable || !selectedNeedId || selectedNeed?.lifecycle === "ARCHIVED" || searching || editorDirty || editorBusy} className="shrink-0">{searching ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <UserRoundSearch className="h-4 w-4" aria-hidden />}Explorar evidencia</Button>
            </CardHeader>
            <CardContent className="pt-5">
              {loading ? <div role="status" aria-label="Cargando necesidades" className="h-24 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" /> : needs.length ? <div className="grid gap-3 md:grid-cols-2">{needs.map((need) => <button key={need.id} type="button" aria-pressed={need.id === selectedNeedId} disabled={editorDirty || editorBusy || searching} onClick={() => { setSelectedNeedId(need.id); resetDiscovery(); }} className={`min-h-24 rounded-xl border p-4 text-left transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${need.id === selectedNeedId ? "border-teal-600 bg-teal-50 shadow-sm" : "bg-white hover:border-slate-300 hover:bg-slate-50"}`}><span className="flex items-center justify-between gap-2"><strong className="line-clamp-2">{need.currentRevision?.title ?? "Sin versión"}</strong><span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold">{need.lifecycle === "DRAFT" ? "Borrador" : need.lifecycle === "ARCHIVED" ? "Archivada" : "Activa"} · v{need.version}</span></span><span className="mt-2 line-clamp-2 text-sm text-muted-foreground">{need.currentRevision?.problem}</span></button>)}</div> : <Empty icon={<BriefcaseBusiness className="h-6 w-6" />} title="Aún no hay necesidades" body="Crea la primera con el formulario. No será publicada ni convertida en una vacante automáticamente." />}
            </CardContent>
          </Card>

          {selectedNeed?.currentRevision ? <section className="rounded-xl border bg-white p-5" aria-label="Versión seleccionada de la necesidad"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-bold">{selectedNeed.currentRevision.title}</h3><p className="mt-1 text-xs font-semibold text-slate-500">Versión {selectedNeed.version} · {selectedNeed.lifecycle === "DRAFT" ? "Borrador privado" : selectedNeed.lifecycle === "ARCHIVED" ? "Archivada" : "Activa"}</p></div><Button type="button" variant="outline" disabled={!employerNeedsExistingWritable || editorDirty || editorBusy || searching || selectedNeed.lifecycle === "ARCHIVED"} onClick={() => { setEditingNeed(selectedNeed); setEditorEpoch((current) => current + 1); setEditorDirty(false); }}>Editar borrador</Button></div><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{selectedNeed.currentRevision.problem}</p><p className="mt-3 text-xs leading-5 text-slate-500">{selectedNeed.currentRevision.requirements.length} requisitos definidos. Las evaluaciones conservan la versión con la que se crearon.</p>{editorDirty ? <p role="status" className="mt-3 text-sm font-semibold text-amber-800">Guarda o descarta los cambios y revisa las sugerencias pendientes antes de buscar.</p> : null}</section> : null}

          {selectedNeed?.currentRevision ? <DiscoveryEvidenceExplorer
            key={`${selectedNeed.id}-${selectedNeed.currentRevision.id}`}
            need={selectedNeed}
            matches={matches} selected={selectedRevisions} searching={searching} explored={explored} error={discoveryError}
            writable={employerNeedsExistingWritable && selectedNeed.lifecycle !== "ARCHIVED" && !editorDirty && !editorBusy}
            submitting={submitting}
            onSearch={filters => { void discover(selectedNeed.id, filters); }}
            onToggle={toggleEvidence} onCreate={profileId => void createDossier(profileId)}
            onEdit={() => { setEditingNeed(selectedNeed); setEditorEpoch(current => current + 1); setEditorDirty(false); }}
          /> : null}

          <Card className="overflow-hidden">
            <CardHeader className="gap-4 border-b bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between">
              <div><CardTitle>Expedientes internos</CardTitle><CardDescription>Evaluación humana, fuentes vigentes y notas exclusivas del workspace.</CardDescription></div>
              <span className="rounded-full border bg-white px-3 py-1 text-xs font-bold text-slate-700">{dossiers.length} activos</span>
            </CardHeader>
            <CardContent className="pt-5">
              {dossiers.length ? <div className="grid gap-3 md:grid-cols-2">{dossiers.map((dossier) => <button key={dossier.id} type="button" aria-pressed={dossier.id === selectedDossierId} onClick={() => setSelectedDossierId(dossier.id)} className={`min-h-24 rounded-xl border p-4 text-left transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${dossier.id === selectedDossierId ? "border-teal-600 bg-teal-50" : "hover:bg-slate-50"}`}><span className="flex items-start justify-between gap-3"><span><strong className="block">{dossier.professionalProfile.user.name || "Profesional Terraqo"}</strong><small className="mt-1 block text-muted-foreground">{dossier.needRevision.title} · v{dossier.needRevision.revisionNo}</small></span><AnalysisBadge status={dossier.effectiveAnalysisStatus} /></span></button>)}</div> : <Empty icon={<BookOpenCheck className="h-6 w-6" />} title="Sin expedientes" body="Selecciona evidencia de un profesional para crear una evaluación privada." />}
            </CardContent>
          </Card>

          {selectedDossier ? <Card key={`${selectedDossier.id}-${selectedDossier.revokedSourceCount}-${selectedDossier.sources.map(source => source.worklogRevision.id).join("-")}`} className="overflow-hidden">
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

function Empty({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <div className="grid min-h-44 place-items-center rounded-xl border border-dashed bg-slate-50 p-6 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-white text-slate-700 shadow-sm">{icon}</span><h3 className="mt-3 font-bold">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{body}</p></div></div>;
}
