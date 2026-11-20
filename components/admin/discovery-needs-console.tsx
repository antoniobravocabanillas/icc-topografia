"use client";

import { DiscoveryEvidenceExplorer, emptyDiscoveryFilters, type DiscoveryFilters, type EvidenceMatch } from "@/components/admin/discovery-evidence-explorer";
import { DiscoveryEvaluationSource } from "@/components/admin/discovery-evaluation-source";
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
  const [openedSource, setOpenedSource] = useState<{ dossierId: string; sourceId: string; revisionId: string; nonce: number } | null>(null);
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, Array<{ id: string; text: string }>>>({});
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
      setOpenedSource(current => current && data.some(dossier => dossier.id === current.dossierId && !dossier.revokedSourceCount && dossier.sources.some(source => source.id === current.sourceId && source.worklogRevision.id === current.revisionId)) ? current : null);
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
  const sourceUnavailable = useCallback(() => {
    setOpenedSource(null);
    setQuestionDrafts({});
    analysisGeneration.current += 1;
    analysisPollTimers.current.forEach(timer => window.clearTimeout(timer));
    analysisPollTimers.current.clear();
    setAnalysisJobs({});
    setDossiers([]);
    setMessage({ type: "error", text: "Fuente retirada o no disponible. Se ocultaron sus resultados. Revisa las fuentes vigentes; puedes continuar la evaluación manual." });
    void loadDossiers();
  }, [loadDossiers]);

  function openSource(dossier: EvaluationDossier, sourceId: string, revisionId?: string) {
    const source = dossier.sources.find(item => item.id === sourceId);
    if (!source || (revisionId && source.worklogRevision.id !== revisionId)) { sourceUnavailable(); return; }
    setOpenedSource({ dossierId: dossier.id, sourceId, revisionId: revisionId ?? source.worklogRevision.id, nonce: Date.now() });
    window.requestAnimationFrame(() => { const viewer = document.getElementById("evaluation-source-viewer"); viewer?.scrollIntoView({ block: "nearest", behavior: "instant" }); viewer?.focus(); });
  }

  function prepareQuestions(dossier: EvaluationDossier) {
    const missing = dossier.needRevision.requirements.filter(requirement => requirement.priority === "REQUIRED" && !dossier.assessments.some(item => item.requirementId === requirement.id && item.claimState !== "UNKNOWN" && item.sourceState === "ACTIVE"));
    const drafts = missing.map(requirement => ({ id: requirement.id, text: `¿Puedes precisar tu participación y aportar evidencia sobre «${requirement.label}»?` }));
    setQuestionDrafts(current => ({ ...current, [dossier.id]: drafts.length ? drafts : [{ id: "scope", text: "¿Qué alcance tuvo tu participación en los trabajos seleccionados y qué información falta confirmar?" }] }));
    window.requestAnimationFrame(() => document.getElementById("evaluation-questions")?.scrollIntoView({ block: "nearest", behavior: "instant" }));
  }

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
    setOpenedSource(null);
    setQuestionDrafts({});
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
      const draftId = form.dataset.draftId;
      if (draftId !== undefined) setQuestionDrafts(current => ({ ...current, [dossierId]: (current[dossierId] ?? []).filter(draft => draft.id !== draftId) }));
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
              {dossiers.length ? <div className="grid gap-3 md:grid-cols-2">{dossiers.map((dossier) => <button key={dossier.id} type="button" aria-pressed={dossier.id === selectedDossierId} onClick={() => { setOpenedSource(null); setSelectedDossierId(dossier.id); }} className={`min-h-24 rounded-xl border p-4 text-left transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${dossier.id === selectedDossierId ? "border-teal-600 bg-teal-50" : "hover:bg-slate-50"}`}><span className="flex items-start justify-between gap-3"><span><strong className="block">{dossier.professionalProfile.user.name || "Profesional Terraqo"}</strong><small className="mt-1 block text-muted-foreground">{dossier.needRevision.title} · v{dossier.needRevision.revisionNo}</small></span><AnalysisBadge status={dossier.effectiveAnalysisStatus} /></span></button>)}</div> : <Empty icon={<BookOpenCheck className="h-6 w-6" />} title="Sin expedientes" body="Selecciona evidencia de un profesional para crear una evaluación privada." />}
            </CardContent>
          </Card>

          {selectedDossier ? <Card key={`${selectedDossier.id}-${selectedDossier.revokedSourceCount}-${selectedDossier.sources.map(source => source.worklogRevision.id).join("-")}`} role="region" aria-label="Evaluación privada" className="overflow-hidden border-slate-700 bg-[#061321] text-slate-100 selection:bg-blue-700 selection:text-white" style={{ colorScheme: "dark" }}>
            <CardHeader className="border-b border-slate-700 bg-[#0b1d2e]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-semibold text-sky-300">Evaluación privada</h2><CardTitle className="mt-2">{selectedDossier.professionalProfile.user.name || "Profesional Terraqo"}</CardTitle><CardDescription className="text-slate-300">{selectedDossier.needRevision.title} · necesidad v{selectedDossier.needRevision.revisionNo}</CardDescription></div><AnalysisBadge status={selectedDossier.effectiveAnalysisStatus} /></div>
              {selectedDossier.revokedSourceCount ? <div role="status" className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{selectedDossier.revokedSourceCount} fuente(s) perdieron autorización. Se ocultaron y los criterios afectados quedaron marcados.</div> : null}
            </CardHeader>
            <CardContent className="space-y-7 p-4 sm:p-6">
              <p className="max-w-[75ch] text-sm leading-6 text-slate-300">Fuentes, criterios y notas exclusivos de tu empresa. Esta revisión no es una verificación ni una decisión de contratación.</p>
              <div className="grid items-start gap-5 lg:grid-cols-2">
                <section id="evaluation-sources" aria-label="Fuentes autorizadas" className="min-w-0 scroll-mt-6 space-y-3">
                  <h3 className="text-lg font-bold">Evidencias seleccionadas</h3><p className="text-sm text-slate-300">{selectedDossier.sources.length} {selectedDossier.sources.length === 1 ? "fuente autorizada" : "fuentes autorizadas"} · consulta la versión exacta.</p>
                  {selectedDossier.sources.map(source => <button key={source.id} type="button" onClick={() => openSource(selectedDossier, source.id)} className="flex min-h-20 w-full flex-col gap-2 rounded-xl border border-[#36516b] bg-[#0b1d2e] p-4 text-left hover:bg-[#10263c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"><strong className="break-words text-sm">{source.worklogRevision.title || "Evidencia autorizada"}</strong><span className="text-xs text-slate-400">{source.accessKind === "PUBLIC_CV" ? "CV público" : source.accessKind === "PUBLIC_SELECTION" ? "Selección pública" : "Acceso privado autorizado"}</span><span className="text-sm font-semibold text-sky-300">Abrir fuente y versión →</span></button>)}
                  {!selectedDossier.sources.length ? <p role="status" className="text-sm text-amber-200">Sin fuentes autorizadas. Puedes anotar lo que falta confirmar y preparar preguntas manualmente.</p> : null}
                  {openedSource?.dossierId === selectedDossier.id && selectedDossier.sources.some(source => source.id === openedSource.sourceId && source.worklogRevision.id === openedSource.revisionId) ? <DiscoveryEvaluationSource key={`${openedSource.dossierId}-${openedSource.sourceId}-${openedSource.nonce}`} {...openedSource} onClose={() => setOpenedSource(null)} onUnavailable={sourceUnavailable} /> : null}
                </section>
                <div className="min-w-0 space-y-4">
              {evidenceAnalysisEnabled ? <AnalysisPanel
                dossier={selectedDossier}
                job={analysisJobs[selectedDossier.id]}
                purpose={analysisPurposes[selectedDossier.id] ?? "EVIDENCE_SUMMARY"}
                busy={submitting}
                onPurposeChange={(purpose) => setAnalysisPurposes((current) => ({ ...current, [selectedDossier.id]: purpose }))}
                onStart={() => void startAnalysis(selectedDossier)}
                onCancel={(jobId) => void cancelAnalysis(selectedDossier.id, jobId)}
                onRetry={(jobId) => void retryAnalysis(selectedDossier.id, jobId)}
                onOpenSource={(sourceId, revisionId) => openSource(selectedDossier, sourceId, revisionId)}
                onPrepareQuestions={() => prepareQuestions(selectedDossier)}
              /> : <div className="rounded-xl border border-[#36516b] bg-[#0b1d2e] p-4"><h3 className="font-bold">Evaluación manual disponible</h3><p className="mt-2 text-sm leading-6 text-slate-300">Revisa las fuentes, registra criterios y prepara preguntas sin asistencia automática.</p></div>}
              <Button type="button" variant="outline" className="min-h-11 border-[#36516b] bg-[#10263c] text-white hover:bg-[#193750]" disabled={!employerNeedsWritable || submitting} onClick={() => prepareQuestions(selectedDossier)}><MessageSquareText className="h-4 w-4" aria-hidden />Preparar preguntas</Button>
              <p className="text-xs leading-5 text-slate-400">Crea borradores a partir de los criterios indispensables pendientes. Revisa y guarda cada pregunta; no se envía al profesional.</p>
              <EvaluationStatus status={selectedDossier.effectiveAnalysisStatus} />
              <section className="space-y-5">
                <div id="evaluation-notes" className="scroll-mt-24 rounded-xl border border-[#36516b] p-4"><div className="flex items-center gap-2"><MessageSquareText className="h-5 w-5 text-sky-300" aria-hidden /><h3 className="font-bold">Notas internas</h3></div><p className="mt-1 text-xs text-slate-300">Solo visibles para el equipo de tu empresa.</p><form onSubmit={(event) => void addNote(event, selectedDossier.id)} className="mt-3 space-y-3"><label className="grid gap-2 text-sm font-semibold"><span>Observación del equipo</span><Textarea name="body" required minLength={2} disabled={!employerNeedsWritable} className="border-[#36516b] bg-[#0b1d2e] text-slate-100 placeholder:text-slate-400 focus-visible:ring-sky-300 min-h-24" placeholder="Contexto privado para la evaluación." /></label><Button type="submit" variant="outline" className="min-h-11 border-[#36516b] bg-[#10263c] text-white hover:bg-[#193750]" disabled={!employerNeedsWritable || submitting}>Agregar nota</Button></form><div className="mt-4 space-y-2">{selectedDossier.notes.map((note) => <article key={note.id} className="rounded-lg bg-[#10263c] p-3"><p className="text-sm leading-6">{note.body}</p><p className="mt-2 text-[11px] font-medium text-slate-400">{note.createdBy.name || "Equipo Terraqo"} · {new Date(note.createdAt).toLocaleString("es-PE")}</p></article>)}</div></div>
                <div id="evaluation-questions" className="min-w-0 scroll-mt-6 rounded-xl border border-[#36516b] p-4"><div className="flex items-center gap-2"><FileSearch className="h-5 w-5 text-sky-300" aria-hidden /><h3 className="font-bold">Preguntas para confirmar</h3></div><p className="mt-1 text-xs text-slate-300">Borradores editables. Guardar no los envía.</p>{(questionDrafts[selectedDossier.id] ?? []).map((draft, index) => <form key={`${selectedDossier.id}-draft-${draft.id}`} data-draft-id={draft.id} onSubmit={event => void saveQuestion(event, selectedDossier.id)} className="mt-4 space-y-2 rounded-lg border border-sky-800 bg-[#10263c] p-3"><label className="grid gap-2 text-sm font-semibold">Borrador de pregunta {index + 1}<Textarea name="text" defaultValue={draft.text} required minLength={4} disabled={!employerNeedsWritable || submitting} className="border-[#36516b] bg-[#0b1d2e] text-slate-100 placeholder:text-slate-400 focus-visible:ring-sky-300 min-h-24" /></label><Button type="submit" disabled={!employerNeedsWritable || submitting}>Guardar borrador</Button></form>)}<form onSubmit={(event) => void saveQuestion(event, selectedDossier.id)} className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="grid gap-2 text-sm font-semibold"><span>Pregunta interna</span><Input className="min-h-11 border-[#36516b] bg-[#0b1d2e] text-slate-100 placeholder:text-slate-400 focus-visible:ring-sky-300" name="text" required minLength={4} disabled={!employerNeedsWritable} placeholder="¿Qué alcance tuvo tu participación?" /></label><Button type="submit" size="icon" className="min-h-11 min-w-11 self-end" aria-label="Agregar pregunta" disabled={!employerNeedsWritable || submitting}><Plus className="h-4 w-4" aria-hidden /></Button></form><div className="mt-4 space-y-2">{selectedDossier.questions.map((question) => <form key={question.id} onSubmit={(event) => void saveQuestion(event, selectedDossier.id, question)} className="grid gap-2 rounded-lg bg-[#10263c] p-2 sm:grid-cols-[minmax(0,1fr)_auto]"><Input className="min-h-11 border-[#36516b] bg-[#0b1d2e] text-slate-100 placeholder:text-slate-400 focus-visible:ring-sky-300" name="text" defaultValue={question.text} disabled={!employerNeedsWritable} aria-label="Editar pregunta" /><Button type="submit" variant="outline" size="sm" className={darkButton} disabled={!employerNeedsWritable || submitting}>Guardar</Button></form>)}</div></div>
              </section>
                </div>
              </div>
              <section aria-labelledby="evaluation-criteria-heading">
                <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 id="evaluation-criteria-heading" className="text-lg font-bold">Criterios de la necesidad</h3><p className="text-sm text-slate-300">Un estado describe la evidencia disponible; no califica a la persona.</p></div><span className="text-xs font-bold text-slate-400">{selectedDossier.assessments.length}/{selectedDossier.needRevision.requirements.length} revisados</span></div>
                <ClaimLegend /><div className="mt-4 space-y-3">{!selectedDossier.needRevision.requirements.length ? <p className="text-sm text-slate-300">Esta versión no contiene criterios. Puedes revisar las fuentes y registrar notas internas.</p> : null}{selectedDossier.needRevision.requirements.map((requirement) => {
                  const assessment = selectedDossier.assessments.find((item) => item.requirementId === requirement.id);
                  return <form key={`${selectedDossier.id}-${requirement.id}-${assessment?.revisionNo ?? 0}-${assessment?.sourceState}`} onSubmit={(event) => void saveAssessment(event, selectedDossier, requirement)} className="rounded-xl border border-[#36516b] p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><span className="rounded-full bg-[#193750] px-2 py-1 text-[10px] font-bold uppercase tracking-wide">{requirement.priority === "REQUIRED" ? "Indispensable" : "Deseable"}</span><h4 className="mt-2 font-bold">{requirement.label}</h4>{assessment?.sourceState === "SOURCE_REVOKED" ? <p className="mt-1 text-xs font-semibold text-amber-200">Una fuente citada fue retirada; revisa el criterio.</p> : null}</div><select name="claimState" defaultValue={assessment?.claimState ?? "UNKNOWN"} disabled={!employerNeedsWritable} aria-label={`Estado de ${requirement.label}`} className="min-h-11 w-full min-w-0 rounded-lg border border-[#36516b] bg-[#0b1d2e] px-3 text-sm font-semibold lg:w-auto"><option value="UNKNOWN">Desconocido · por confirmar</option><option value="DECLARED">Declarado</option><option value="DOCUMENTED">Documentado</option><option value="ENDORSED">Respaldado</option><option value="CONFIRMED">Confirmado con alcance</option></select></div>
                    <label className="mt-3 grid gap-2 text-sm font-semibold"><span>Conclusión y sustento</span><Textarea name="rationale" defaultValue={assessment?.sourceState === "SOURCE_REVOKED" ? "" : assessment?.rationale ?? ""} disabled={!employerNeedsWritable} className="border-[#36516b] bg-[#0b1d2e] text-slate-100 placeholder:text-slate-400 focus-visible:ring-sky-300 min-h-20" placeholder="Conclusión manual o información que falta confirmar." /></label>
                    <fieldset disabled={!employerNeedsWritable} className="mt-3"><legend className="text-xs font-bold uppercase tracking-wide text-slate-400">Fuentes exactas</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{selectedDossier.sources.map((source) => <label key={source.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-[#36516b] bg-[#10263c] px-3 text-xs font-medium"><input type="checkbox" name="sourceIds" value={source.id} defaultChecked={assessment?.sourceIds.includes(source.id)} className="h-4 w-4 accent-blue-500" /><span className="line-clamp-2">{source.worklogRevision.title || "Evidencia autorizada"}</span></label>)}</div></fieldset>
                    <div className="mt-3 flex flex-wrap gap-2">{assessment?.sourceState === "ACTIVE" ? assessment.sourceIds.map(id => <button key={id} type="button" className="min-h-11 rounded-lg px-3 text-sm font-semibold text-sky-300 underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-sky-300" onClick={() => openSource(selectedDossier, id)}>Ver sustento · {selectedDossier.sources.find(source => source.id === id)?.worklogRevision.title || "Fuente"}</button>) : null}</div><div className="mt-3 flex justify-end"><Button type="submit" size="sm" disabled={!employerNeedsWritable || submitting}><Check className="h-4 w-4" aria-hidden />Guardar criterio</Button></div>
                  </form>;
                })}</div>
              </section>



              {contextualMessagingEnabled && employerNeedsWritable ? <section className="rounded-xl border border-teal-200 bg-teal-50/60 p-4"><h3 className="font-bold text-teal-950">Solicitar conversación</h3><p className="mt-1 text-sm text-teal-900/75">La referencia al expediente será neutral para el profesional y no concede acceso a fuentes, criterios ni notas.</p><form onSubmit={(event) => void requestConversation(event, selectedDossier.id)} className="mt-3 flex flex-col gap-3 sm:flex-row"><Input className="min-h-11 border-[#36516b] bg-[#0b1d2e] text-slate-100 placeholder:text-slate-400 focus-visible:ring-sky-300" name="note" maxLength={1200} placeholder="Motivo breve de contacto (opcional)" /><Button type="submit" disabled={submitting}><MessageSquareText className="h-4 w-4" aria-hidden />Enviar solicitud</Button></form></section> : null}
            </CardContent>
          </Card> : null}
        </div>
      </div>
    </section>
  );
}

const darkButton = "min-h-11 border-[#36516b] bg-[#10263c] text-white hover:bg-[#193750] focus-visible:ring-sky-300";

function ClaimLegend() {
  return <dl aria-label="Estados de la evidencia" className="mt-4 grid gap-3 border-y border-slate-700 py-4 text-xs leading-5 sm:grid-cols-2"><div><dt className="font-bold text-sky-300">Documentado</dt><dd className="text-slate-300">Consta en una fuente; requiere revisar su alcance.</dd></div><div><dt className="font-bold text-amber-200">Declarado</dt><dd className="text-slate-300">Lo indica el profesional; no implica validación independiente.</dd></div><div><dt className="font-bold text-emerald-300">Respaldado</dt><dd className="text-slate-300">Cuenta con respaldo explícito para el alcance citado.</dd></div><div><dt className="font-bold text-slate-200">Desconocido</dt><dd className="text-slate-300">No hay información suficiente; queda por confirmar.</dd></div></dl>;
}

function EvaluationStatus({ status }: { status: EvaluationDossier["effectiveAnalysisStatus"] }) {
  const messages = {
    NOT_REQUESTED: "Sin análisis automático. La revisión manual está disponible.",
    PROCESSING: "Procesando fuentes. Puedes continuar con los criterios y notas manuales.",
    READY: "Análisis disponible para revisión humana. Las propuestas no certifican capacidades.",
    FAILED: "El análisis no pudo completarse. Puedes continuar manualmente y reintentar cuando esté disponible.",
    INSUFFICIENT: "Evidencia insuficiente. Revisa qué falta confirmar y prepara preguntas; no se concluye aptitud.",
    SOURCE_REVOKED: "Fuente retirada o sin autorización. Sus resultados derivados se han ocultado; revisa los criterios afectados.",
  };
  return <p role="status" className="rounded-lg border border-[#36516b] p-3 text-sm leading-6 text-slate-300">{messages[status]}</p>;
}

function AnalysisPanel({ dossier, job, purpose, busy, onPurposeChange, onStart, onCancel, onRetry, onOpenSource, onPrepareQuestions }: {
  dossier: EvaluationDossier; job?: AnalysisJob; purpose: AnalysisPurpose; busy: boolean;
  onPurposeChange: (purpose: AnalysisPurpose) => void; onStart: () => void; onCancel: (jobId: string) => void; onRetry: (jobId: string) => void;
  onOpenSource: (sourceId: string, revisionId: string) => void; onPrepareQuestions: () => void;
}) {
  const active = job && ["QUEUED", "PROCESSING", "RETRY_WAIT"].includes(job.status);
  const visible = job && job.status === "READY" && dossier.effectiveAnalysisStatus !== "SOURCE_REVOKED" && !dossier.revokedSourceCount;
  const kinds = { EXPLICIT_DATA: "Documentado", DECLARATION_SUMMARY: "Declarado", PROPOSED_INTERPRETATION: "Interpretación por confirmar" } as const;
  return <section aria-labelledby="analysis-heading" className="rounded-xl border border-[#36516b] bg-[#0b1d2e] p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="analysis-heading" className="text-lg font-bold text-white">Analizador de evidencias</h3><p className="mt-2 text-sm leading-6 text-slate-300">Asistencia sobre {dossier.sources.length} {dossier.sources.length === 1 ? "fuente" : "fuentes"}. Revisa cada afirmación y su versión antes de usarla.</p></div>{job ? <JobStatus status={job.status} /> : null}</div>
    <div className="mt-4 space-y-4">
      <label className="grid gap-2 text-sm font-semibold">Finalidad del análisis<select value={purpose} onChange={event => onPurposeChange(event.target.value as AnalysisPurpose)} disabled={Boolean(active) || busy} className="min-h-11 w-full min-w-0 rounded-lg border border-[#36516b] bg-[#10263c] px-3 text-slate-100 focus-visible:ring-sky-300"><option value="EVIDENCE_SUMMARY">Resumir evidencia seleccionada</option><option value="REQUIREMENT_GAPS">Detectar información faltante</option><option value="QUESTION_DRAFTS">Proponer preguntas de confirmación</option></select></label>
      <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-11 bg-blue-600 text-white hover:bg-blue-500" onClick={onStart} disabled={busy || Boolean(active) || dossier.sources.length === 0}><Sparkles className="h-4 w-4" aria-hidden />{job && ["READY", "INSUFFICIENT", "CANCELLED", "SOURCE_REVOKED"].includes(job.status) ? "Nuevo análisis" : "Analizar fuentes"}</Button>{active && job?.cancellable ? <Button type="button" variant="outline" className={darkButton} onClick={() => onCancel(job.id)} disabled={busy}><Ban className="h-4 w-4" aria-hidden />Cancelar</Button> : null}{job?.retryable ? <Button type="button" variant="outline" className={darkButton} onClick={() => onRetry(job.id)} disabled={busy}><RotateCcw className="h-4 w-4" aria-hidden />Reintentar</Button> : null}</div>
      {active ? <p role="status" className="flex items-center gap-2 text-sm leading-6 text-sky-200"><LoaderCircle className="h-5 w-5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />Procesando fuentes. Puedes continuar la revisión manual.</p> : null}
      {visible && job.claims.length ? <div className="space-y-3"><h4 className="font-bold">Hallazgos propuestos</h4>{job.claims.map((claim, index) => <article key={index} className="rounded-lg border border-[#36516b] p-3"><p className="text-xs font-bold text-sky-300">{kinds[claim.kind]}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{claim.text}</p><div className="mt-2 space-y-2">{claim.citations.map((citation, citationIndex) => <div key={citationIndex}><button type="button" className="min-h-11 max-w-full rounded text-left text-sm font-semibold text-sky-300 underline underline-offset-4 hover:text-sky-100 focus-visible:ring-2 focus-visible:ring-sky-300" onClick={() => onOpenSource(citation.sourceId, citation.revisionId)}>Abrir fuente · {dossier.sources.find(source => source.id === citation.sourceId)?.worklogRevision.title || "Evidencia citada"}<span className="mt-1 block break-all text-xs font-normal">Versión {citation.revisionId}</span></button><blockquote className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{citation.excerpt}</blockquote></div>)}</div></article>)}</div> : null}
      {job && ["READY", "INSUFFICIENT"].includes(job.status) && job.missing.length ? <div className="rounded-lg border border-amber-700 p-3 text-amber-100"><h4 className="font-bold">Información por confirmar</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">{job.missing.map(item => <li key={item}>{item}</li>)}</ul></div> : null}
      {job?.status === "INSUFFICIENT" ? <p role="status" className="text-sm leading-6 text-amber-200">Evidencia insuficiente para una conclusión. Puedes revisar las fuentes y preparar preguntas.</p> : null}
      {job?.status === "FAILED" ? <p role="alert" className="text-sm leading-6 text-red-200">El análisis no pudo completarse. No se aplicaron resultados parciales; continúa manualmente o reintenta.</p> : null}
      {job?.status === "SOURCE_REVOKED" ? <p role="alert" className="text-sm leading-6 text-amber-200">Fuente retirada. Los resultados anteriores quedaron ocultos.</p> : null}
      {job?.status === "CANCELLED" ? <p role="status" className="text-sm text-slate-300">Análisis cancelado. Puedes continuar manualmente.</p> : null}
      {visible && job.purpose === "QUESTION_DRAFTS" ? <Button type="button" variant="outline" className={darkButton} onClick={onPrepareQuestions} disabled={busy}>Crear borradores editables</Button> : null}
      <p className="text-xs leading-5 text-slate-400">No se infieren aptitud psicológica, rendimiento personal ni habilidades a partir de apariencia o frecuencia de publicación.</p>
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
