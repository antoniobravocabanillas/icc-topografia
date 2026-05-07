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
          <Image src={heroImage.url} alt={heroImage.alt || project.title} fill priority sizes="100vw" className="object-cover opacity-35" unoptimized />
        ) : (
          <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(36,200,238,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(36,200,238,0.11)_1px,transparent_1px)] [background-size:44px_44px]" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,17,29,0.98)_0%,rgba(3,17,29,0.86)_48%,rgba(3,17,29,0.42)_100%)]" />
        <section className="container relative grid min-h-[620px] items-center gap-10 py-16 lg:grid-cols-[1fr_430px]">
          <div>
            <div className="flex flex-wrap gap-3">
              <Badge className="bg-white text-[#063D63] hover:bg-white">{project.category || "Proyecto tecnico"}</Badge>
              <span className={`rounded-md border px-3 py-1 text-xs font-semibold ${statusStyles[project.status] || "border-white/25 bg-white text-[#063D63]"}`}>
                {statusLabel}
              </span>
            </div>
            <h1 className="mt-5 max-w-4xl font-display text-4xl font-bold leading-tight md:text-6xl">{project.title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/76">{project.summary}</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <HeroFact icon={MapPin} label="Ubicacion" value={project.location || "Por confirmar"} />
              <HeroFact icon={Pickaxe} label="Estado" value={statusLabel} />
              <HeroFact icon={Layers3} label="Rubro" value={project.category || "Tecnico"} />
            </div>
          </div>
          <Card className="border-white/14 bg-white/[0.075] text-white shadow-2xl backdrop-blur">
            <CardHeader>
              <p className="text-xs font-semibold uppercase text-[#7DE4FF]">Resultado operativo</p>
              <CardTitle className="text-2xl">{project.results || "Evidencia tecnica para decisiones de obra"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 text-sm leading-7 text-white/74">
              <p>{statusDescriptions[project.status] || "Seguimiento tecnico y entregables organizados por ICC."}</p>
              <div className="grid gap-3 border-y border-white/14 py-4">
                <MiniMetric icon={Ruler} label="Control" value="Mediciones trazables" />
                <MiniMetric icon={ShieldCheck} label="QA/QC" value="Entregables revisables" />
                <MiniMetric icon={Clock3} label="Avance" value={statusLabel} />
              </div>
              <Button asChild>
                <Link href={`/cotizacion?context=proyecto:${project.slug}`}>
                  Cotizar proyecto similar <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </article>

      <section className="container grid gap-10 py-16 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-8">
          {galleryImages.length ? (
            <section>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="font-display text-2xl font-bold">Evidencia visual</h2>
                <Badge variant="outline">{galleryImages.length} imagenes</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {galleryImages.map((image, index) => (
                  <div key={image.id} className={index === 0 ? "relative aspect-[16/10] overflow-hidden rounded-lg border bg-muted md:col-span-2" : "relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted"}>
                    <Image src={image.url} alt={image.alt || project.title} fill sizes="(max-width: 768px) 100vw, 60vw" className="object-cover" unoptimized />
                  </div>
                ))}
              </div>
            </section>
          ) : heroImage ? (
            <section>
              <h2 className="mb-4 font-display text-2xl font-bold">Evidencia visual</h2>
              <div className="relative aspect-[16/9] overflow-hidden rounded-lg border bg-muted">
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

          <Section title="Descripcion" body={project.description} />
          {project.progress.length ? (
            <section>
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
