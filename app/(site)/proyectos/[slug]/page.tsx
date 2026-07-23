import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, Clock3, Layers3, MapPin, Pickaxe, Ruler, ShieldCheck } from "lucide-react";
import { ConversionBand } from "@/components/conversion-band";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { projectStatusDescriptions, projectStatusLabel } from "@/lib/project-status";
import { safeDb } from "@/lib/server/safe-db";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";
import { createMetadata } from "@/lib/seo";

type ProjectPageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: ProjectPageProps) {
  const { slug } = await params;
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  const project = await safeDb("project metadata", prisma.project.findFirst({ where: { slug, terraqoWorkspaceId } }), null);
  if (!project || !project.isPublic) return {};
  return createMetadata({
    title: project.title,
    description: project.summary,
    path: `/proyectos/${project.slug}`
  });
}

export default async function ProjectDetailPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  const project = await safeDb(
    "project detail",
    prisma.project.findFirst({
      where: { slug, terraqoWorkspaceId },
      include: {
        images: { orderBy: { position: "asc" } },
        members: { include: { staffProfile: true } },
        progress: { orderBy: { createdAt: "desc" } }
      }
    }),
    null
  );
  if (!project || !project.isPublic) notFound();
  const heroImage = project.images[0];
  const galleryImages = project.images.slice(1);
  const statusLabel = projectStatusLabel(project.status);
  const resultItems = parseResultItems(project.results);

  return (
    <>
      <article className="icc-depth-bg relative isolate overflow-hidden bg-[#03111D] text-white">
        {heroImage ? (
          <Image src={heroImage.url} alt={heroImage.alt || project.title} fill priority sizes="100vw" className="object-cover opacity-42" unoptimized />
        ) : (
          <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(36,200,238,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(36,200,238,0.11)_1px,transparent_1px)] [background-size:44px_44px]" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,17,29,0.98)_0%,rgba(3,17,29,0.88)_42%,rgba(3,17,29,0.34)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#24C8EE]/70 to-transparent" />
        <section className="container relative grid min-h-[680px] items-center gap-14 py-16 xl:grid-cols-[0.82fr_1.18fr] 2xl:grid-cols-[0.74fr_1.26fr]">
          <div className="max-w-2xl xl:-ml-6 2xl:-ml-10">
            <div className="flex flex-wrap gap-3">
              <Badge className="bg-white text-[#063D63] hover:bg-white">{project.category || "Proyecto tecnico"}</Badge>
              <span className={statusBadgeClass(project.status)}>
                {statusLabel}
              </span>
            </div>
            <p className="mt-7 text-sm font-semibold uppercase tracking-[0.18em] text-[#7DE4FF]">Caso tecnico ICC</p>
            <h1 className="icc-ambient-glow mt-4 font-display text-5xl font-bold leading-[0.95] md:text-6xl">{project.title}</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/78">{project.summary}</p>
            <div className="mt-10 grid gap-4 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              <HeroFact icon={MapPin} label="Ubicacion" value={project.location || "Por confirmar"} />
              <HeroFact icon={Pickaxe} label="Estado" value={statusLabel} />
              <HeroFact icon={Layers3} label="Rubro" value={project.category || "Tecnico"} />
            </div>
          </div>
          <div className="icc-glass overflow-hidden rounded-sm border text-white">
            <div className="p-6 pb-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7DE4FF]">Resultado operativo</p>
              <h2 className="mt-2 font-display text-2xl font-bold leading-tight">Logros tecnicos del servicio</h2>
            </div>
            <div className="space-y-5 p-6 pt-3 text-sm leading-7 text-white/74">
              <div className="grid gap-2 lg:grid-cols-2">
                {resultItems.map((item) => (
                  <div key={item} className="flex min-h-14 gap-3 rounded-md border border-white/10 bg-white/[0.045] p-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#24C8EE]" />
                    <p className="text-[13px] font-semibold leading-5 text-white/92">{item}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-5 border-y border-white/14 py-5 lg:grid-cols-[1.15fr_0.85fr]">
                <p className="text-sm leading-7">{projectStatusDescriptions[project.status] || "Seguimiento topografico y entregables organizados por ICC."}</p>
                <div className="grid gap-3">
                <MiniMetric icon={Ruler} label="Control" value="Mediciones trazables" />
                <MiniMetric icon={ShieldCheck} label="QA/QC" value="Entregables revisables" />
                <MiniMetric icon={Clock3} label="Avance" value={statusLabel} />
                </div>
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
            </div>
          </div>
        </section>
      </article>

      <section className="icc-depth-bg relative overflow-hidden bg-[#03111D] text-white">
      <div className="absolute inset-0 pointer-events-none opacity-[0.11] [background-image:linear-gradient(rgba(36,200,238,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(11,131,196,0.14)_1px,transparent_1px)] [background-size:38px_38px]" />
      <div className="container relative grid gap-10 py-16 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-8">
          {galleryImages.length ? (
            <section>
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#7DE4FF]">Evidencia de campo</p>
                  <h2 className="mt-2 font-display text-3xl font-bold">Registro visual del proyecto</h2>
                </div>
                <span className="rounded-sm border border-[#24C8EE]/35 bg-[#24C8EE]/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7DE4FF]">{galleryImages.length} imagenes</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {galleryImages.map((image, index) => (
                  <div key={image.id} className={index === 0 ? "icc-image-depth group relative aspect-[16/10] overflow-hidden rounded-sm border border-white/[0.1] bg-[#061827] shadow-[0_24px_80px_rgba(0,34,54,0.45)] md:col-span-2" : "icc-image-depth group relative aspect-[4/3] overflow-hidden rounded-sm border border-white/[0.1] bg-[#061827] shadow-[0_18px_52px_rgba(0,34,54,0.3)]"}>
                    <Image src={image.url} alt={image.alt || project.title} fill sizes="(max-width: 768px) 100vw, 60vw" className="object-cover brightness-[0.88] saturate-[0.92] transition duration-700 group-hover:scale-[1.04]" unoptimized />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#03111D]/44 via-transparent to-transparent" />
                  </div>
                ))}
              </div>
            </section>
          ) : heroImage ? (
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#7DE4FF]">Evidencia de campo</p>
              <h2 className="mb-4 mt-2 font-display text-3xl font-bold">Registro visual del proyecto</h2>
              <div className="icc-image-depth relative aspect-[16/9] overflow-hidden rounded-sm border border-white/[0.1] bg-[#061827] shadow-[0_24px_80px_rgba(0,34,54,0.45)]">
                <Image src={heroImage.url} alt={heroImage.alt || project.title} fill sizes="(max-width: 768px) 100vw, 60vw" className="object-cover brightness-[0.88] saturate-[0.92]" unoptimized />
              </div>
            </section>
          ) : (
            <div className="icc-glass rounded-sm border p-10 text-white/58">Galeria pendiente de carga desde admin.</div>
          )}

          <div className="grid gap-5 md:grid-cols-3">
            <InsightCard title="Reto" body={project.challenge || "Condiciones de campo, coordinacion operativa y tolerancias tecnicas controladas por el equipo ICC."} />
            <InsightCard title="Solucion" body={project.solution || "Metodologia de levantamiento, validacion y seguimiento adaptada al alcance del proyecto."} />
            <InsightCard title="Resultado" body={project.results || "Entregables auditables para controlar avances y sostener decisiones tecnicas."} />
          </div>

          <section className="icc-glass rounded-sm border p-6 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7DE4FF]">Contexto tecnico</p>
            <Section title="Descripcion" body={project.description} />
          </section>
          {project.progress.length ? (
            <section className="icc-glass rounded-sm border p-6 md:p-8">
              <h2 className="font-display text-3xl font-bold">Avance documentado</h2>
              <div className="mt-5 space-y-3">
                {project.progress.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="rounded-sm border border-white/[0.08] bg-white/[0.045] p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <CheckCircle2 className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-semibold">{entry.title}</p>
                        <p className="mt-1 text-sm leading-6 text-white/64">{entry.body}</p>
                        <p className="mt-2 text-xs text-white/42">{entry.milestone || "Avance tecnico"} - {entry.createdAt.toLocaleDateString("es-PE")}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <div className="icc-glass overflow-hidden rounded-sm border">
            <div className="border-b border-white/[0.08] bg-[#063D63] p-6 text-white">
              <p className="text-xs font-semibold uppercase text-[#7DE4FF]">Ficha del proyecto</p>
              <h2 className="mt-2 font-display text-2xl font-bold">{statusLabel}</h2>
            </div>
            <div className="space-y-4 p-5">
              <FactRow label="Rubro" value={project.category || "Proyecto tecnico"} />
              <FactRow label="Cliente" value={project.clientName || "Cliente no publicado"} />
              <FactRow label="Ubicacion" value={project.location || "Por confirmar"} />
              <FactRow label="Estado" value={statusLabel} />
            </div>
          </div>
          <ProjectLocationViewer
            title={project.title}
            location={project.location}
            latitude={project.latitude}
            longitude={project.longitude}
            radius={project.geofenceRadiusMeters}
          />
          <div className="icc-glass rounded-sm border p-6 text-white">
              <p className="text-xs font-semibold uppercase text-[#7DE4FF]">Siguiente paso</p>
              <h2 className="mt-2 font-display text-2xl font-bold">Replica este nivel de control en tu obra</h2>
            <div className="mt-4 space-y-4 text-sm leading-6 text-white/72">
              <p>ICC puede convertir tu alcance en una ruta de medicion, control y entregables para decisiones ejecutivas.</p>
              <Button asChild className="w-full">
                <Link href={`/cotizacion?context=proyecto:${project.slug}`}>
                  Solicitar evaluacion <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
          <div className="icc-glass rounded-sm border p-6">
            <h2 className="font-display text-2xl font-bold">Servicios aplicados</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {(project.servicesApplied.length ? project.servicesApplied : ["Topografia", "Control tecnico"]).map((service) => (
                <span key={service} className="rounded-sm border border-[#24C8EE]/25 bg-[#24C8EE]/8 px-3 py-1 text-xs font-semibold text-white/82">{service}</span>
              ))}
            </div>
          </div>
          <div className="icc-glass rounded-sm border p-6">
            <h2 className="font-display text-2xl font-bold">Equipo asignado</h2>
            <div className="mt-4 space-y-3">
              {project.members.map((member) => (
                <div key={member.id} className="rounded-sm border border-white/[0.08] bg-white/[0.045] p-3">
                  <p className="font-semibold">{member.staffProfile.displayName}</p>
                  <p className="text-xs text-white/50">{member.role}</p>
                </div>
              ))}
              {!project.members.length ? <p className="text-sm text-white/58">Equipo interno no publicado.</p> : null}
            </div>
          </div>
        </aside>
      </div>
      </section>
      <ConversionBand />
    </>
  );
}

function HeroFact({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <div className="icc-glass rounded-md border p-4">
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
    <div className="icc-glass rounded-sm border p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7DE4FF]">{title}</p>
      <p className="mt-3 text-sm leading-7 text-white/66">{body}</p>
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-white/[0.08] pb-3 last:border-b-0 last:pb-0">
      <p className="text-xs font-semibold uppercase text-white/45">{label}</p>
      <p className="mt-1 font-semibold text-white">{value}</p>
    </div>
  );
}

function ProjectLocationViewer({
  title,
  location,
  latitude,
  longitude,
  radius
}: {
  title: string;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radius?: number | null;
}) {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return null;

  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  const embedUrl = `https://maps.google.com/maps?q=${lat},${lng}&z=17&output=embed`;

  return (
    <div className="icc-glass overflow-hidden rounded-sm border">
      <div className="p-5">
        <p className="text-xs font-semibold uppercase text-[#7DE4FF]">Ubicacion verificada</p>
        <h2 className="mt-2 font-display text-2xl font-bold text-white">Plano de referencia</h2>
        <p className="mt-2 text-sm leading-6 text-white/64">{location || "Punto de trabajo configurado en Terraqo."}</p>
      </div>
      <iframe
        src={embedUrl}
        title={`Mapa de ${title}`}
        className="h-64 w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] p-4 text-sm">
        <span className="text-white/58">Radio de control: {radius || 250} m</span>
        <Link href={mapsUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#7DE4FF]">
          Abrir mapa
        </Link>
      </div>
    </div>
  );
}

function statusBadgeClass(status: string) {
  if (status === "IN_PROGRESS") {
    return "rounded-sm border border-[#1E90C8]/50 bg-[#1E90C8]/20 px-3 py-1 text-xs font-semibold text-[#7EC8F0] backdrop-blur";
  }
  if (["FINISHED", "PUBLISHED", "ARCHIVED"].includes(status)) {
    return "rounded-sm border border-emerald-400/35 bg-emerald-400/14 px-3 py-1 text-xs font-semibold text-emerald-200 backdrop-blur";
  }
  return "rounded-sm border border-[#24C8EE]/40 bg-[#24C8EE]/14 px-3 py-1 text-xs font-semibold text-[#7DE4FF] backdrop-blur";
}

function parseResultItems(results?: string | null) {
  if (!results) return ["Evidencia tecnica para decisiones de obra"];
  const explicitItems = results
    .split(/\r?\n|;|\u2022/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (explicitItems.length > 1) return explicitItems.slice(0, 8);

  const pattern = /([A-ZÁÉÍÓÚÑ][^A-ZÁÉÍÓÚÑ]{18,}?)(?=\s+[A-ZÁÉÍÓÚÑ]|$)/g;
  const inferredItems = Array.from(results.matchAll(pattern), (match) => match[1].trim())
    .filter((item) => item.length > 12);

  return (inferredItems.length ? inferredItems : [results]).slice(0, 8);
}

function Section({ title, body }: { title: string; body?: string | null }) {
  if (!body) return null;
  return (
    <section>
      <h2 className="font-display text-3xl font-bold">{title}</h2>
      <p className="mt-4 leading-8 text-white/68">{body}</p>
    </section>
  );
}
