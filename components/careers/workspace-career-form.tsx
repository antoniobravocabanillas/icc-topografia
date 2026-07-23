"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  FileCheck2,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Upload,
  UsersRound
} from "lucide-react";
import type { CareerFieldConfig, CareerFormConfig } from "@/lib/terraqo/career-form-config";
import type { ProfessionalTaxonomy } from "@/lib/terraqo/professional-categories";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type WorkspaceSummary = {
  id: string;
  slug: string;
  name: string;
  brandName: string | null;
  industry: string | null;
  logoUrl: string | null;
};

type JobPost = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  location: string | null;
  modality: string | null;
  requiredSkills: string[];
  requiredTools: string[];
  professionalCategories: string[];
  project: { title: string } | null;
};

type CareersResponse = {
  workspace: WorkspaceSummary;
  formConfig: CareerFormConfig;
  categories: string[];
  taxonomies: ProfessionalTaxonomy[];
  acceptsGeneralApplications: boolean;
  jobs: JobPost[];
};

type ApiEnvelope<T> = {
  data?: T;
  error?: string;
  details?: unknown;
};

type FieldValue = string | number | boolean | string[];
type FormState = Record<string, FieldValue>;

type WorkspaceCareerFormProps = {
  workspaceSlug: string;
};

const baseKnownFields = new Set([
  "name",
  "email",
  "phone",
  "password",
  "category",
  "specialty",
  "city",
  "yearsExperience",
  "coverNote",
  "jobPostId",
  "roleTitle",
  "currentCompany",
  "currentRole",
  "portfolioUrl",
  "cvUrl",
  "equipment",
  "software",
  "availabilityNote"
]);

function getFieldName(field: CareerFieldConfig) {
  return field.mapsTo || field.key;
}

function asString(value: FieldValue | undefined) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function asStringArray(value: FieldValue | undefined) {
  return Array.isArray(value) ? value : [];
}

function normalizePayloadValue(value: FieldValue | undefined) {
  if (Array.isArray(value)) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value;
  return value?.trim() || undefined;
}

function buildInitialState(data: CareersResponse): FormState {
  const firstCategory = data.categories[0] || "";
  const initial: FormState = {
    category: firstCategory,
    yearsExperience: 0,
    equipment: [],
    software: [],
    jobPostId: ""
  };

  for (const section of data.formConfig.sections) {
    for (const field of section.fields) {
      const name = getFieldName(field);
      if (field.type === "multiSelect") initial[name] = [];
      else if (field.type === "checkbox") initial[name] = false;
      else if (field.type === "number") initial[name] = field.min ?? 0;
      else if (field.type !== "file") initial[name] = "";
    }
  }

  return initial;
}

function getApiError(json: ApiEnvelope<unknown>, fallback: string) {
  return typeof json.error === "string" ? json.error : fallback;
}

function SelectedPill({ selected, children }: { selected: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em]",
        selected ? "border-[#00A99D] bg-[#E5FAF7] text-[#007F78]" : "border-[#C9E6E2] bg-white text-[#51646B]"
      )}
    >
      {children}
    </span>
  );
}

export function WorkspaceCareerForm({ workspaceSlug }: WorkspaceCareerFormProps) {
  const [data, setData] = useState<CareersResponse | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadCareers() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/public/workspaces/${workspaceSlug}/careers`, {
          headers: { Accept: "application/json" },
          cache: "no-store"
        });
        const json = (await response.json()) as ApiEnvelope<CareersResponse>;
        if (!response.ok || !json.data) throw new Error(getApiError(json, "No se pudo cargar el formulario."));
        if (!mounted) return;
        setData(json.data);
        setForm(buildInitialState(json.data));
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el formulario.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadCareers();
    return () => {
      mounted = false;
    };
  }, [workspaceSlug]);

  const selectedCategory = asString(form.category);

  const taxonomy = useMemo(() => {
    if (!data) return null;
    return data.taxonomies.find((item) => item.category === selectedCategory) || data.taxonomies[0] || null;
  }, [data, selectedCategory]);

  const selectedJob = useMemo(() => {
    if (!data) return null;
    const jobId = asString(form.jobPostId);
    return data.jobs.find((job) => job.id === jobId) || null;
  }, [data, form.jobPostId]);

  function setField(name: string, value: FieldValue) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function getOptions(field: CareerFieldConfig) {
    if (!data) return [];
    if (field.optionsSource === "professionalCategories") return data.categories;
    if (field.optionsSource === "equipmentByCategory") return taxonomy?.equipment || [];
    if (field.optionsSource === "softwareByCategory") return taxonomy?.software || [];
    return field.options || [];
  }

  function toggleMultiValue(name: string, option: string) {
    setForm((current) => {
      const values = asStringArray(current[name]);
      return {
        ...current,
        [name]: values.includes(option) ? values.filter((item) => item !== option) : [...values, option]
      };
    });
  }

  function handleInput(field: CareerFieldConfig, event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const name = getFieldName(field);
    if (field.type === "number") {
      setField(name, Number(event.target.value || 0));
      return;
    }
    setField(name, event.target.value);
    if (name === "category") {
      setForm((current) => ({ ...current, category: event.target.value, equipment: [], software: [] }));
    }
  }

  function validateConfigRequirements() {
    if (!data) return "El formulario aun no esta listo.";
    if (!termsAccepted || !privacyAccepted) return "Acepta los terminos y la politica de privacidad para continuar.";

    for (const section of data.formConfig.sections) {
      for (const field of section.fields) {
        if (field.enabled === false || field.type === "file" || !field.required) continue;
        const value = form[getFieldName(field)];
        if (field.type === "multiSelect" && !asStringArray(value).length) return `Completa: ${field.label}.`;
        if (!normalizePayloadValue(value)) return `Completa: ${field.label}.`;
      }
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;

    const validationError = validateConfigRequirements();
    if (validationError) {
      setError(validationError);
      setSuccess(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const customAnswers: Record<string, string | number | boolean | string[]> = {};
    const payload: Record<string, unknown> = {
      formConfigVersion: data.formConfig.version,
      jobPostId: normalizePayloadValue(form.jobPostId),
      termsAccepted,
      privacyAccepted
    };

    for (const section of data.formConfig.sections) {
      for (const field of section.fields) {
        if (field.enabled === false || field.type === "file") continue;
        const fieldName = getFieldName(field);
        const value = form[fieldName];
        if (baseKnownFields.has(fieldName)) payload[fieldName] = normalizePayloadValue(value);
        else if (value !== undefined) customAnswers[fieldName] = value;
      }
    }

    payload.customAnswers = customAnswers;
    payload.equipment = asStringArray(form.equipment);
    payload.software = asStringArray(form.software);
    payload.yearsExperience = Number(form.yearsExperience || 0);

    try {
      const body = new FormData();
      body.append("payload", JSON.stringify(payload));
      if (cvFile) body.append("cvFile", cvFile);

      const response = await fetch(`/api/public/workspaces/${workspaceSlug}/careers`, {
        method: "POST",
        body
      });
      const json = (await response.json()) as ApiEnvelope<{ message?: string; portalPath?: string }>;
      if (!response.ok || !json.data) throw new Error(getApiError(json, "No se pudo enviar la postulacion."));

      setSuccess(json.data.message || "Perfil creado correctamente. Revisa tu correo y entra al portal para continuar.");
      setCvFile(null);
      setTermsAccepted(false);
      setPrivacyAccepted(false);
      setForm(buildInitialState(data));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo enviar la postulacion.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <section className="min-h-[70vh] bg-[#F4FAF9]">
        <div className="container flex min-h-[70vh] items-center justify-center">
          <div className="flex items-center gap-3 rounded-lg border border-[#C9E6E2] bg-white px-5 py-4 text-sm font-semibold text-[#0D2D33] shadow-[0_18px_70px_rgba(0,73,76,0.12)]">
            <Loader2 className="h-5 w-5 animate-spin text-[#00998F]" />
            Preparando formulario del workspace
          </div>
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="min-h-[70vh] bg-[#F4FAF9]">
        <div className="container flex min-h-[70vh] items-center justify-center">
          <div className="max-w-xl rounded-lg border border-red-200 bg-white p-8 text-[#10252D] shadow-[0_18px_70px_rgba(0,73,76,0.12)]">
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-red-600">Formulario no disponible</p>
            <h1 className="mt-4 font-display text-3xl font-bold">No pudimos abrir la convocatoria.</h1>
            <p className="mt-3 text-sm leading-7 text-[#51646B]">{error || "Intenta nuevamente en unos minutos."}</p>
            <Button asChild className="mt-6 bg-[#00998F] hover:bg-[#007F78]">
              <Link href="/">Volver al inicio</Link>
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const brandName = data.workspace.brandName || data.workspace.name;

  return (
    <section className="bg-[#F4FAF9] text-[#0D1E26]">
      <div className="relative overflow-hidden border-b border-[#C9E6E2] bg-[radial-gradient(circle_at_18%_20%,rgba(0,169,157,0.16),transparent_34%),linear-gradient(135deg,#071B1E,#0D3435_52%,#071214)] text-white">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[linear-gradient(90deg,transparent,rgba(0,169,157,0.12)),repeating-linear-gradient(90deg,rgba(255,255,255,0.04)_0,rgba(255,255,255,0.04)_1px,transparent_1px,transparent_64px)] lg:block" />
        <div className="container relative grid gap-12 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.35em] text-[#7EF3E8]">{data.formConfig.subheadline}</p>
            <h1 className="mt-6 max-w-4xl font-display text-5xl font-black leading-[0.96] md:text-7xl">{data.formConfig.headline}</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/76">{data.formConfig.intro}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <SelectedPill selected>{brandName}</SelectedPill>
              <SelectedPill selected={false}>{data.workspace.industry || "Workspace Terraqo"}</SelectedPill>
              <SelectedPill selected={false}>Perfil privado</SelectedPill>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-lg border border-white/14 bg-white/[0.08] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.25)] backdrop-blur-xl">
              <div className="flex items-start gap-4">
                <span className="grid h-12 w-12 place-items-center rounded-lg bg-[#7EF3E8]/12 text-[#7EF3E8]">
                  <ShieldCheck className="h-6 w-6" />
                </span>
                <div>
                  <h2 className="font-display text-2xl font-bold">Un perfil, multiples oportunidades</h2>
                  <p className="mt-2 text-sm leading-7 text-white/70">
                    La postulacion crea tu espacio privado en Portal Terraqo. Desde ahi podras completar documentos, validar experiencia y alimentar tu CV vivo.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-white/14 bg-white/[0.08] p-6 backdrop-blur-xl">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-[#7EF3E8]">Documentos esperados</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {data.formConfig.documentRequirements.map((document) => (
                  <div key={document.key} className="rounded-lg border border-white/12 bg-black/15 p-4">
                    <div className="flex items-center gap-2">
                      <FileCheck2 className="h-4 w-4 text-[#7EF3E8]" />
                      <p className="text-sm font-bold">{document.label}</p>
                    </div>
                    {document.description ? <p className="mt-2 text-xs leading-5 text-white/58">{document.description}</p> : null}
                    {document.required ? <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#7EF3E8]">Requerido</p> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container grid gap-8 py-14 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-[#C9E6E2] bg-white p-6 shadow-[0_18px_70px_rgba(0,73,76,0.10)]">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-[#008C84]">Como funciona</p>
            <div className="mt-5 space-y-5">
              {[
                { icon: UsersRound, title: "Postulas", text: "La empresa recibe tu perfil dentro de su workspace." },
                { icon: BadgeCheck, title: "Validas", text: "Luego podras completar identidad, documentos y experiencia." },
                { icon: BriefcaseBusiness, title: "Participas", text: "Tu perfil queda listo para proyectos, convocatorias y CV vivo." }
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#E5FAF7] text-[#008C84]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-bold">{title}</p>
                    <p className="mt-1 text-sm leading-6 text-[#51646B]">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {data.jobs.length ? (
            <div className="rounded-lg border border-[#C9E6E2] bg-white p-6 shadow-[0_18px_70px_rgba(0,73,76,0.10)]">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-[#008C84]">Convocatorias activas</p>
              <p className="mt-3 text-sm leading-6 text-[#51646B]">Puedes postular a una convocatoria o dejar tu perfil en la bolsa de talento.</p>
              <div className="mt-5 space-y-3">
                <button
                  type="button"
                  onClick={() => setField("jobPostId", "")}
                  className={cn(
                    "w-full rounded-lg border p-4 text-left transition hover:-translate-y-0.5 motion-reduce:transform-none",
                    !selectedJob ? "border-[#00998F] bg-[#E5FAF7]" : "border-[#C9E6E2] bg-white hover:border-[#00998F]/60"
                  )}
                >
                  <p className="font-bold">Bolsa de talento general</p>
                  <p className="mt-1 text-xs leading-5 text-[#51646B]">Quedas visible para futuras necesidades del workspace.</p>
                </button>
                {data.jobs.slice(0, 4).map((job) => (
                  <button
                    type="button"
                    key={job.id}
                    onClick={() => setField("jobPostId", job.id)}
                    className={cn(
                      "w-full rounded-lg border p-4 text-left transition hover:-translate-y-0.5 motion-reduce:transform-none",
                      selectedJob?.id === job.id ? "border-[#00998F] bg-[#E5FAF7]" : "border-[#C9E6E2] bg-white hover:border-[#00998F]/60"
                    )}
                  >
                    <p className="font-bold">{job.title}</p>
                    <p className="mt-1 text-xs leading-5 text-[#51646B]">{job.location || "Ubicacion por confirmar"}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </aside>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">{error}</div> : null}
          {success ? (
            <div className="rounded-lg border border-[#9CE5DC] bg-[#E5FAF7] px-5 py-4 text-sm font-semibold text-[#007F78]">
              {success}
              <Link href="/cuenta" className="ml-2 underline underline-offset-4">
                Ir al portal
              </Link>
            </div>
          ) : null}

          {data.formConfig.sections.map((section) => (
            <section key={section.id} className="rounded-lg border border-[#C9E6E2] bg-white p-6 shadow-[0_22px_90px_rgba(0,73,76,0.10)] md:p-8">
              <div className="mb-6 max-w-3xl">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-[#008C84]">{section.title}</p>
                {section.description ? <p className="mt-3 text-sm leading-7 text-[#51646B]">{section.description}</p> : null}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {section.fields
                  .filter((field) => field.enabled !== false)
                  .map((field) => {
                    const name = getFieldName(field);
                    const options = getOptions(field);
                    const wide = field.width === "full" || field.type === "textarea" || field.type === "multiSelect" || field.type === "file";

                    return (
                      <label key={field.key} className={cn("block", wide && "md:col-span-2")}>
                        <span className="mb-2 block text-sm font-bold">
                          {field.label}
                          {field.required ? " *" : ""}
                        </span>

                        {field.type === "textarea" ? (
                          <Textarea
                            value={asString(form[name])}
                            placeholder={field.placeholder}
                            maxLength={field.maxLength}
                            onChange={(event) => handleInput(field, event)}
                            className="min-h-36 border-[#C9E6E2] bg-[#FAFDFD]"
                          />
                        ) : field.type === "select" ? (
                          <select
                            value={asString(form[name])}
                            onChange={(event) => handleInput(field, event)}
                            className="h-11 w-full rounded-md border border-[#C9E6E2] bg-[#FAFDFD] px-3 text-sm font-semibold outline-none transition focus:ring-2 focus:ring-[#00A99D]/30"
                          >
                            {options.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : field.type === "multiSelect" ? (
                          <div className="rounded-lg border border-[#C9E6E2] bg-[#FAFDFD] p-3">
                            {options.length ? (
                              <div className="flex flex-wrap gap-2">
                                {options.map((option) => {
                                  const selected = asStringArray(form[name]).includes(option);
                                  return (
                                    <button
                                      key={option}
                                      type="button"
                                      onClick={() => toggleMultiValue(name, option)}
                                      className={cn(
                                        "rounded-md border px-3 py-2 text-sm font-semibold transition",
                                        selected
                                          ? "border-[#00998F] bg-[#00998F] text-white"
                                          : "border-[#C9E6E2] bg-white text-[#0D1E26] hover:border-[#00998F]/70"
                                      )}
                                    >
                                      {option}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-sm text-[#51646B]">Selecciona una categoria para ver opciones.</p>
                            )}
                          </div>
                        ) : field.type === "file" ? (
                          <div className="rounded-lg border border-dashed border-[#9CCFCC] bg-[#FAFDFD] p-4">
                            <Input
                              type="file"
                              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                              onChange={(event) => setCvFile(event.target.files?.[0] || null)}
                              className="border-[#C9E6E2] bg-white"
                            />
                            <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-[#51646B]">
                              <Upload className="h-4 w-4 text-[#008C84]" />
                              {cvFile ? cvFile.name : field.helpText || "Adjunta tu archivo profesional."}
                            </p>
                          </div>
                        ) : field.type === "checkbox" ? (
                          <span className="flex min-h-11 items-center gap-3 rounded-md border border-[#C9E6E2] bg-[#FAFDFD] px-3">
                            <input
                              type="checkbox"
                              checked={Boolean(form[name])}
                              onChange={(event) => setField(name, event.target.checked)}
                              className="h-4 w-4 accent-[#00998F]"
                            />
                            <span className="text-sm text-[#51646B]">{field.helpText || field.placeholder}</span>
                          </span>
                        ) : (
                          <Input
                            type={field.type === "phone" ? "tel" : field.type}
                            value={asString(form[name])}
                            placeholder={field.placeholder}
                            min={field.min}
                            max={field.max}
                            maxLength={field.maxLength}
                            onChange={(event) => handleInput(field, event)}
                            className="border-[#C9E6E2] bg-[#FAFDFD]"
                          />
                        )}

                        {field.helpText && field.type !== "file" ? <span className="mt-2 block text-xs leading-5 text-[#6B7B80]">{field.helpText}</span> : null}
                      </label>
                    );
                  })}
              </div>
            </section>
          ))}

          <section className="rounded-lg border border-[#C9E6E2] bg-[#082629] p-6 text-white shadow-[0_22px_90px_rgba(0,73,76,0.16)] md:p-8">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="flex items-center gap-3">
                  <LockKeyhole className="h-5 w-5 text-[#7EF3E8]" />
                  <p className="font-display text-2xl font-bold">Datos privados hasta que autorices visibilidad</p>
                </div>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-white/68">{data.formConfig.privacyNote}</p>
                <div className="mt-5 space-y-3 text-sm">
                  <label className="flex gap-3">
                    <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-1 h-4 w-4 accent-[#7EF3E8]" />
                    <span>Acepto los terminos y condiciones de Red Profesional Terraqo y autorizo la creacion de mi perfil privado.</span>
                  </label>
                  <label className="flex gap-3">
                    <input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} className="mt-1 h-4 w-4 accent-[#7EF3E8]" />
                    <span>He leido la politica de privacidad y autorizo el tratamiento de mis datos para procesos profesionales.</span>
                  </label>
                </div>
              </div>
              <Button type="submit" size="lg" disabled={submitting} className="bg-[#00A99D] text-white hover:bg-[#008C84]">
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                {submitting ? "Enviando postulacion" : data.formConfig.submitLabel}
                {!submitting ? <ArrowRight className="h-5 w-5" /> : null}
              </Button>
            </div>
          </section>
        </form>
      </div>
    </section>
  );
}
