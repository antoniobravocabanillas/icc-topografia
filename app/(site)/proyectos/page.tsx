import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BarChart3, Crosshair, FileCheck2, MapPinned } from "lucide-react";
import { ScrollReveal } from "@/components/scroll-reveal";
import { TechnicalPageHero } from "@/components/technical-page-hero";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { projects } from "@/lib/content/site";
import { prisma } from "@/lib/prisma";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Proyectos y casos de exito",
  description: "Casos de exito en topografia, georreferenciacion y control geometrico.",
  path: "/proyectos"
});

const projectIcons = [MapPinned, Crosshair, BarChart3, FileCheck2];
const statusLabels: Record<string, string> = {
  PLANNING: "En planificacion",
  IN_PROGRESS: "En ejecucion",
  FINISHED: "Finalizado",
  PUBLISHED: "Publicado",
  ARCHIVED: "Archivado"
};

const statusStyles: Record<string, string> = {
  PLANNING: "border-amber-300 bg-amber-50 text-amber-900",
  IN_PROGRESS: "border-sky-300 bg-sky-50 text-sky-900",
  FINISHED: "border-emerald-300 bg-emerald-50 text-emerald-900",
  PUBLISHED: "border-emerald-300 bg-emerald-50 text-emerald-900",
  ARCHIVED: "border-slate-300 bg-slate-50 text-slate-700"
};

type ProjectsPageProps = {
  searchParams?: Promise<{
    rubro?: string;
    estado?: string;
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
  const projectItems = allProjectItems.filter((project) => {
    const rubroMatch = selectedRubro === "todos" || project.sector === selectedRubro;
    const estadoMatch = selectedEstado === "todos" || project.status === selectedEstado;
    return rubroMatch && estadoMatch;
  });

  return (
    <>
      <TechnicalPageHero
        eyebrow="Proyectos"
        title="Casos con evidencia tecnica, metricas y valor operativo"
        description="Trabajos donde la precision topografica ayuda a controlar avance, reducir retrabajo, documentar decisiones y sostener expedientes tecnicos."
        metrics={[
          { value: "42km", label: "control vial documentado" },
          { value: "128ha", label: "georreferenciacion catastral" },
          { value: "0.8mm", label: "control dimensional" }
        ]}
        primaryCta={{ label: "Cotizar proyecto", href: "/cotizacion" }}
        secondaryCta={{ label: "Ver servicios", href: "/servicios" }}
      />

      <section className="container py-20">
        <div className="grid gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-end">
          <ScrollReveal>
            <Badge variant="outline">Portafolio tecnico</Badge>
            <h2 className="mt-4 max-w-3xl font-display text-3xl font-bold md:text-4xl">Proyectos organizados por rubro, avance y evidencia tecnica</h2>
            <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">Una vista preparada para crecer: obras en ejecucion, casos culminados y frentes tecnicos separados por sector para encontrar referencias con rapidez.</p>
          </ScrollReveal>
          <ScrollReveal delay={80}>
            <div className="grid gap-3 rounded-lg border bg-background p-4 shadow-technical sm:grid-cols-2">
              <FilterGroup title="Rubro" items={["todos", ...rubros]} selected={selectedRubro} param="rubro" otherParam="estado" otherValue={selectedEstado} />
              <FilterGroup title="Estado" items={["todos", ...estados]} selected={selectedEstado} param="estado" otherParam="rubro" otherValue={selectedRubro} formatter={(value) => value === "todos" ? "Todos" : statusLabels[value] || value} />
            </div>
          </ScrollReveal>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {projectItems.map((project, index) => {
            const Icon = projectIcons[index % projectIcons.length];
            return (
              <ScrollReveal key={project.title} delay={index * 70}>
                <Link href={project.slug ? `/proyectos/${project.slug}` : "/contacto"} className="block h-full">
                <Card className="h-full overflow-hidden transition duration-300 hover:-translate-y-1 hover:border-primary/60 hover:shadow-technical motion-reduce:transform-none">
                  <div className="relative aspect-[16/10] bg-[#061827]">
                    {project.image ? (
                      <Image src={project.image} alt={project.title} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" unoptimized />
                    ) : (
                      <div className="absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(36,200,238,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(36,200,238,0.12)_1px,transparent_1px)] [background-size:28px_28px]" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#03111D]/88 via-[#03111D]/18 to-transparent" />
                    <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
                      <span className={`rounded-md border px-3 py-1 text-xs font-semibold ${statusStyles[project.status] || "border-white/25 bg-white text-[#063D63]"}`}>
                        {statusLabels[project.status] || project.status}
                      </span>
                      {project.isFeatured ? <span className="rounded-md bg-[#24C8EE] px-3 py-1 text-xs font-semibold text-[#03111D]">Destacado</span> : null}
                    </div>
                    <div className="absolute bottom-4 left-4 right-4">
                      <Badge className="bg-white text-[#063D63] hover:bg-white">{project.sector}</Badge>
                    </div>
                  </div>
                  <CardHeader className="space-y-4">
                    <div className="flex items-start gap-4">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <CardTitle className="leading-tight">{project.title}</CardTitle>
                        <CardDescription className="mt-1">{project.location || "Ubicacion por confirmar"}</CardDescription>
                      </div>
                    </div>
                    <CardDescription>{project.summary}</CardDescription>
                  </CardHeader>
                  <CardContent className="border-t bg-muted/35 p-5">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Avance / resultado</p>
                    <p className="mt-1 line-clamp-3 text-lg font-bold leading-7 text-primary">{project.metric}</p>
                  </CardContent>
                </Card>
                </Link>
              </ScrollReveal>
            );
          })}
        </div>
        {!projectItems.length ? (
          <div className="mt-10 rounded-lg border bg-muted/35 p-8 text-muted-foreground">No hay proyectos publicados con esos filtros.</div>
        ) : null}
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

function FilterGroup({
  title,
  items,
  selected,
  param,
  otherParam,
  otherValue,
  formatter
}: {
  title: string;
  items: string[];
  selected: string;
  param: string;
  otherParam: string;
  otherValue: string;
  formatter?: (value: string) => string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => {
          const href = item === "todos" && otherValue === "todos"
            ? "/proyectos"
            : `/proyectos?${new URLSearchParams({
                [param]: item,
                [otherParam]: otherValue
              }).toString()}`;
          return (
            <Link key={item} href={href} className={item === selected ? "rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground" : "rounded-md border bg-background px-3 py-1.5 text-xs font-semibold hover:border-primary/60"}>
              {formatter ? formatter(item) : item === "todos" ? "Todos" : item}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
