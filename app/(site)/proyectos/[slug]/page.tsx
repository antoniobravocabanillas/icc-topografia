import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, Clock3, Layers3, MapPin, Pickaxe, Ruler, ShieldCheck } from "lucide-react";
import { ConversionBand } from "@/components/conversion-band";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { createMetadata } from "@/lib/seo";

type ProjectPageProps = { params: Promise<{ slug: string }> };

const statusLabels: Record<string, string> = {
  PLANNING: "En planificacion",
  IN_PROGRESS: "En ejecucion",
  FINISHED: "Finalizado",
  PUBLISHED: "Publicado",
  ARCHIVED: "Archivado"
};

const statusDescriptions: Record<string, string> = {
  PLANNING: "Alcance tecnico, equipo y cronograma en definicion.",
  IN_PROGRESS: "Trabajo activo con control de campo, seguimiento y entregables en curso.",
  FINISHED: "Intervencion culminada con documentacion tecnica disponible.",
  PUBLISHED: "Caso publicado como referencia tecnica de ICC.",
  ARCHIVED: "Proyecto archivado para consulta historica."
};

const statusStyles: Record<string, string> = {
  PLANNING: "border-amber-300 bg-amber-50 text-amber-900",
  IN_PROGRESS: "border-sky-300 bg-sky-50 text-sky-900",
  FINISHED: "border-emerald-300 bg-emerald-50 text-emerald-900",
  PUBLISHED: "border-emerald-300 bg-emerald-50 text-emerald-900",
  ARCHIVED: "border-slate-300 bg-slate-50 text-slate-700"
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project || !project.isPublic) return {};
  return createMetadata({
    title: project.title,
    description: project.summary,
    path: `/proyectos/${project.slug}`
  });
}

export default async function ProjectDetailPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = await prisma.project.findUnique({
    where: { slug },
    include: {
      images: { orderBy: { position: "asc" } },
      members: { include: { staffProfile: true } },
      progress: { orderBy: { createdAt: "desc" } }
    }
  });
  if (!project || !project.isPublic) notFound();
  const heroImage = project.images[0];
  const galleryImages = project.images.slice(1);
  const statusLabel = statusLabels[project.status] || project.status;

  return (
    <>
      <article className="relative isolate overflow-hidden bg-[#03111D] text-white">
        {heroImage ? (
          <Image src={heroImage.url} alt={heroImage.alt || project.title} fill priority sizes="100vw" className="object-cover opacity-42" unoptimized />
        ) : (
          <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(36,200,238,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(36,200,238,0.11)_1px,transparent_1px)] [background-size:44px_44px]" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,17,29,0.98)_0%,rgba(3,17,29,0.88)_42%,rgba(3,17,29,0.34)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#24C8EE]/70 to-transparent" />
        <section className="container relative grid min-h-[680px] items-center gap-12 py-16 lg:grid-cols-[minmax(0,1fr)_440px]">
          <div className="max-w-4xl">
            <div className="flex flex-wrap gap-3">
              <Badge className="bg-white text-[#063D63] hover:bg-white">{project.category || "Proyecto tecnico"}</Badge>
              <span className={`rounded-md border px-3 py-1 text-xs font-semibold ${statusStyles[project.status] || "border-white/25 bg-white text-[#063D63]"}`}>
                {statusLabel}
              </span>
            </div>
            <p className="mt-7 text-sm font-semibold uppercase tracking-[0.18em] text-[#7DE4FF]">Caso tecnico ICC</p>
            <h1 className="mt-4 font-display text-5xl font-bold leading-[0.95] md:text-7xl">{project.title}</h1>
            <p className="mt-6 max-w-3xl text-xl leading-9 text-white/78">{project.summary}</p>
            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              <HeroFact icon={MapPin} label="Ubicacion" value={project.location || "Por confirmar"} />
              <HeroFact icon={Pickaxe} label="Estado" value={statusLabel} />
              <HeroFact icon={Layers3} label="Rubro" value={project.category || "Tecnico"} />
            </div>
          </div>
          <Card className="overflow-hidden border-white/16 bg-white/[0.08] text-white shadow-2xl backdrop-blur-xl">
            <CardHeader>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7DE4FF]">Resultado operativo</p>
              <CardTitle className="mt-2 text-3xl leading-tight">{project.results || "Evidencia tecnica para decisiones de obra"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 text-sm leading-7 text-white/74">
              <p>{statusDescriptions[project.status] || "Seguimiento tecnico y entregables organizados por ICC."}</p>
              <div className="grid gap-3 border-y border-white/14 py-5">
                <MiniMetric icon={Ruler} label="Control" value="Mediciones trazables" />
                <MiniMetric icon={ShieldCheck} label="QA/QC" value="Entregables revisables" />
                <MiniMetric icon={Clock3} label="Avance" value={statusLabel} />
              </div>
              <div className="rounded-md border border-white/12 bg-white/[0.055] p-4">
                <p className="text-xs font-semibold uppercase text-white/45">Valor para el cliente</p>
                <p className="mt-2 text-base font-semibold leading-7 text-white">Menos incertidumbre en campo, decisiones mas rapidas y evidencia tecnica lista para coordinacion de obra.</p>
              </div>
              <Button asChild size="lg" className="w-full">
                <Link href={`/cotizacion?context=proyecto:${project.slug}`}>
                  Cotizar proyecto similar <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </article>

      <section className="bg-[linear-gradient(180deg,#F7FBFD_0%,#FFFFFF_36%,#F7FBFD_100%)]">
      <div className="container grid gap-10 py-16 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-8">
          {galleryImages.length ? (
            <section>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="font-display text-2xl font-bold">Evidencia visual</h2>
                <Badge variant="outline">{galleryImages.length} imagenes</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {galleryImages.map((image, index) => (
                  <div key={image.id} className={index === 0 ? "relative aspect-[16/10] overflow-hidden rounded-lg border bg-muted shadow-technical md:col-span-2" : "relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted shadow-sm"}>
                    <Image src={image.url} alt={image.alt || project.title} fill sizes="(max-width: 768px) 100vw, 60vw" className="object-cover" unoptimized />
                  </div>
                ))}
              </div>
            </section>
          ) : heroImage ? (
            <section>
              <h2 className="mb-4 font-display text-2xl font-bold">Evidencia visual</h2>
              <div className="relative aspect-[16/9] overflow-hidden rounded-lg border bg-muted shadow-technical">
                <Image src={heroImage.url} alt={heroImage.alt || project.title} fill sizes="(max-width: 768px) 100vw, 60vw" className="object-cover" unoptimized />
              </div>
            </section>
          ) : (
            <div className="rounded-lg border bg-muted/40 p-10 text-muted-foreground">Galeria pendiente de carga desde admin.</div>
          )}

          <div className="grid gap-5 md:grid-cols-3">
            <InsightCard title="Reto" body={project.challenge || "Condiciones de campo, coordinacion operativa y tolerancias tecnicas controladas por el equipo ICC."} />
            <InsightCard title="Solucion" body={project.solution || "Metodologia de levantamiento, validacion y seguimiento adaptada al alcance del proyecto."} />
            <InsightCard title="Resultado" body={project.results || "Entregables auditables para controlar avances y sostener decisiones tecnicas."} />
          </div>

          <section className="rounded-lg border bg-background p-6 shadow-sm md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Contexto tecnico</p>
            <Section title="Descripcion" body={project.description} />
          </section>
          {project.progress.length ? (
            <section className="rounded-lg border bg-background p-6 shadow-sm md:p-8">
              <h2 className="font-display text-3xl font-bold">Avance documentado</h2>
              <div className="mt-5 space-y-3">
                {project.progress.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="rounded-lg border bg-background p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <CheckCircle2 className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-semibold">{entry.title}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{entry.body}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{entry.milestone || "Avance tecnico"} - {entry.createdAt.toLocaleDateString("es-PE")}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Card className="overflow-hidden">
            <CardHeader className="bg-[#063D63] text-white">
              <p className="text-xs font-semibold uppercase text-[#7DE4FF]">Ficha del proyecto</p>
              <CardTitle>{statusLabel}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <FactRow label="Rubro" value={project.category || "Proyecto tecnico"} />
              <FactRow label="Cliente" value={project.clientName || "Cliente no publicado"} />
              <FactRow label="Ubicacion" value={project.location || "Por confirmar"} />
              <FactRow label="Estado" value={statusLabel} />
            </CardContent>
          </Card>
          <Card className="border-primary/20 bg-[#03111D] text-white">
            <CardHeader>
              <p className="text-xs font-semibold uppercase text-[#7DE4FF]">Siguiente paso</p>
              <CardTitle>Replica este nivel de control en tu obra</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-white/72">
              <p>ICC puede convertir tu alcance en una ruta de medicion, control y entregables para decisiones ejecutivas.</p>
              <Button asChild className="w-full">
                <Link href={`/cotizacion?context=proyecto:${project.slug}`}>
                  Solicitar evaluacion <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Servicios aplicados</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(project.servicesApplied.length ? project.servicesApplied : ["Topografia", "Control tecnico"]).map((service) => (
                <Badge key={service} variant="outline">{service}</Badge>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Equipo asignado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {project.members.map((member) => (
                <div key={member.id} className="rounded-md border p-3">
                  <p className="font-semibold">{member.staffProfile.displayName}</p>
                  <p className="text-xs text-muted-foreground">{member.role}</p>
                </div>
              ))}
              {!project.members.length ? <p className="text-sm text-muted-foreground">Equipo interno no publicado.</p> : null}
            </CardContent>
          </Card>
        </aside>
      </div>
      </section>
      <ConversionBand />
    </>
  );
}

function HeroFact({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/14 bg-white/[0.075] p-4 backdrop-blur">
      <Icon className="h-5 w-5 text-[#24C8EE]" />
      <p className="mt-3 text-xs font-semibold uppercase text-white/50">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function MiniMetric({ icon: Icon, label, value }: { icon: typeof Ruler; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 text-[#24C8EE]" />
      <div>
        <p className="text-xs font-semibold uppercase text-white/45">{label}</p>
        <p className="text-sm text-white">{value}</p>
      </div>
    </div>
  );
}

function InsightCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border bg-background p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase text-primary">{title}</p>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{body}</p>
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b pb-3 last:border-b-0 last:pb-0">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function Section({ title, body }: { title: string; body?: string | null }) {
  if (!body) return null;
  return (
    <section>
      <h2 className="font-display text-3xl font-bold">{title}</h2>
      <p className="mt-4 leading-8 text-muted-foreground">{body}</p>
    </section>
  );
}
