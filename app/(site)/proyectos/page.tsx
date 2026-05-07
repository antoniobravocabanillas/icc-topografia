import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BarChart3, CheckCircle2, Crosshair, FileCheck2, MapPinned } from "lucide-react";
import { ProjectSearchPreview } from "@/components/projects/project-search-preview";
import { ScrollReveal } from "@/components/scroll-reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { projects } from "@/lib/content/site";
import { prisma } from "@/lib/prisma";
import { projectStatusLabel, projectStatusLabels } from "@/lib/project-status";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Proyectos y casos de exito",
  description: "Casos de exito en topografia, georreferenciacion y control geometrico.",
  path: "/proyectos"
});

const projectIcons = [MapPinned, Crosshair, BarChart3, FileCheck2];
const PROJECTS_PER_PAGE = 8;

type ProjectsPageProps = {
  searchParams?: Promise<{
    rubro?: string;
    estado?: string;
    q?: string;
    pagina?: string;
  }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const resolvedSearchParams = await searchParams;
  const dbProjects = await prisma.project.findMany({
    where: { isPublic: true },
    include: { images: { orderBy: { position: "asc" }, take: 1 } },
    orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }]
  });
  const allProjectItems = dbProjects.length
    ? dbProjects.map((project) => ({
        id: project.id,
        title: project.title,
        summary: project.summary,
        sector: project.category || "Proyecto tecnico",
        metric: project.results || "Entregables auditables",
        slug: project.slug,
        status: project.status,
        location: project.location,
        image: project.images[0]?.url,
        isFeatured: project.isFeatured
      }))
    : projects.map((project, index) => ({
        id: project.title,
        ...project,
        slug: "",
        status: index === 0 ? "IN_PROGRESS" : "FINISHED",
        location: "Peru",
        image: "",
        isFeatured: index === 0
      }));
  const rubros = Array.from(new Set(allProjectItems.map((project) => project.sector))).sort();
  const estados = Array.from(new Set(allProjectItems.map((project) => project.status))).sort();
  const selectedRubro = resolvedSearchParams?.rubro || "todos";
  const selectedEstado = resolvedSearchParams?.estado || "todos";
  const query = (resolvedSearchParams?.q || "").trim();
  const normalizedQuery = normalizeSearchText(query);
  const projectItems = allProjectItems.filter((project) => {
    const rubroMatch = selectedRubro === "todos" || project.sector === selectedRubro;
    const estadoMatch = selectedEstado === "todos" || project.status === selectedEstado;
    const searchable = normalizeSearchText([project.title, project.summary, project.sector, project.metric, project.location].join(" "));
    const queryMatch = !normalizedQuery || searchable.includes(normalizedQuery);
    return rubroMatch && estadoMatch && queryMatch;
  });
  const requestedPage = Number(resolvedSearchParams?.pagina || "1");
  const totalPages = Math.max(1, Math.ceil(projectItems.length / PROJECTS_PER_PAGE));
  const currentPage = Number.isFinite(requestedPage) ? Math.min(Math.max(1, Math.trunc(requestedPage)), totalPages) : 1;
  const startIndex = (currentPage - 1) * PROJECTS_PER_PAGE;
  const paginatedProjectItems = projectItems.slice(startIndex, startIndex + PROJECTS_PER_PAGE);
  const resultStart = projectItems.length ? startIndex + 1 : 0;
  const resultEnd = Math.min(startIndex + paginatedProjectItems.length, projectItems.length);
  const deliveredCount = allProjectItems.filter((project) => ["FINISHED", "PUBLISHED", "ARCHIVED"].includes(project.status)).length;
  const hasActiveFilters = selectedRubro !== "todos" || selectedEstado !== "todos" || Boolean(query);
  const searchPreviewItems = allProjectItems
    .filter((project) => project.slug)
    .map((project) => ({
      title: project.title,
      slug: project.slug,
      sector: project.sector,
      location: project.location || "",
      summary: project.summary,
      metric: project.metric,
      statusLabel: projectStatusLabel(project.status)
    }));

  return (
    <>
      <ProjectsHero projectCount={allProjectItems.length} rubroCount={rubros.length} activeCount={allProjectItems.filter((project) => project.status === "IN_PROGRESS").length} />

      <section className="relative overflow-hidden bg-[#03111D] py-20 text-white">
        <div className="absolute inset-0 pointer-events-none opacity-[0.14] [background-image:linear-gradient(rgba(36,200,238,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(11,131,196,0.14)_1px,transparent_1px)] [background-size:38px_38px]" />
        <div className="container relative">
          <div className="grid gap-8 border-b border-white/[0.08] pb-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <ScrollReveal>
            <p className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.32em] text-[#7DE4FF] before:h-px before:w-10 before:bg-gradient-to-r before:from-[#24C8EE] before:to-transparent">ICC Topografia - Portafolio</p>
            <h2 className="mt-5 max-w-3xl font-display text-4xl font-bold leading-tight md:text-5xl">Proyectos de alta precision tecnica y resultado visible</h2>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-white/64 md:text-base">Obras en ejecucion, casos culminados y frentes tecnicos separados por rubro para ubicar referencias comparables con rapidez y criterio profesional.</p>
          </ScrollReveal>
          <ScrollReveal delay={80}>
            <div className="grid gap-5 rounded-sm border border-white/[0.08] bg-[#161C25]/80 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
              <ProjectSearchPreview items={searchPreviewItems} query={query} selectedRubro={selectedRubro} selectedEstado={selectedEstado} />
              <div className="grid gap-5 sm:grid-cols-2">
                <FilterGroup title="Rubro" items={["todos", ...rubros]} selected={selectedRubro} param="rubro" params={{ rubro: selectedRubro, estado: selectedEstado, q: query }} />
                <FilterGroup title="Estado" items={["todos", ...estados]} selected={selectedEstado} param="estado" params={{ rubro: selectedRubro, estado: selectedEstado, q: query }} formatter={(value) => value === "todos" ? "Todos" : projectStatusLabels[value] || value} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
                <p className="text-xs text-white/56">
                  Mostrando <span className="font-semibold text-white">{resultStart}-{resultEnd}</span> de <span className="font-semibold text-white">{projectItems.length}</span> proyectos publicados.
                </p>
                {hasActiveFilters ? (
                  <Link href="/proyectos" className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7DE4FF] transition hover:text-white">
                    Limpiar filtros
                  </Link>
                ) : null}
              </div>
            </div>
          </ScrollReveal>
          </div>

        <div className="mt-10 grid overflow-hidden border border-white/[0.08] bg-white/[0.07] md:grid-cols-2 xl:grid-cols-3">
          {paginatedProjectItems.map((project, index) => {
            const projectNumber = startIndex + index + 1;
            const Icon = projectIcons[projectNumber % projectIcons.length];
            const resultItems = parseProjectResults(project.metric);
            const isFeaturedCard = currentPage === 1 && index === 0 && paginatedProjectItems.length > 1;
            return (
              <ScrollReveal key={project.title} delay={index * 70} className={isFeaturedCard ? "h-full xl:col-span-2" : "h-full"}>
                <Link href={project.slug ? `/proyectos/${project.slug}` : "/contacto"} className="group block h-full">
                <article className={isFeaturedCard ? "grid h-full overflow-hidden bg-[#061827] transition duration-500 hover:z-10 hover:-translate-y-1 hover:shadow-[0_32px_80px_rgba(0,34,54,0.62)] motion-reduce:transform-none lg:grid-cols-[52%_48%]" : "flex h-full flex-col overflow-hidden bg-[#061827] transition duration-500 hover:z-10 hover:-translate-y-1 hover:shadow-[0_32px_80px_rgba(0,34,54,0.62)] motion-reduce:transform-none"}>
                  <div className={isFeaturedCard ? "relative min-h-[280px] overflow-hidden bg-[#061827] lg:min-h-full" : "relative h-[240px] overflow-hidden bg-[#061827]"}>
                    {project.image ? (
                      <Image src={project.image} alt={project.title} fill sizes={isFeaturedCard ? "(max-width: 1024px) 100vw, 42vw" : "(max-width: 768px) 100vw, 33vw"} className="object-cover brightness-[0.82] saturate-[0.85] transition duration-700 group-hover:scale-[1.06]" unoptimized />
                    ) : (
                      <div className="absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(36,200,238,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(11,131,196,0.12)_1px,transparent_1px)] [background-size:28px_28px]" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#061827] via-[#061827]/42 to-transparent" />
                    <div className="absolute left-4 right-4 top-4 z-10 flex items-start justify-between gap-3">
                      <span className={statusBadgeClass(project.status)}>
                        {projectStatusLabel(project.status)}
                      </span>
                      {project.isFeatured ? <span className="rounded-sm border border-[#24C8EE]/45 bg-[#24C8EE]/16 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#7DE4FF] backdrop-blur">Destacado</span> : null}
                    </div>
                    <div className="absolute bottom-4 left-4 right-4 z-10">
                      <p className="text-[9px] font-medium uppercase tracking-[0.18em] text-white/55">{project.sector}</p>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="h-px w-0 bg-gradient-to-r from-[#0B83C4] to-[#24C8EE] transition-all duration-500 group-hover:w-full" />
                    <div className={isFeaturedCard ? "flex-1 p-7 md:p-9" : "flex-1 p-7"}>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#7DE4FF]/70">PRJ - {String(projectNumber).padStart(3, "0")}</div>
                      <div className="mt-3 flex items-start gap-4">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-[#24C8EE]/20 bg-[#24C8EE]/8 text-[#24C8EE]">
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <h3 className={isFeaturedCard ? "font-display text-3xl font-bold leading-tight text-white md:text-4xl" : "font-display text-2xl font-bold leading-tight text-white"}>{project.title}</h3>
                          <p className="mt-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8FA3B8]/80">
                            <MapPinned className="h-3 w-3 text-[#24C8EE]" />
                            {project.location || "Ubicacion por confirmar"}
                          </p>
                        </div>
                      </div>
                      <p className="mt-5 text-sm leading-7 text-white/66">{project.summary}</p>
                    </div>
                    <div className={isFeaturedCard ? "border-t border-white/[0.08] px-7 py-6 md:px-9" : "border-t border-white/[0.08] px-7 py-6"}>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.28em] text-[#7DE4FF]/70">Avance / resultado</p>
                      <div className={isFeaturedCard ? "mt-4 grid gap-3 sm:grid-cols-2" : "mt-4 grid gap-3"}>
                        {resultItems.map((item) => (
                          <div key={item} className="flex items-start gap-3">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#24C8EE]" />
                            <span className="text-sm font-medium leading-6 text-white/82">{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className={isFeaturedCard ? "mt-auto px-7 pb-7 md:px-9 md:pb-9" : "mt-auto px-7 pb-7"}>
                      <span className="inline-flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7DE4FF] opacity-75 transition duration-300 group-hover:translate-x-1 group-hover:opacity-100">
                        Ver proyecto completo <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </article>
                </Link>
              </ScrollReveal>
            );
          })}
        </div>
        {!projectItems.length ? (
          <div className="mt-10 rounded-sm border border-white/[0.08] bg-[#061827] p-8 text-white/60">No hay proyectos publicados con esos filtros. Ajusta el rubro, estado o busqueda para ver mas referencias.</div>
        ) : null}

        {totalPages > 1 ? (
          <Pagination currentPage={currentPage} totalPages={totalPages} params={{ rubro: selectedRubro, estado: selectedEstado, q: query }} />
        ) : null}

        <div className="grid border-x border-b border-white/[0.08] bg-[#061827] md:grid-cols-4">
          <PortfolioStat value={`${allProjectItems.length || 1}+`} label="referencias tecnicas" />
          <PortfolioStat value={`${allProjectItems.filter((project) => project.status === "IN_PROGRESS").length}`} label="frentes en ejecucion" />
          <PortfolioStat value={`${rubros.length || 1}`} label="rubros organizados" />
          <PortfolioStat value={`${deliveredCount}`} label="casos con entregables" />
        </div>
        </div>
      </section>

      <section className="border-y bg-[#061827] py-16 text-white">
        <div className="container flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-semibold uppercase text-[#7DE4FF]">Propuesta consultiva</p>
            <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold">Convirtamos tu alcance en un plan de medicion, entregables y soporte</h2>
          </div>
          <Link href="/contacto" className="inline-flex items-center gap-2 font-semibold text-[#7DE4FF]">
            Conversar con ICC <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}

function parseProjectResults(metric: string) {
  const normalized = metric.replace(/\r/g, "\n").trim();
  const directParts = normalized
    .split(/\n|;|\u2022/)
    .map((item) => item.trim())
    .filter(Boolean);
  const parts = directParts.length > 1
    ? directParts
    : normalized
        .split(/(?=\b(?:Levantamiento|Control|Replanteo|Reduccion|Optimizacion|Planos|Reportes|Soporte|Monitoreo|Generacion|Verificacion)\b)/)
        .map((item) => item.trim())
        .filter(Boolean);

  return (parts.length ? parts : ["Evidencia tecnica disponible"])
    .map((item) => item.replace(/[.,;]+$/, ""))
    .slice(0, 4);
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function projectsHref(params: { rubro?: string; estado?: string; q?: string; pagina?: number | string }) {
  const search = new URLSearchParams();
  if (params.rubro && params.rubro !== "todos") search.set("rubro", params.rubro);
  if (params.estado && params.estado !== "todos") search.set("estado", params.estado);
  if (params.q) search.set("q", params.q);
  if (params.pagina && Number(params.pagina) > 1) search.set("pagina", String(params.pagina));
  const queryString = search.toString();
  return queryString ? `/proyectos?${queryString}` : "/proyectos";
}

function statusBadgeClass(status: string) {
  if (status === "IN_PROGRESS") {
    return "rounded-sm border border-[#1E90C8]/50 bg-[#1E90C8]/20 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#7EC8F0] backdrop-blur";
  }
  if (["FINISHED", "PUBLISHED", "ARCHIVED"].includes(status)) {
    return "rounded-sm border border-emerald-400/35 bg-emerald-400/14 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-200 backdrop-blur";
  }
  return "rounded-sm border border-[#24C8EE]/40 bg-[#24C8EE]/14 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#7DE4FF] backdrop-blur";
}

function PortfolioStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-b border-white/[0.08] px-6 py-8 text-center md:border-b-0 md:border-r md:last:border-r-0">
      <span className="font-display text-4xl font-bold text-[#24C8EE]">{value}</span>
      <span className="mt-2 block text-[9px] font-semibold uppercase tracking-[0.22em] text-white/45">{label}</span>
    </div>
  );
}

function ProjectsHero({ projectCount, rubroCount, activeCount }: { projectCount: number; rubroCount: number; activeCount: number }) {
  return (
    <section className="relative isolate overflow-hidden border-b bg-[#03111D] text-white">
      <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(36,200,238,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(36,200,238,0.11)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#24C8EE]/70 to-transparent" />
      <div className="container relative grid min-h-[560px] items-center gap-12 py-16 lg:grid-cols-[minmax(0,1fr)_520px]">
        <ScrollReveal>
          <div className="max-w-4xl">
            <Badge className="bg-white text-[#063D63] hover:bg-white">Portafolio ICC</Badge>
            <p className="mt-7 text-sm font-semibold uppercase tracking-[0.18em] text-[#7DE4FF]">Topografia para decisiones de obra</p>
            <h1 className="mt-4 font-display text-5xl font-bold leading-[0.96] text-white md:text-7xl">
              Casos tecnicos con evidencia, control y trazabilidad
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-white/72">
              Una seleccion de trabajos donde el levantamiento, replanteo, nivelacion y control topografico ayudan a reducir incertidumbre, sostener expedientes y acelerar coordinaciones en campo.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/cotizacion">Cotizar proyecto <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/35 bg-white/10 text-white hover:bg-white/18">
                <Link href="/servicios">Ver servicios</Link>
              </Button>
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={120}>
          <div className="relative overflow-hidden rounded-lg border border-white/14 bg-white/[0.07] p-6 shadow-2xl backdrop-blur-xl">
            <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(36,200,238,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(36,200,238,0.12)_1px,transparent_1px)] [background-size:24px_24px]" />
            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7DE4FF]">Lectura ejecutiva</p>
              <div className="mt-6 grid gap-3">
                <HeroStat value={`${projectCount || 1}+`} label="casos y referencias publicadas" />
                <HeroStat value={`${rubroCount || 1}`} label="rubros tecnicos organizados" />
                <HeroStat value={`${activeCount}`} label="trabajos de campo en ejecucion" />
              </div>
              <div className="mt-6 rounded-md border border-white/12 bg-white/[0.055] p-4">
                <p className="text-xs font-semibold uppercase text-white/45">Como leer el portafolio</p>
                <p className="mt-2 text-sm leading-6 text-white/78">Filtra por rubro y estado para ubicar referencias comparables a tu proyecto antes de solicitar una evaluacion tecnica.</p>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-center gap-4 border-b border-white/14 pb-4 last:border-b-0 last:pb-0">
      <span className="font-display text-3xl font-bold text-[#24C8EE]">{value}</span>
      <span className="text-sm leading-5 text-white/72">{label}</span>
    </div>
  );
}

function FilterGroup({
  title,
  items,
  selected,
  param,
  params,
  formatter
}: {
  title: string;
  items: string[];
  selected: string;
  param: "rubro" | "estado";
  params: { rubro: string; estado: string; q: string };
  formatter?: (value: string) => string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => {
          const href = projectsHref({ ...params, [param]: item, pagina: 1 });
          return (
            <Link key={item} href={href} className={item === selected ? "rounded-sm border border-[#24C8EE]/55 bg-[#24C8EE]/16 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7DE4FF]" : "rounded-sm border border-white/[0.08] bg-transparent px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/58 transition hover:border-[#24C8EE]/45 hover:text-[#7DE4FF]"}>
              {formatter ? formatter(item) : item === "todos" ? "Todos" : item}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  params
}: {
  currentPage: number;
  totalPages: number;
  params: { rubro: string; estado: string; q: string };
}) {
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  const pages = Array.from({ length: end - start + 1 }, (_, index) => start + index);

  return (
    <nav className="mt-8 flex flex-wrap items-center justify-between gap-4 border border-white/[0.08] bg-[#061827]/80 p-4" aria-label="Paginacion de proyectos">
      <Link
        href={projectsHref({ ...params, pagina: Math.max(1, currentPage - 1) })}
        aria-disabled={currentPage === 1}
        className={currentPage === 1 ? "pointer-events-none rounded-sm border border-white/[0.08] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/25" : "rounded-sm border border-white/[0.08] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/70 transition hover:border-[#24C8EE]/45 hover:text-[#7DE4FF]"}
      >
        Anterior
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        {start > 1 ? <span className="px-2 text-white/35">...</span> : null}
        {pages.map((page) => (
          <Link
            key={page}
            href={projectsHref({ ...params, pagina: page })}
            className={page === currentPage ? "flex h-9 min-w-9 items-center justify-center rounded-sm border border-[#24C8EE]/55 bg-[#24C8EE]/16 px-3 text-sm font-bold text-[#7DE4FF]" : "flex h-9 min-w-9 items-center justify-center rounded-sm border border-white/[0.08] px-3 text-sm font-semibold text-white/62 transition hover:border-[#24C8EE]/45 hover:text-[#7DE4FF]"}
          >
            {page}
          </Link>
        ))}
        {end < totalPages ? <span className="px-2 text-white/35">...</span> : null}
      </div>
      <Link
        href={projectsHref({ ...params, pagina: Math.min(totalPages, currentPage + 1) })}
        aria-disabled={currentPage === totalPages}
        className={currentPage === totalPages ? "pointer-events-none rounded-sm border border-white/[0.08] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/25" : "rounded-sm border border-white/[0.08] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/70 transition hover:border-[#24C8EE]/45 hover:text-[#7DE4FF]"}
      >
        Siguiente
      </Link>
    </nav>
  );
}
