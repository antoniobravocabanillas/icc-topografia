"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Copy,
  ExternalLink,
  FileCheck2,
  FileText,
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
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./public-cv-activity-explorer.module.css";
import { ACTIVITY_PAGE_SIZE, activityDay, activityNavigationUrl, filterActivity, hasActivityReview, readActivityNavigation, type ActivityNavigation } from "@/lib/public-activity-navigation";
import { EvidenceGallery } from "@/components/terraqo/evidence-gallery";

export type PublicCvActivityRecord = {
  id: string;
  title: string;
  summary: string;
  outcome: string | null;
  type: string;
  evidenceStatus: string;
  occurredAt: string;
  createdAt: string;
  locationLabel: string | null;
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

const TYPE_COPY: Record<string, { label: string; description: string; icon: LucideIcon; tone: string }> = {
  FIELD_UPDATE: { label: "Actualización", description: "Avance profesional registrado", icon: ClipboardCheck, tone: "text-[#25c0d5] border-[#25c0d5]/35 bg-[#25c0d5]/10" },
  DELIVERABLE: { label: "Entregable", description: "Resultado o documento entregado", icon: FileCheck2, tone: "text-[#7fa8ff] border-[#4374ba]/45 bg-[#4374ba]/15" },
  PROBLEM_SOLVED: { label: "Solución", description: "Incidencia resuelta y documentada", icon: Wrench, tone: "text-[#f6be62] border-[#f6be62]/35 bg-[#f6be62]/10" },
  LEARNING: { label: "Aprendizaje", description: "Conocimiento incorporado al perfil", icon: Lightbulb, tone: "text-[#b6d56b] border-[#b6d56b]/35 bg-[#b6d56b]/10" },
  MILESTONE: { label: "Hito", description: "Hito relevante de la trayectoria", icon: Milestone, tone: "text-[#8ba7ff] border-[#488ac9]/45 bg-[#488ac9]/15" },
  EXPERIENCE_UPDATE: { label: "Experiencia", description: "Trayectoria profesional incorporada", icon: BriefcaseBusiness, tone: "text-[#25c0d5] border-[#25c0d5]/35 bg-[#25c0d5]/10" },
  EXPERIENCE_VALIDATION: { label: "Revisión de experiencia", description: "Experiencia profesional revisada", icon: BadgeCheck, tone: "text-[#57d9a6] border-[#57d9a6]/35 bg-[#57d9a6]/10" },
  EDUCATION_UPDATE: { label: "Formación", description: "Formación académica incorporada", icon: Sparkles, tone: "text-[#b6d56b] border-[#b6d56b]/35 bg-[#b6d56b]/10" },
  EDUCATION_VALIDATION: { label: "Revisión de formación", description: "Formación académica revisada", icon: BadgeCheck, tone: "text-[#57d9a6] border-[#57d9a6]/35 bg-[#57d9a6]/10" },
  DOCUMENT_VALIDATION: { label: "Documento", description: "Documento revisado por Terraqo", icon: FileCheck2, tone: "text-[#7fa8ff] border-[#4374ba]/45 bg-[#4374ba]/15" },
  PROJECT_ACTIVITY: { label: "Proyecto", description: "Proyecto vinculado a la trayectoria", icon: FolderKanban, tone: "text-[#f6be62] border-[#f6be62]/35 bg-[#f6be62]/10" }
};

function typeMeta(type: string) {
  return TYPE_COPY[type] || TYPE_COPY.FIELD_UPDATE;
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("es-PE", { ...options, timeZone: "America/Lima" }).format(new Date(value)).replace(/\./g, "");
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

function evidenceImage(record: PublicCvActivityRecord) {
  const media = record.media.find((item) => item.contentType.startsWith("image/"));
  if (media) return media.href;
  const externalImage = record.evidenceUrls.find((url) => /\.(avif|jpe?g|png|webp)(\?.*)?$/i.test(url));
  return externalImage || record.project?.image || null;
}

export function PublicCvActivityExplorer({ username, profileName, records }: { username: string; profileName: string; records: PublicCvActivityRecord[] }) {
  const [navigation, setNavigation] = useState<ActivityNavigation>(() => readActivityNavigation(new URL("https://terraqo.invalid"), records));
  const [ready, setReady] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const listScroll = useRef(0);
  const selectedButton = useRef<HTMLButtonElement | null>(null);
  const detailHeading = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function restore() {
      const url = new URL(window.location.href);
      const next = readActivityNavigation(url, records);
      const filtered = filterActivity(records, next);
      const index = filtered.findIndex(record => record.id === next.selectedId);
      if(index >= 0 && !url.searchParams.has("pagina")) next.page = Math.floor(index / ACTIVITY_PAGE_SIZE) + 1;
      if (!url.searchParams.get("registro") && !url.hash) next.selectedId = filtered[(next.page - 1) * ACTIVITY_PAGE_SIZE]?.id || "";
      setNavigation(next);
      setShowDetail(Boolean(url.searchParams.get("registro") || url.hash));
      setReady(true);
    }
    restore();
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => { window.removeEventListener("popstate", restore); window.removeEventListener("hashchange", restore); };
  }, [records]);

  const scoped = useMemo(() => filterActivity(records, navigation, true), [records, navigation]);
  const visibleRecords = useMemo(() => filterActivity(records, navigation), [records, navigation]);
  const pageCount = Math.max(1, Math.ceil(visibleRecords.length / ACTIVITY_PAGE_SIZE));
  const currentPage = Math.min(navigation.page, pageCount);
  const pageRecords = visibleRecords.slice((currentPage - 1) * ACTIVITY_PAGE_SIZE, currentPage * ACTIVITY_PAGE_SIZE);
  const selected = visibleRecords.find(record => record.id === navigation.selectedId) || null;
  const unavailable = Boolean(navigation.selectedId && !records.some(record => record.id === navigation.selectedId));
  const types = Array.from(new Set(records.map(record => record.type)));
  const projects = Array.from(new Set(records.flatMap(record => record.project ? [record.project.title] : [])));
  const dayCounts = new Map<string, number>();
  scoped.forEach(record => { const day = activityDay(record.occurredAt); dayCounts.set(day, (dayCounts.get(day) || 0) + 1); });
  const monthOptions = Array.from(new Set([...records.map(record => activityDay(record.occurredAt).slice(0, 7)), navigation.month])).sort().reverse();
  const [year, month] = navigation.month.split("-").map(Number);
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const today = ready ? activityDay(new Date().toISOString()) : "";

  useEffect(() => {
    if (!ready) return;
    window.history.replaceState(window.history.state, "", activityNavigationUrl(new URL(window.location.href), {...navigation, page:currentPage}));
  }, [navigation, currentPage, ready]);

  function update(patch: Partial<ActivityNavigation>) {
    const next = {...navigation, ...patch, page:patch.page || 1};
    const filtered = filterActivity(records, next);
    const start = (next.page - 1) * ACTIVITY_PAGE_SIZE;
    const page = filtered.slice(start, start + ACTIVITY_PAGE_SIZE);
    if (!page.some(record => record.id === next.selectedId)) next.selectedId = page[0]?.id || "";
    setNavigation(next);
    setCopied(false);
    setCopyError("");
  }

  function selectRecord(id: string, button: HTMLButtonElement) {
    listScroll.current = window.scrollY;
    selectedButton.current = button;
    setCopied(false);
    setCopyError("");
    const next = {...navigation, selectedId:id};
    window.history.pushState(window.history.state, "", activityNavigationUrl(new URL(window.location.href), next));
    setNavigation(next);
    setShowDetail(true);
    if (window.matchMedia("(max-width: 899px)").matches) requestAnimationFrame(() => { detailHeading.current?.focus(); detailHeading.current?.scrollIntoView({block:"start"}); });
  }

  function backToList() {
    setShowDetail(false);
    requestAnimationFrame(() => { window.scrollTo({top:listScroll.current}); selectedButton.current?.focus({preventScroll:true}); });
  }

  async function copySelectedLink() {
    if (!selected) return;
    const url = new URL(window.location.href);
    // Share the record independently of the current search/filter scope.
    for (const key of ["buscar", "tipo", "revision", "proyecto", "fecha", "mes", "vista", "pagina"]) url.searchParams.delete(key);
    url.hash = "";
    url.searchParams.set("registro", selected.id);
    try { await navigator.clipboard.writeText(url.toString()); setCopied(true); setCopyError(""); }
    catch { setCopyError(url.toString()); }
  }

  return <main className={styles.explorer}>
    <div className={styles.wrap}>
      <Link href={`/cv/${username}`} className={styles.back}><ArrowLeft size={16} /> Volver al CV vivo</Link>
      <header className={styles.heading}><div><p className={styles.eyebrow}>{profileName}</p><h1>Bitácoras y evidencias</h1><p>Explora el trabajo, sus resultados y el alcance de cada revisión.</p></div><span>{records.length} registros públicos</span></header>
      <div className={styles.toolbar}>
        <label className={styles.search}>Buscar trabajo, proyecto o habilidad<div><Search size={17} aria-hidden="true"/><input type="search" value={navigation.query} onChange={event=>update({query:event.target.value})} placeholder="Por ejemplo, replanteo" /></div></label>
        <label>Tipo<select value={navigation.type} onChange={event=>update({type:event.target.value})}><option value="all">Todos los tipos</option>{types.map(type=><option key={type} value={type}>{typeMeta(type).label}</option>)}</select></label>
        <label>Revisión<select value={navigation.review} onChange={event=>update({review:event.target.value})}><option value="all">Todos los estados</option><option value="declared">Declarado</option><option value="reviewed">Con revisión</option></select></label>
        {projects.length > 0 && <label>Proyecto<select value={navigation.project} onChange={event=>update({project:event.target.value})}><option value="all">Todos los proyectos</option>{projects.map(project=><option key={project}>{project}</option>)}</select></label>}
        <div className={styles.views} role="group" aria-label="Vista del archivo"><button type="button" aria-pressed={navigation.view==='list'} onClick={()=>setNavigation(value=>({...value,view:'list'}))}>Lista</button><button type="button" aria-pressed={navigation.view==='calendar'} onClick={()=>setNavigation(value=>({...value,view:'calendar'}))}><CalendarDays size={15}/>Calendario</button></div>
      </div>
      <div className={`${styles.layout} ${showDetail ? styles.detailOpen : ''}`}>
        <section className={styles.list} aria-label="Resultados del archivo">
          {navigation.view==='calendar' && <section className={styles.calendar} aria-label="Calendario de actividad"><div className={styles.calendarHeader}><label>Mes y año<select value={navigation.month} onChange={event=>update({month:event.target.value,date:''})}>{monthOptions.map(value=><option key={value} value={value}>{formatDate(value+'-15T12:00:00Z',{month:'long',year:'numeric'})}</option>)}</select></label><button type="button" onClick={()=>update({date:''})} disabled={!navigation.date}>Quitar fecha</button></div><div className={styles.days}>{['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(day=><span key={day}>{day}</span>)}{Array.from({length:offset},(_,i)=><span key={'blank'+i}/>)}{Array.from({length:daysInMonth},(_,i)=>{const key=`${navigation.month}-${String(i+1).padStart(2,'0')}`;const count=dayCounts.get(key)||0;return <button type="button" key={key} aria-label={`${formatLongDate(key+'T12:00:00Z')}, ${count} ${count === 1 ? "registro" : "registros"}`} aria-pressed={navigation.date===key} aria-current={today===key?'date':undefined} onClick={()=>update({date:key})}>{i+1}{count>0&&<small>{count}</small>}</button>})}</div><p>Los números pequeños indican registros que coinciden con tus filtros. Fechas de Lima.</p></section>}
          <div className={styles.resultsHeader}><p role="status">{visibleRecords.length} {visibleRecords.length===1?'resultado':'resultados'} de {records.length}{navigation.date ? ` · ${formatDay(navigation.date+'T12:00:00Z')}` : ''}</p><button type="button" onClick={()=>update({query:'',type:'all',review:'all',project:'all',date:''})}>Limpiar filtros</button></div>
          {pageRecords.length ? <div className={styles.records}>{pageRecords.map(record=>{const meta=typeMeta(record.type);const thumb=evidenceImage(record);return <button type="button" key={record.id} className={styles.record} aria-pressed={selected?.id===record.id} onClick={event=>selectRecord(record.id,event.currentTarget)}><span className={styles.thumb}>{thumb?<Image src={thumb} alt="" fill sizes="72px" unoptimized/>:<FileText size={24}/>}</span><span><small>{formatDay(record.occurredAt)} · {meta.label}</small><strong>{record.title}</strong><span className={styles.context}>{record.project?.title || record.workspace || 'Actividad profesional'}</span><span className={hasActivityReview(record)?styles.reviewed:styles.declared}>{hasActivityReview(record)?'Con revisión':'Declarado'}</span></span><ArrowRight size={17} aria-hidden="true"/></button>})}</div>:<div className={styles.empty}><Search/><h2>No hay registros en esta selección</h2><p>Prueba otra fecha o limpia los filtros.</p></div>}
          {pageCount>1&&<nav className={styles.pagination} aria-label="Paginación de registros"><button type="button" disabled={currentPage===1} onClick={()=>update({page:currentPage-1})}>Anterior</button><span>Página {currentPage} de {pageCount}</span><button type="button" disabled={currentPage===pageCount} onClick={()=>update({page:currentPage+1})}>Siguiente</button></nav>}
        </section>
        <section id="detalle-registro" className={styles.detail} aria-label="Detalle del registro"><div ref={detailHeading} tabIndex={-1} className={styles.detailFocus}><button type="button" className={styles.mobileBack} onClick={backToList}><ArrowLeft size={16}/> Volver a resultados</button>{unavailable?<div className={styles.empty}><h2>Registro no disponible</h2><p>El enlace no corresponde a un registro público de este perfil. Selecciona otro resultado.</p></div>:selected?<ActivityDetail record={selected} copied={copied} onCopy={copySelectedLink}/>:<div className={styles.empty}><h2>{visibleRecords.length?'Selecciona un registro':'Sin resultados para mostrar'}</h2><p>El detalle conserva el contexto de tu búsqueda.</p></div>}{copyError&&<label className={styles.copyFallback}>No se pudo copiar. Selecciona este enlace:<input readOnly value={copyError} onFocus={event=>event.target.select()}/></label>}<span role="status" className="sr-only">{copied?'Enlace copiado':''}</span></div></section>
      </div>
    </div>
  </main>;
}

function ActivityDetail({ record, copied, onCopy }: { record: PublicCvActivityRecord; copied: boolean; onCopy: () => void }) {
  const meta = typeMeta(record.type);
  const Icon = meta.icon;
  const validation = record.validations[0] || null;
  const validated = Boolean(validation) || record.evidenceStatus === "VERIFIED";
  const image = evidenceImage(record);
  const galleryItems = record.media
    .filter((media) => media.contentType.startsWith("image/"))
    .map((media, index) => ({
      id: media.id,
      src: media.href,
      downloadHref: media.downloadHref,
      alt: `${record.title}, evidencia ${index + 1}`,
    }));

  return (
    <article className="overflow-hidden rounded-2xl border border-[#28425e] bg-[linear-gradient(150deg,rgba(15,31,52,0.98),rgba(7,17,31,0.98))] shadow-[0_30px_80px_rgba(0,0,0,0.32)]">
      <header className="border-b border-[#243b55] p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] ${meta.tone}`}><Icon className="h-3.5 w-3.5" />{meta.label}</span>
            <h2 className="mt-4 font-display text-2xl font-semibold leading-tight sm:text-3xl">{record.title}</h2>
            <p className="mt-2 text-sm text-[#91a5b9]">Registro generado el {formatLongDate(record.createdAt)}, {formatTime(record.createdAt)}.</p>
          </div>
          <button type="button" onClick={onCopy} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-[#35506e] px-4 py-2.5 text-xs font-semibold text-[#dbe6f2] transition hover:border-[#488ac9] hover:bg-[#4374ba]/15">
            <Copy className="h-4 w-4" /> {copied ? "Enlace copiado" : "Compartir registro"}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${validated ? "bg-[#143e36] text-[#6be0b2]" : "bg-[#4a3519] text-[#f5c36f]"}`}>
            {validated ? <BadgeCheck className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}{validated ? "Validado" : "Declarado"}
          </span>
          <span className="rounded-full border border-[#304963] px-3 py-1 text-[11px] font-semibold text-[#aebed0]">Público</span>
        </div>
      </header>

      <div className="p-5 sm:p-7">
        <section>
          <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#7fa8ff]">Resumen del registro</h3>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-5 border-y border-[#243b55] py-5">
            <DetailMetric icon={CalendarDays} label="Fecha" value={formatDay(record.occurredAt)} />
            <DetailMetric icon={Clock3} label="Hora" value={formatTime(record.occurredAt)} />
            <DetailMetric icon={ShieldCheck} label="Estado" value={validated ? "Validado" : "Declarado"} accent={validated} />
            {record.project ? <DetailMetric icon={FolderKanban} label="Proyecto" value={record.project.title} /> : null}
            {record.locationLabel ? <DetailMetric icon={MapPin} label="Lugar" value={record.locationLabel} /> : null}
          </div>
          {record.locationLabel ? <p className="mt-2 text-right text-[10px] font-medium text-[#60778e]">Ubicación aproximada · © OpenStreetMap contributors</p> : null}
        </section>

        <section className="mt-7">
          <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#7fa8ff]">Contribución registrada</h3>
          <p className="mt-4 text-[15px] leading-7 text-[#d7e1ec]">{record.summary}</p>
          {record.outcome ? <div className="mt-5 border-l-2 border-[#25c0d5] bg-[#0d2533] px-5 py-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#25c0d5]">Resultado registrado</p><p className="mt-2 text-sm leading-6 text-[#c5d2df]">{record.outcome}</p></div> : null}
        </section>

        {record.project || record.workspace ? (
          <section className="mt-7 border-y border-[#243b55] py-5">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#4374ba]/15 text-[#7fa8ff]"><BriefcaseBusiness className="h-5 w-5" /></span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#71869b]">Contexto del trabajo</p>
                <h3 className="mt-1 text-base font-semibold">{record.project?.title || record.workspace}</h3>
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
          <div className="flex items-center justify-between gap-4"><h3 className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#7fa8ff]">Evidencia pública</h3>{galleryItems.length > 1 ? <span className="text-xs font-bold text-[#91a5b9]">{galleryItems.length} imágenes</span> : null}</div>
          {galleryItems.length ? (
            <EvidenceGallery items={galleryItems} tone="dark" className="mt-4" />
          ) : image ? (
            <a href={image} target="_blank" rel="noreferrer" className="group relative mt-4 block aspect-[16/10] overflow-hidden rounded-xl border border-[#2a4561] bg-[#0e1a26]">
              <Image src={image} alt={`Evidencia de ${record.title}`} fill sizes="(max-width: 1280px) 100vw, 680px" unoptimized className="object-cover transition duration-500 group-hover:scale-[1.015]" />
              <span className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-lg border border-white/20 bg-[#07111f]/85 px-3 py-2 text-xs font-semibold backdrop-blur"><ExternalLink className="h-3.5 w-3.5" />Abrir evidencia</span>
            </a>
          ) : (
            <div className="mt-4 flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-[#304963] bg-[#0e1a26]/55 px-8 text-center">
              <div><ImageIcon className="mx-auto h-8 w-8 text-[#597087]" /><p className="mt-3 text-sm font-semibold">Registro documentado sin imagen pública</p><p className="mt-1 text-xs leading-5 text-[#71869b]">El detalle profesional y su estado de revisión permanecen visibles.</p></div>
            </div>
          )}
          {record.evidenceUrls.length ? <div className="mt-3 flex flex-wrap gap-2">{record.evidenceUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-[#304963] px-3 py-2 text-xs font-bold text-[#aebed0] hover:border-[#488ac9] hover:text-white"><ExternalLink className="h-3.5 w-3.5" />Referencia {index + 1}</a>)}</div> : null}
        </section>

        {record.skills.length ? <section className="mt-7"><h3 className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#7fa8ff]">Capacidades vinculadas</h3><div className="mt-3 flex flex-wrap gap-2">{record.skills.map((skill) => <span key={skill} className="rounded-full border border-[#2e4660] bg-[#102238] px-3 py-1.5 text-xs font-bold text-[#bdcada]">{skill}</span>)}</div></section> : null}

        {validation ? (
          <section className="mt-7 rounded-xl border border-[#285366] bg-[#0b2731] p-5">
            <div className="flex items-start gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#25c0d5]/12 text-[#25c0d5]"><BadgeCheck className="h-5 w-5" /></span>
              <div>
                <p className="font-semibold text-[#e7f6f5]">Alcance de la revisión</p>
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
  return <div className="flex min-w-[128px] items-start gap-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#7fa8ff]" /><div><span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#71869b]">{label}</span><strong className={`mt-1 block text-xs ${accent ? "text-[#57d9a6]" : "text-[#dbe6f2]"}`}>{value}</strong></div></div>;
}
