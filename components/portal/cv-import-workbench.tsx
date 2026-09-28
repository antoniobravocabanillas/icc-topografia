"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, FileSearch, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type ImportItem = {
  id: string;
  type: "PROFILE" | "EXPERIENCE" | "EDUCATION" | "SKILL" | "CERTIFICATION" | "SOFTWARE" | "EQUIPMENT";
  position: number;
  normalizedData: Record<string, unknown>;
  confidence: number;
  sourcePage: number | null;
  sourceText: string | null;
  decision: string;
  candidateMatchId: string | null;
};

type CvImport = {
  id: string;
  documentId: string;
  status: string;
  extractor: string;
  consentForTraining: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  items: ImportItem[];
};

type CvImportWorkbenchProps = {
  cv: { id: string; fileName: string; uploadedAt: string } | null;
  initialImport: CvImport | null;
  serviceAvailable: boolean;
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function list(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join(", ") : "";
}

function confidenceLabel(value: number) {
  if (value >= 0.85) return "Alta confianza";
  if (value >= 0.6) return "Revisar dato";
  return "Confianza baja";
}

export function CvImportWorkbench({ cv, initialImport, serviceAvailable }: CvImportWorkbenchProps) {
  const router = useRouter();
  const [record, setRecord] = useState<CvImport | null>(initialImport);
  const [items, setItems] = useState<ImportItem[]>(() => initialImport?.items.map((item) => item.decision === "PENDING" && item.candidateMatchId ? { ...item, decision: "REJECTED" } : item) || []);
  const [consent, setConsent] = useState(initialImport?.consentForTraining || false);
  const [busy, setBusy] = useState<"reading" | "saving" | "applying" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const acceptedCount = useMemo(() => items.filter((item) => item.decision !== "REJECTED" && !item.candidateMatchId).length, [items]);

  async function request(url: string, init: RequestInit) {
    const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init.headers || {}) } });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error?.message || "No pudimos completar la operación.");
    return payload.data;
  }

  async function start() {
    if (!cv) return;
    setBusy("reading");
    setFeedback(null);
    try {
      const next = await request("/api/terraqo/cv-imports", { method: "POST", body: JSON.stringify({ documentId: cv.id, consentForTraining: consent }) });
      setRecord(next);
      setItems(next.items.map((item: ImportItem) => ({ ...item, decision: item.candidateMatchId ? "REJECTED" : "ACCEPTED" })));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No pudimos leer el CV.");
    } finally {
      setBusy(null);
    }
  }

  function updateItem(id: string, field: string, value: unknown) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, normalizedData: { ...item.normalizedData, [field]: value } } : item));
  }

  function toggleItem(id: string) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, decision: item.decision === "REJECTED" ? "ACCEPTED" : "REJECTED" } : item));
  }

  async function saveReview() {
    if (!record) return null;
    setBusy("saving");
    setFeedback(null);
    try {
      const next = await request(`/api/terraqo/cv-imports/${record.id}`, { method: "PATCH", body: JSON.stringify({ consentForTraining: consent, items: items.map((item) => ({ id: item.id, decision: item.decision === "REJECTED" ? "REJECTED" : "ACCEPTED", normalizedData: item.normalizedData })) }) });
      setRecord(next);
      setItems(next.items);
      return next as CvImport;
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No pudimos guardar la revisión.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    const reviewed = await saveReview();
    if (!reviewed) return;
    setBusy("applying");
    try {
      const result = await request(`/api/terraqo/cv-imports/${reviewed.id}/apply`, { method: "POST", body: "{}" });
      setFeedback(`Importación terminada: ${result.created} registro(s) creados y ${result.merged} duplicado(s) omitidos.`);
      router.push("/portal/experiencias?success=cv-import");
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No pudimos aplicar la importación.");
    } finally {
      setBusy(null);
    }
  }

  if (!cv) {
    return (
      <div className="rounded-2xl border border-dashed bg-white px-5 py-10 text-center sm:px-10">
        <FileSearch className="mx-auto h-10 w-10 text-primary" />
        <h2 className="mt-4 font-display text-2xl font-bold">Primero carga tu CV</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Aceptamos PDF, DOC y DOCX. El archivo permanece privado y podrás revisar cada dato antes de incorporarlo.</p>
        <Button className="mt-5" onClick={() => router.push("/portal/documentos")}>Ir a Documentos y datos</Button>
      </div>
    );
  }

  const ready = record?.status === "READY_FOR_REVIEW";
  const completed = record?.status === "COMPLETED" || record?.status === "PARTIAL";
  const visibleItems = items.filter((item) => ["PROFILE", "EXPERIENCE", "EDUCATION"].includes(item.type));

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_60px_-42px_rgba(15,48,70,.4)]">
        <div className="grid gap-5 border-b bg-[linear-gradient(125deg,#06283a,#0d5363)] px-5 py-6 text-white md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-7">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-cyan-100"><LockKeyhole className="h-4 w-4" /> Procesamiento privado</div>
            <h2 className="mt-3 break-words font-display text-2xl font-bold sm:text-3xl">{cv.fileName}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">Docling extrae el contenido y Ollama lo estructura dentro de la infraestructura configurada por Terraqo. Nada se publica al terminar.</p>
          </div>
          {completed ? <Button onClick={() => router.push("/portal/experiencias")} className="h-12 bg-white text-slate-950 hover:bg-white/90"><Check className="mr-2 h-4 w-4" /> Ver perfil actualizado</Button> : !ready ? <Button onClick={start} disabled={busy !== null || !serviceAvailable} className="h-12 bg-white text-slate-950 hover:bg-white/90">{busy === "reading" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSearch className="mr-2 h-4 w-4" />}{serviceAvailable ? "Leer mi CV" : "Lector no configurado"}</Button> : <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold"><Check className="mr-2 inline h-4 w-4" /> Listo para revisar</div>}
        </div>
        <div className="grid gap-4 px-5 py-5 text-sm md:grid-cols-3 md:px-7">
          <p><b>1. Lectura local</b><br /><span className="text-muted-foreground">Texto, tablas y secciones.</span></p>
          <p><b>2. Revisión humana</b><br /><span className="text-muted-foreground">Corrige y elige qué importar.</span></p>
          <p><b>3. Borradores privados</b><br /><span className="text-muted-foreground">Sin checks ni publicación automática.</span></p>
        </div>
      </section>

      {!serviceAvailable && !ready && !completed ? <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-950">La lectura privada de CV debe activarse en este entorno antes de procesar documentos.</p> : null}

      {feedback ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">{feedback}</p> : null}

      {ready ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><h2 className="font-display text-2xl font-bold">Revisa antes de incorporar</h2><p className="mt-1 text-sm text-muted-foreground">Los posibles duplicados quedan desmarcados. Puedes corregir el resto directamente.</p></div>
            <p className="text-sm font-bold text-primary">{acceptedCount} dato(s) nuevos seleccionados</p>
          </div>

          <div className="space-y-4">
            {visibleItems.map((item) => {
              const selected = item.decision !== "REJECTED";
              const data = item.normalizedData;
              return (
                <article key={item.id} className={`rounded-2xl border bg-white p-4 transition sm:p-5 ${selected ? "border-primary/35 shadow-[0_14px_45px_-38px_rgba(15,92,100,.55)]" : "opacity-65"}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{item.type === "PROFILE" ? "Perfil" : item.type === "EXPERIENCE" ? "Experiencia" : "Educación"}</span>
                        {item.type !== "PROFILE" ? <span className={`text-xs font-bold ${item.confidence < .6 ? "text-amber-700" : "text-emerald-700"}`}>{confidenceLabel(item.confidence)}</span> : null}
                        {item.candidateMatchId ? <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Posible duplicado</span> : null}
                      </div>
                      {item.sourceText ? <p className="mt-3 max-w-4xl text-xs leading-5 text-muted-foreground">Fuente: “{item.sourceText}”{item.sourcePage ? ` · página ${item.sourcePage}` : ""}</p> : null}
                    </div>
                    <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-sm font-bold"><input type="checkbox" checked={selected} onChange={() => toggleItem(item.id)} className="h-4 w-4 accent-primary" /> Importar</label>
                  </div>

                  {item.type === "PROFILE" ? (
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <Field label="Titular profesional" value={text(data.headline)} onChange={(value) => updateItem(item.id, "headline", value)} />
                      <Field label="Ciudad" value={text(data.city)} onChange={(value) => updateItem(item.id, "city", value)} />
                      <Field label="País (código ISO)" value={text(data.country)} placeholder="PE" onChange={(value) => updateItem(item.id, "country", value.toUpperCase().slice(0, 2) || null)} />
                      <Field className="md:col-span-2" label="Presentación" value={text(data.bio)} multiline onChange={(value) => updateItem(item.id, "bio", value)} />
                      <Field label="Categorías profesionales" value={list(data.professionalCategories)} onChange={(value) => updateItem(item.id, "professionalCategories", value.split(",").map((entry) => entry.trim()).filter(Boolean))} />
                      <Field label="Especialidades" value={list(data.specialties)} onChange={(value) => updateItem(item.id, "specialties", value.split(",").map((entry) => entry.trim()).filter(Boolean))} />
                      <Field label="Software" value={list(data.software)} onChange={(value) => updateItem(item.id, "software", value.split(",").map((entry) => entry.trim()).filter(Boolean))} />
                      <Field label="Equipos" value={list(data.equipment)} onChange={(value) => updateItem(item.id, "equipment", value.split(",").map((entry) => entry.trim()).filter(Boolean))} />
                      <Field className="md:col-span-2" label="Certificaciones" value={list(data.certifications)} onChange={(value) => updateItem(item.id, "certifications", value.split(",").map((entry) => entry.trim()).filter(Boolean))} />
                    </div>
                  ) : item.type === "EXPERIENCE" ? (
                    <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      <Field label="Puesto o trabajo" value={text(data.title)} onChange={(value) => updateItem(item.id, "title", value)} />
                      <Field label="Empresa" value={text(data.companyName)} onChange={(value) => updateItem(item.id, "companyName", value)} />
                      <Field label="Rol" value={text(data.role)} onChange={(value) => updateItem(item.id, "role", value)} />
                      <Field label="Inicio" value={text(data.startedAt)} placeholder="AAAA-MM" onChange={(value) => updateItem(item.id, "startedAt", value || null)} />
                      <Field label="Fin" value={text(data.endedAt)} placeholder="AAAA-MM" onChange={(value) => updateItem(item.id, "endedAt", value || null)} />
                      <Field label="Ciudad" value={text(data.locationCity)} onChange={(value) => updateItem(item.id, "locationCity", value)} />
                      <Field className="md:col-span-2 lg:col-span-3" label="Descripción" value={text(data.summary)} multiline onChange={(value) => updateItem(item.id, "summary", value)} />
                    </div>
                  ) : (
                    <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      <Field label="Institución" value={text(data.institution)} onChange={(value) => updateItem(item.id, "institution", value)} />
                      <Field label="Grado o título" value={text(data.degree)} onChange={(value) => updateItem(item.id, "degree", value)} />
                      <Field label="Especialidad" value={text(data.field)} onChange={(value) => updateItem(item.id, "field", value)} />
                      <Field label="Inicio" value={text(data.startedAt)} placeholder="AAAA-MM" onChange={(value) => updateItem(item.id, "startedAt", value || null)} />
                      <Field label="Fin" value={text(data.endedAt)} placeholder="AAAA-MM" onChange={(value) => updateItem(item.id, "endedAt", value || null)} />
                      <Field label="Ciudad" value={text(data.locationCity)} onChange={(value) => updateItem(item.id, "locationCity", value)} />
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <section className="rounded-2xl border bg-slate-50 p-5">
            <label className="flex cursor-pointer items-start gap-3 text-sm leading-6"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-primary" /><span><b>Ayudar a mejorar el lector de CV</b><br /><span className="text-muted-foreground">Autoriza usar solo tus correcciones como ejemplos de entrenamiento interno. Es opcional y no autoriza publicar tu CV ni compartirlo con terceros.</span></span></label>
          </section>

          <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-2xl border bg-white/95 p-4 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700"><ShieldCheck className="h-4 w-4 text-primary" /> Se crearán borradores privados y sin verificación.</p>
            <div className="grid gap-2 sm:flex"><Button variant="outline" onClick={saveReview} disabled={busy !== null}>Guardar revisión</Button><Button onClick={apply} disabled={busy !== null || acceptedCount === 0}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}Incorporar a mi perfil</Button></div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, multiline = false, className = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean; className?: string }) {
  const shared = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-slate-50";
  return <label className={`block text-sm font-bold text-slate-700 ${className}`}>{label}{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} placeholder={placeholder} className={`${shared} resize-y`} /> : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={shared} />}</label>;
}
