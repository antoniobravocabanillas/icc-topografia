"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, EyeOff, Grid2X2, List, MapPin, Search } from "lucide-react";
import type { ProjectSnapshot } from "@/components/terraqo/public-cv";

const STATUS_LABEL: Record<string, string> = {
  PLANNING: "Planificado",
  IN_PROGRESS: "En ejecución",
  FINISHED: "Completado",
  PUBLISHED: "Publicado",
  ARCHIVED: "Archivado"
};

function hrefForProject(project: ProjectSnapshot) {
  const slug = project.slug?.trim();
  if (!slug || slug === "#") return null;
  if (/^https?:\/\//i.test(slug) || slug.startsWith("/")) return slug;
  return `/proyectos/${slug}`;
}

export function PublicCvProjectExplorer({ projects, username }: { projects: ProjectSnapshot[]; username: string }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("TODOS");
  const [sort, setSort] = useState("RELEVANTES");
  const [view, setView] = useState<"grid" | "list">("grid");

  const categories = useMemo(
    () => Array.from(new Set(projects.map((project) => project.category?.trim()).filter((value): value is string => Boolean(value)))),
    [projects]
  );

  const visibleProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    const filtered = projects.filter((project) => {
      const matchesCategory = category === "TODOS" || project.category === category;
      const searchable = [project.title, project.clientName, project.location, project.category].filter(Boolean).join(" ").toLocaleLowerCase("es");
      return matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery));
    });

    return [...filtered].sort((left, right) => {
      if (sort === "TITULO") return left.title.localeCompare(right.title, "es");
      if (sort === "COMPLETADOS") return Number(right.status === "FINISHED" || right.status === "PUBLISHED") - Number(left.status === "FINISHED" || left.status === "PUBLISHED");
      return Number(Boolean(right.image)) - Number(Boolean(left.image));
    });
  }, [category, projects, query, sort]);

  return (
    <div className="rounded-[22px] border border-white/10 bg-[#0e1a26]/58 p-4 shadow-[0_22px_70px_rgba(0,0,0,0.24)] sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex max-w-3xl flex-wrap gap-2">
          {["TODOS", ...categories].map((item) => (
            <button key={item} type="button" onClick={() => setCategory(item)} className={category === item ? "rounded-[9px] bg-[#4374ba] px-4 py-2.5 text-xs font-black text-white shadow-[0_10px_24px_rgba(67,116,186,0.28)]" : "rounded-[9px] border border-white/12 bg-[#07111f]/50 px-4 py-2.5 text-xs font-black text-white/60 transition hover:border-[#488ac9]/45 hover:text-white"}>
              {item === "TODOS" ? "Todos los proyectos" : item}
            </button>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_180px_auto]">
          <label className="flex h-11 items-center gap-2 rounded-[9px] border border-white/12 bg-[#07111f]/60 px-3 text-white/60 focus-within:border-[#488ac9]">
            <Search className="h-4 w-4 shrink-0" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar proyecto" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
          </label>
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="h-11 rounded-[9px] border border-white/12 bg-[#07111f] px-3 text-sm font-bold text-white outline-none focus:border-[#488ac9]">
            <option value="RELEVANTES">Más relevantes</option>
            <option value="COMPLETADOS">Completados primero</option>
            <option value="TITULO">Por título</option>
          </select>
          <div className="grid grid-cols-2 overflow-hidden rounded-[9px] border border-white/12">
            <button type="button" onClick={() => setView("grid")} aria-label="Ver proyectos en cuadrícula" aria-pressed={view === "grid"} className={view === "grid" ? "grid h-11 w-11 place-items-center bg-[#4374ba] text-white" : "grid h-11 w-11 place-items-center bg-[#07111f]/60 text-white/50 hover:text-white"}><Grid2X2 className="h-4 w-4" /></button>
            <button type="button" onClick={() => setView("list")} aria-label="Ver proyectos en lista" aria-pressed={view === "list"} className={view === "list" ? "grid h-11 w-11 place-items-center bg-[#4374ba] text-white" : "grid h-11 w-11 place-items-center bg-[#07111f]/60 text-white/50 hover:text-white"}><List className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {visibleProjects.length ? (
        <div className={view === "grid" ? "mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3" : "mt-6 grid gap-3"}>
          {visibleProjects.map((project) => <ProjectResult key={project.id} project={project} view={view} />)}
        </div>
      ) : (
        <div className="mt-6 grid min-h-[310px] place-items-center rounded-[18px] border border-dashed border-[#488ac9]/30 bg-[#07111f]/52 px-6 py-10 text-center">
          <div className="max-w-md">
            <span className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-[#488ac9]/30 bg-[#4374ba]/10 text-[#488ac9]"><EyeOff className="h-8 w-8" /></span>
            <h2 className="mt-5 font-display text-2xl font-black text-white">{projects.length ? "No encontramos coincidencias" : "Sin proyectos públicos"}</h2>
            <p className="mt-3 text-sm leading-6 text-white/50">{projects.length ? "Prueba otra búsqueda o limpia la categoría seleccionada." : "Los proyectos aparecerán cuando el profesional active su visibilidad pública."}</p>
            {projects.length ? <button type="button" onClick={() => { setQuery(""); setCategory("TODOS"); }} className="mt-5 rounded-[9px] border border-[#488ac9]/40 px-5 py-3 text-sm font-black text-[#9fc4ff]">Limpiar filtros</button> : <Link href={`/cuenta?callbackUrl=${encodeURIComponent(`/cv/${username}/proyectos`)}`} prefetch={false} className="mt-5 inline-flex items-center gap-2 rounded-[9px] bg-[#4374ba] px-5 py-3 text-sm font-black text-white">Solicitar acceso <ArrowRight className="h-4 w-4" /></Link>}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectResult({ project, view }: { project: ProjectSnapshot; view: "grid" | "list" }) {
  const href = hrefForProject(project);
  const content = (
    <>
      <div className={view === "grid" ? "relative h-48 overflow-hidden bg-[#0e1a26]" : "relative h-44 overflow-hidden bg-[#0e1a26] sm:h-full"}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {project.image ? <img src={project.image} alt={project.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" /> : <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_45%_35%,rgba(72,138,201,0.2),transparent_30%),linear-gradient(135deg,#0e1a26,#07111f)]"><Grid2X2 className="h-9 w-9 text-[#488ac9]" /></div>}
        <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-[#07111f]/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#9fc4ff] backdrop-blur">{STATUS_LABEL[project.status] || "Proyecto"}</span>
      </div>
      <div className="p-5">
        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#25c0d5]">{project.category || "Proyecto profesional"}</p>
        <h3 className="mt-2 font-display text-xl font-black text-white">{project.title}</h3>
        <p className="mt-2 text-sm font-semibold text-white/40">{project.clientName || "Cliente no público"}</p>
        {project.location ? <p className="mt-3 inline-flex items-center gap-2 text-xs text-white/40"><MapPin className="h-3.5 w-3.5 text-[#488ac9]" />{project.location}</p> : null}
        <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-[#9fc4ff] transition group-hover:text-[#25c0d5]">{href ? "Ver proyecto" : "Detalle no público"}{href ? <ArrowRight className="h-4 w-4" /> : null}</span>
      </div>
    </>
  );

  const className = view === "grid"
    ? "group block overflow-hidden rounded-[16px] border border-white/10 bg-[#07111f]/72 transition hover:-translate-y-1 hover:border-[#488ac9]/48"
    : "group grid overflow-hidden rounded-[16px] border border-white/10 bg-[#07111f]/72 transition hover:border-[#488ac9]/48 sm:grid-cols-[240px_1fr]";

  if (!href) return <article className={className}>{content}</article>;
  if (/^https?:\/\//i.test(href)) return <a href={href} target="_blank" rel="noreferrer" className={className}>{content}</a>;
  return <Link href={href} className={className}>{content}</Link>;
}
