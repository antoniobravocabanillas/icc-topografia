"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Filter,
  FolderKanban,
  ImageIcon,
  Lightbulb,
  MapPin,
  Milestone,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
  type LucideIcon
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type PublicCvActivityRecord = {
  id: string;
  title: string;
  summary: string;
  outcome: string | null;
  type: string;
  evidenceStatus: string;
  occurredAt: string;
  createdAt: string;
  skills: string[];
  evidenceUrls: string[];
  project: {
    title: string;
    clientName: string | null;
    location: string | null;
    category: string | null;
    image: string | null;
  } | null;
  workspace: string | null;
  media: Array<{
    id: string;
    fileName: string;
    contentType: string;
    href: string;
    downloadHref: string;
  }>;
  validations: Array<{
    id: string;
    responseNote: string | null;
    resolvedAt: string | null;
    createdAt: string;
    validatorName: string | null;
    validatorImage: string | null;
  }>;
};

type ActivityFilter = "all" | "updates" | "validations" | "documents" | "projects";

const FILTERS: Array<{ id: ActivityFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "updates", label: "Actualizaciones" },
  { id: "validations", label: "Validaciones" },
  { id: "documents", label: "Documentos" },
  { id: "projects", label: "Proyectos" }
];

const TYPE_COPY: Record<string, { label: string; description: string; icon: LucideIcon; tone: string }> = {
  FIELD_UPDATE: { label: "Actualización", description: "Avance profesional registrado", icon: ClipboardCheck, tone: "text-[#25c0d5] border-[#25c0d5]/35 bg-[#25c0d5]/10" },
  DELIVERABLE: { label: "Entregable", description: "Resultado o documento entregado", icon: FileCheck2, tone: "text-[#7fa8ff] border-[#4374ba]/45 bg-[#4374ba]/15" },
  PROBLEM_SOLVED: { label: "Solución", description: "Incidencia resuelta y documentada", icon: Wrench, tone: "text-[#f6be62] border-[#f6be62]/35 bg-[#f6be62]/10" },
  LEARNING: { label: "Aprendizaje", description: "Conocimiento incorporado al perfil", icon: Lightbulb, tone: "text-[#b6d56b] border-[#b6d56b]/35 bg-[#b6d56b]/10" },
  MILESTONE: { label: "Hito", description: "Hito relevante de la trayectoria", icon: Milestone, tone: "text-[#8ba7ff] border-[#488ac9]/45 bg-[#488ac9]/15" },
  EXPERIENCE_UPDATE: { label: "Experiencia", description: "Trayectoria profesional incorporada", icon: BriefcaseBusiness, tone: "text-[#25c0d5] border-[#25c0d5]/35 bg-[#25c0d5]/10" },
  EXPERIENCE_VALIDATION: { label: "Validación", description: "Experiencia profesional revisada", icon: BadgeCheck, tone: "text-[#57d9a6] border-[#57d9a6]/35 bg-[#57d9a6]/10" },
  EDUCATION_UPDATE: { label: "Formación", description: "Formación académica incorporada", icon: Sparkles, tone: "text-[#b6d56b] border-[#b6d56b]/35 bg-[#b6d56b]/10" },
  EDUCATION_VALIDATION: { label: "Validación", description: "Formación académica revisada", icon: BadgeCheck, tone: "text-[#57d9a6] border-[#57d9a6]/35 bg-[#57d9a6]/10" },
  DOCUMENT_VALIDATION: { label: "Documento", description: "Documento revisado por Terraqo", icon: FileCheck2, tone: "text-[#7fa8ff] border-[#4374ba]/45 bg-[#4374ba]/15" },
  PROJECT_ACTIVITY: { label: "Proyecto", description: "Proyecto vinculado a la trayectoria", icon: FolderKanban, tone: "text-[#f6be62] border-[#f6be62]/35 bg-[#f6be62]/10" }
};

function typeMeta(type: string) {
  return TYPE_COPY[type] || TYPE_COPY.FIELD_UPDATE;
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("es-PE", options).format(new Date(value)).replace(/\./g, "");
}

function formatDay(value: string) {
  return formatDate(value, { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
}

function formatLongDate(value: string) {
  return formatDate(value, { day: "2-digit", month: "long", year: "numeric" });
}

function formatTime(value: string) {
  return formatDate(value, { hour: "2-digit", minute: "2-digit", hour12: true });
}

function recordMatchesFilter(record: PublicCvActivityRecord, filter: ActivityFilter) {
  if (filter === "all") return true;
  if (filter === "validations") return record.type.endsWith("_VALIDATION") || record.validations.length > 0 || record.evidenceStatus === "VERIFIED";
  if (filter === "documents") return record.type === "DOCUMENT_VALIDATION" || record.media.length > 0 || record.evidenceUrls.length > 0 || record.type === "DELIVERABLE";
  if (filter === "projects") return record.type === "PROJECT_ACTIVITY" || Boolean(record.project);
  return ["FIELD_UPDATE", "LEARNING", "MILESTONE", "EXPERIENCE_UPDATE", "EDUCATION_UPDATE"].includes(record.type);
}

function evidenceImage(record: PublicCvActivityRecord) {
  const media = record.media.find((item) => item.contentType.startsWith("image/"));
  if (media) return media.href;
  const externalImage = record.evidenceUrls.find((url) => /\.(avif|jpe?g|png|webp)(\?.*)?$/i.test(url));
  return externalImage || record.project?.image || null;
}

export function PublicCvActivityExplorer({ username, profileName, records }: { username: string; profileName: string; records: PublicCvActivityRecord[] }) {
  const [activeFilter, setActiveFilter] = useState<ActivityFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(records[0]?.id || "");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("registro");
    if (requested && records.some((record) => record.id === requested)) setSelectedId(requested);
  }, [records]);

  const visibleRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    return records.filter((record) => {
      if (!recordMatchesFilter(record, activeFilter)) return false;
      if (!normalizedQuery) return true;
      return [record.title, record.summary, record.outcome, record.project?.title, record.project?.clientName, record.workspace, ...record.skills]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("es")
        .includes(normalizedQuery);
    });
  }, [activeFilter, query, records]);

  useEffect(() => {
    if (visibleRecords.length && !visibleRecords.some((record) => record.id === selectedId)) setSelectedId(visibleRecords[0].id);
  }, [selectedId, visibleRecords]);

  const selected = records.find((record) => record.id === selectedId) || visibleRecords[0] || records[0] || null;

  function selectRecord(id: string) {
    setSelectedId(id);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("registro", id);
    window.history.replaceState({}, "", nextUrl);
    if (window.matchMedia("(max-width: 1279px)").matches) {
      window.setTimeout(() => document.getElementById("detalle-registro")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
  }

  async function copySelectedLink() {
    if (!selected) return;
    const url = new URL(window.location.href);
    url.searchParams.set("registro", selected.id);
    await navigator.clipboard.writeText(url.toString());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="relative min-h-[calc(100vh-76px)] overflow-hidden bg-[#07111f] text-[#f3f3f3]">
      <span className="pointer-events-none absolute -left-40 top-0 h-[620px] w-[620px] rounded-full bg-[#4374ba]/15 blur-[120px]" aria-hidden="true" />
      <span className="pointer-events-none absolute -right-40 top-[22%] h-[560px] w-[560px] rounded-full bg-[#25c0d5]/10 blur-[140px]" aria-hidden="true" />
      <div className="relative mx-auto w-[min(100%-28px,1540px)] py-7 sm:py-10">
        <Link href={`/cv/${username}`} className="inline-flex items-center gap-2 text-sm font-bold text-[#7fa8ff] transition hover:text-[#25c0d5]">
          <ArrowLeft className="h-4 w-4" /> Volver al CV vivo
        </Link>

        <div className="mt-8 grid items-start gap-10 xl:grid-cols-[minmax(0,0.88fr)_minmax(590px,1.12fr)] xl:gap-0">
          <section className="min-w-0 xl:pr-10 2xl:pr-14">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="font-mono text-xs font-black uppercase tracking-[0.26em] text-[#25c0d5]">Actividad pública verificable</p>
                <h1 className="mt-4 max-w-[670px] font-display text-4xl font-black leading-[0.98] tracking-[-0.035em] sm:text-5xl lg:text-[3.4rem]">
                  Bitácoras y registros del CV en vivo
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-[#aebed0]">
                  La trayectoria de {profileName} se actualiza con trabajo documentado, resultados y revisiones vinculadas a su actividad profesional.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-4 border-l border-[#27415d] pl-5 lg:w-[175px]">
                <span className="grid h-12 w-12 place-items-center rounded-full border border-[#4374ba]/55 bg-[#4374ba]/15 text-[#7fa8ff]"><FileText className="h-5 w-5" /></span>
                <div><strong className="block text-3xl font-black leading-none">{records.length}</strong><span className="mt-1 block text-xs text-[#91a5b9]">registros públicos</span></div>
              </div>
            </div>

            <div className="mt-9 flex flex-col gap-4 border-y border-[#1d344d] py-5">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar actividad por tipo">
                {FILTERS.map((filter) => (
                  <button key={filter.id} type="button" onClick={() => setActiveFilter(filter.id)} className={`rounded-full border px-4 py-2 text-xs font-black transition ${activeFilter === filter.id ? "border-[#488ac9] bg-[#4374ba] text-white shadow-[0_0_20px_rgba(67,116,186,0.28)]" : "border-[#2b4158] bg-transparent text-[#aebed0] hover:border-[#488ac9] hover:text-white"}`}>
                    {filter.label}
                  </button>
                ))}
              </div>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71869b]" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por registro, proyecto o habilidad" className="h-11 w-full rounded-lg border border-[#2a4058] bg-[#0e1a26]/65 pl-11 pr-11 text-sm text-white outline-none transition placeholder:text-[#71869b] focus:border-[#488ac9] focus:ring-2 focus:ring-[#4374ba]/25" />
                <Filter className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71869b]" />
              </label>
            </div>

            <div className="relative mt-6">
              <span className="absolute bottom-5 left-[18px] top-5 w-px bg-gradient-to-b from-[#4374ba] via-[#25c0d5]/55 to-transparent" aria-hidden="true" />
              {visibleRecords.length ? (
                <div className="space-y-2">
                  {visibleRecords.map((record) => {
                    const meta = typeMeta(record.type);
                    const Icon = meta.icon;
                    const active = selected?.id === record.id;
                    const thumb = evidenceImage(record);
                    const validated = record.validations.length > 0 || record.evidenceStatus === "VERIFIED";
                    return (
                      <button key={record.id} type="button" onClick={() => selectRecord(record.id)} aria-pressed={active} className={`group relative grid w-full grid-cols-[38px_1fr_auto] gap-3 rounded-xl border px-0 py-4 text-left transition sm:grid-cols-[38px_122px_1fr_auto] sm:gap-4 sm:px-3 ${active ? "border-[#4374ba] bg-[linear-gradient(100deg,rgba(67,116,186,0.19),rgba(14,26,38,0.6))] shadow-[0_15px_38px_rgba(0,0,0,0.22)]" : "border-transparent hover:border-[#27415d] hover:bg-[#0e1a26]/60"}`}>
                        <span className={`relative z-10 mt-1 grid h-9 w-9 place-items-center rounded-full border bg-[#07111f] ${meta.tone}`}><Icon className="h-4 w-4" /></span>
                        <div className="hidden sm:block">
                          <p className="font-mono text-[11px] font-black tracking-[0.05em] text-[#c2cfdd]">{formatDay(record.occurredAt)}</p>
                          <p className="mt-1 text-xs text-[#73899e]">{formatTime(record.occurredAt)}</p>
                          {thumb ? <div className="relative mt-3 aspect-[16/10] overflow-hidden rounded-md border border-[#2b4158] bg-[#0e1a26]"><Image src={thumb} alt="" fill sizes="122px" unoptimized className="object-cover" /></div> : null}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-[0.08em] ${meta.tone}`}>{meta.label}</span>
                            {validated ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#57d9a6]"><CheckCircle2 className="h-3.5 w-3.5" /> Verificado</span> : null}
                          </div>
                          <h2 className="mt-3 line-clamp-2 text-base font-black text-white sm:text-lg">{record.title}</h2>
                          <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#91a5b9]">{record.project?.title || meta.description}</p>
                          <p className="mt-2 font-mono text-[10px] font-bold uppercase text-[#71869b] sm:hidden">{formatDay(record.occurredAt)} · {formatTime(record.occurredAt)}</p>
                        </div>
                        <ArrowRight className={`mr-2 mt-8 h-5 w-5 transition ${active ? "translate-x-1 text-[#25c0d5]" : "text-[#597087] group-hover:translate-x-1 group-hover:text-[#7fa8ff]"}`} />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#2a4058] px-6 py-14 text-center">
                  <Search className="mx-auto h-8 w-8 text-[#597087]" />
                  <h2 className="mt-4 text-lg font-black">No encontramos registros con estos filtros</h2>
                  <p className="mt-2 text-sm text-[#91a5b9]">Prueba otra categoría o limpia el texto de búsqueda.</p>
                </div>
              )}
            </div>
          </section>

          <section id="detalle-registro" className="min-w-0 scroll-mt-6 border-t border-[#1d344d] pt-8 xl:sticky xl:top-24 xl:max-h-[calc(100vh-112px)] xl:overflow-y-auto xl:border-l xl:border-t-0 xl:pl-10 xl:pt-0 2xl:pl-14">
            {selected ? <ActivityDetail record={selected} copied={copied} onCopy={copySelectedLink} /> : <ActivityEmpty />}
          </section>
        </div>
      </div>
    </main>
  );
}

function ActivityDetail({ record, copied, onCopy }: { record: PublicCvActivityRecord; copied: boolean; onCopy: () => void }) {
  const meta = typeMeta(record.type);
  const Icon = meta.icon;
  const validation = record.validations[0] || null;
  const validated = Boolean(validation) || record.evidenceStatus === "VERIFIED";
  const image = evidenceImage(record);
  const primaryMedia = record.media[0] || null;

  return (
    <article className="overflow-hidden rounded-2xl border border-[#28425e] bg-[linear-gradient(150deg,rgba(15,31,52,0.98),rgba(7,17,31,0.98))] shadow-[0_30px_80px_rgba(0,0,0,0.32)]">
      <header className="border-b border-[#243b55] p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.1em] ${meta.tone}`}><Icon className="h-3.5 w-3.5" />{meta.label}</span>
            <h2 className="mt-4 font-display text-2xl font-black leading-tight sm:text-3xl">{record.title}</h2>
            <p className="mt-2 text-sm text-[#91a5b9]">Registro generado el {formatLongDate(record.createdAt)}, {formatTime(record.createdAt)}.</p>
          </div>
          <button type="button" onClick={onCopy} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-[#35506e] px-4 py-2.5 text-xs font-black text-[#dbe6f2] transition hover:border-[#488ac9] hover:bg-[#4374ba]/15">
            <Copy className="h-4 w-4" /> {copied ? "Enlace copiado" : "Compartir registro"}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black ${validated ? "bg-[#143e36] text-[#6be0b2]" : "bg-[#4a3519] text-[#f5c36f]"}`}>
            {validated ? <BadgeCheck className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}{validated ? "Validado" : "Declarado"}
          </span>
          <span className="rounded-full border border-[#304963] px-3 py-1 text-[11px] font-black text-[#aebed0]">Público</span>
        </div>
      </header>

      <div className="p-5 sm:p-7">
        <section>
          <h3 className="font-mono text-xs font-black uppercase tracking-[0.16em] text-[#7fa8ff]">Resumen del registro</h3>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-5 border-y border-[#243b55] py-5">
            <DetailMetric icon={CalendarDays} label="Fecha" value={formatDay(record.occurredAt)} />
            <DetailMetric icon={Clock3} label="Hora" value={formatTime(record.occurredAt)} />
            <DetailMetric icon={ShieldCheck} label="Estado" value={validated ? "Validado" : "Declarado"} accent={validated} />
            {record.project ? <DetailMetric icon={FolderKanban} label="Proyecto" value={record.project.title} /> : null}
          </div>
        </section>

        <section className="mt-7">
          <h3 className="font-mono text-xs font-black uppercase tracking-[0.16em] text-[#7fa8ff]">Detalle profesional</h3>
          <p className="mt-4 text-[15px] leading-7 text-[#d7e1ec]">{record.summary}</p>
          {record.outcome ? <div className="mt-5 border-l-2 border-[#25c0d5] bg-[#0d2533] px-5 py-4"><p className="text-xs font-black uppercase tracking-[0.12em] text-[#25c0d5]">Resultado registrado</p><p className="mt-2 text-sm leading-6 text-[#c5d2df]">{record.outcome}</p></div> : null}
        </section>

        {record.project || record.workspace ? (
          <section className="mt-7 border-y border-[#243b55] py-5">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#4374ba]/15 text-[#7fa8ff]"><BriefcaseBusiness className="h-5 w-5" /></span>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[#71869b]">Contexto del trabajo</p>
                <h3 className="mt-1 text-base font-black">{record.project?.title || record.workspace}</h3>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#91a5b9]">
                  {record.project?.clientName ? <span>{record.project.clientName}</span> : null}
                  {record.project?.location ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{record.project.location}</span> : null}
                  {record.project?.category ? <span>{record.project.category}</span> : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="mt-7">
          <div className="flex items-center justify-between gap-4"><h3 className="font-mono text-xs font-black uppercase tracking-[0.16em] text-[#7fa8ff]">Evidencia pública</h3>{primaryMedia ? <a href={primaryMedia.downloadHref} className="inline-flex items-center gap-2 text-xs font-black text-[#25c0d5] hover:text-white"><Download className="h-4 w-4" />Descargar</a> : null}</div>
          {image ? (
            <a href={primaryMedia?.href || image} target="_blank" rel="noreferrer" className="group relative mt-4 block aspect-[16/10] overflow-hidden rounded-xl border border-[#2a4561] bg-[#0e1a26]">
              <Image src={image} alt={`Evidencia de ${record.title}`} fill sizes="(max-width: 1280px) 100vw, 680px" unoptimized className="object-cover transition duration-500 group-hover:scale-[1.015]" />
              <span className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-lg border border-white/20 bg-[#07111f]/85 px-3 py-2 text-xs font-black backdrop-blur"><ExternalLink className="h-3.5 w-3.5" />Abrir evidencia</span>
            </a>
          ) : (
            <div className="mt-4 flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-[#304963] bg-[#0e1a26]/55 px-8 text-center">
              <div><ImageIcon className="mx-auto h-8 w-8 text-[#597087]" /><p className="mt-3 text-sm font-black">Registro documentado sin imagen pública</p><p className="mt-1 text-xs leading-5 text-[#71869b]">El detalle profesional y su estado de revisión permanecen visibles.</p></div>
            </div>
          )}
          {record.evidenceUrls.length ? <div className="mt-3 flex flex-wrap gap-2">{record.evidenceUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-[#304963] px-3 py-2 text-xs font-bold text-[#aebed0] hover:border-[#488ac9] hover:text-white"><ExternalLink className="h-3.5 w-3.5" />Referencia {index + 1}</a>)}</div> : null}
        </section>

        {record.skills.length ? <section className="mt-7"><h3 className="font-mono text-xs font-black uppercase tracking-[0.16em] text-[#7fa8ff]">Capacidades vinculadas</h3><div className="mt-3 flex flex-wrap gap-2">{record.skills.map((skill) => <span key={skill} className="rounded-full border border-[#2e4660] bg-[#102238] px-3 py-1.5 text-xs font-bold text-[#bdcada]">{skill}</span>)}</div></section> : null}

        {validation ? (
          <section className="mt-7 rounded-xl border border-[#285366] bg-[#0b2731] p-5">
            <div className="flex items-start gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#25c0d5]/12 text-[#25c0d5]"><BadgeCheck className="h-5 w-5" /></span>
              <div>
                <p className="font-black text-[#e7f6f5]">Validación profesional</p>
                <p className="mt-1 text-xs text-[#8eabb4]">{validation.validatorName ? `Revisado por ${validation.validatorName}` : "Revisado por un responsable autorizado"} · {formatLongDate(validation.resolvedAt || validation.createdAt)}</p>
                {validation.responseNote ? <p className="mt-3 text-sm leading-6 text-[#bfd0d5]">{validation.responseNote}</p> : null}
              </div>
            </div>
          </section>
        ) : null}

        <p className="mt-6 flex items-start gap-2 border-t border-[#243b55] pt-5 text-xs leading-5 text-[#71869b]"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />Este registro forma parte de la actividad pública seleccionada por el profesional. Terraqo distingue entre información declarada y contenido validado.</p>
      </div>
    </article>
  );
}

function DetailMetric({ icon: Icon, label, value, accent = false }: { icon: LucideIcon; label: string; value: string; accent?: boolean }) {
  return <div className="flex min-w-[128px] items-start gap-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#7fa8ff]" /><div><span className="block text-[10px] font-black uppercase tracking-[0.12em] text-[#71869b]">{label}</span><strong className={`mt-1 block text-xs ${accent ? "text-[#57d9a6]" : "text-[#dbe6f2]"}`}>{value}</strong></div></div>;
}

function ActivityEmpty() {
  return <div className="grid min-h-[520px] place-items-center rounded-2xl border border-dashed border-[#2a4058] px-8 text-center"><div><Sparkles className="mx-auto h-9 w-9 text-[#4374ba]" /><h2 className="mt-4 text-xl font-black">Actividad pública en construcción</h2><p className="mt-2 max-w-sm text-sm leading-6 text-[#91a5b9]">Cuando el profesional publique una bitácora, su detalle aparecerá aquí.</p></div></div>;
}
