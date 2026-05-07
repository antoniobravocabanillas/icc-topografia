import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, FileCheck2, Layers3, MapPinned, Radar, Ruler, ShieldCheck } from "lucide-react";
import { ContactForm } from "@/components/forms/contact-form";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { createMetadata } from "@/lib/seo";

type ServicePageProps = { params: Promise<{ slug: string }> };

type ServiceContent = {
  problem?: string;
  process?: string[];
  equipment?: string[];
  body?: string;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: ServicePageProps) {
  const { slug } = await params;
  const service = await prisma.service.findUnique({ where: { slug }, include: { categoryRef: true, subcategoryRef: true } });
  if (!service || !service.isPublished) return {};
  return createMetadata({
    title: service.seoTitle || service.title,
    description: service.metaDescription || service.summary,
    path: `/servicios/${service.slug}`
  });
}

export default async function ServicePage({ params }: ServicePageProps) {
  const { slug } = await params;
  const service = await prisma.service.findUnique({ where: { slug } });
  if (!service || !service.isPublished) notFound();

  const content = service.content as ServiceContent;
  const problem = content.problem || content.body || "Alcance tecnico editable desde el panel de administracion.";
  const process = content.process || ["Diagnostico del alcance", "Plan de campo y gabinete", "Control QA/QC", "Entrega y soporte"];
  const equipment = content.equipment || service.technologies;
  const heroHighlights = firstItems(service.benefits, service.deliverables, service.applications, ["Control operativo trazable", "Entregables tecnicos claros", "Soporte especializado ICC", "Cierre documentado"]);
  const visualGallery = [service.cover, ...service.gallery].filter(Boolean) as string[];
  const [relatedProjects, relatedServices] = await Promise.all([
    service.relatedProjects.length
      ? prisma.project.findMany({
          where: { slug: { in: service.relatedProjects }, isPublic: true },
          include: { images: { orderBy: { position: "asc" }, take: 1 } },
          take: 3
        })
      : Promise.resolve([]),
    service.relatedServices.length
      ? prisma.service.findMany({ where: { slug: { in: service.relatedServices }, isPublished: true }, take: 3 })
      : Promise.resolve([])
  ]);

  return (
    <>
      <article className="relative isolate overflow-hidden bg-[#03111D] text-white">
        {service.cover ? (
          <Image src={service.cover} alt={service.title} fill priority sizes="100vw" className="object-cover opacity-42" unoptimized />
        ) : (
          <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(36,200,238,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(36,200,238,0.11)_1px,transparent_1px)] [background-size:44px_44px]" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,17,29,0.98)_0%,rgba(3,17,29,0.86)_44%,rgba(3,17,29,0.36)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#24C8EE]/70 to-transparent" />

        <section className="container relative grid min-h-[680px] items-center gap-14 py-16 xl:grid-cols-[0.86fr_1.14fr] 2xl:grid-cols-[0.78fr_1.22fr]">
          <div className="max-w-2xl xl:-ml-6 2xl:-ml-10">
            <div className="flex flex-wrap gap-3">
              <span className="rounded-sm bg-white px-3 py-1 text-xs font-semibold text-[#063D63]">{displayCategory(service)}</span>
              <span className={serviceStatusBadgeClass(service.status)}>{serviceStatusLabel(service.status)}</span>
            </div>
            <p className="mt-7 text-sm font-semibold uppercase tracking-[0.18em] text-[#7DE4FF]">Servicio especializado ICC</p>
            <h1 className="mt-4 font-display text-5xl font-bold leading-[0.95] md:text-6xl">{service.title}</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/78">{service.headline || service.summary}</p>
            <div className="mt-10 grid gap-4 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              <HeroFact icon={Layers3} label="Categoria" value={displayCategory(service)} />
              <HeroFact icon={Ruler} label="Precision" value={service.precision || "Segun alcance"} />
              <HeroFact icon={FileCheck2} label="Entrega" value={service.formats[0] || "Informe tecnico"} />
            </div>
          </div>

          <div className="overflow-hidden rounded-sm border border-white/16 bg-white/[0.08] text-white shadow-2xl backdrop-blur-xl">
            <div className="p-6 pb-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7DE4FF]">Resultado del servicio</p>
              <h2 className="mt-2 font-display text-2xl font-bold leading-tight">Valor tecnico que recibe el cliente</h2>
            </div>
            <div className="space-y-5 p-6 pt-3 text-sm leading-7 text-white/74">
              <div className="grid gap-2 lg:grid-cols-2">
                {heroHighlights.slice(0, 8).map((item) => (
                  <div key={item} className="flex min-h-14 gap-3 rounded-md border border-white/10 bg-white/[0.045] p-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#24C8EE]" />
                    <p className="text-[13px] font-semibold leading-5 text-white/92">{item}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-5 border-y border-white/14 py-5 lg:grid-cols-[1.1fr_0.9fr]">
                <p className="text-sm leading-7">{service.summary}</p>
                <div className="grid gap-3">
                  <MiniMetric icon={MapPinned} label="Campo" value={service.applications[0] || "Alcance controlado"} />
                  <MiniMetric icon={ShieldCheck} label="QA/QC" value={service.deliverables[0] || "Entregables revisables"} />
                  <MiniMetric icon={Radar} label="Tecnologia" value={service.technologies[0] || "Equipo ICC"} />
                </div>
              </div>
              <div className="rounded-md border border-white/12 bg-white/[0.055] p-4">
                <p className="text-xs font-semibold uppercase text-white/45">Siguiente decision</p>
                <p className="mt-2 text-base font-semibold leading-7 text-white">Convertir el alcance en una ruta clara de medicion, control y entregables listos para obra o expediente tecnico.</p>
              </div>
              <Button asChild size="lg" className="w-full">
                <Link href={`/cotizacion?context=servicio:${service.slug}`}>
                  Solicitar este servicio <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </article>

      <section className="relative overflow-hidden bg-[#03111D] text-white">
        <div className="absolute inset-0 pointer-events-none opacity-[0.11] [background-image:linear-gradient(rgba(36,200,238,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(11,131,196,0.14)_1px,transparent_1px)] [background-size:38px_38px]" />
        <div className="container relative grid gap-10 py-16 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-8">
            {visualGallery.length ? (
              <section>
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#7DE4FF]">Visual del servicio</p>
                    <h2 className="mt-2 font-display text-3xl font-bold">Contexto, evidencia y aplicacion</h2>
                  </div>
                  <span className="rounded-sm border border-[#24C8EE]/35 bg-[#24C8EE]/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7DE4FF]">{visualGallery.length} recursos</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {visualGallery.slice(0, 5).map((image, index) => (
                    <div key={image} className={index === 0 ? "group relative aspect-[16/10] overflow-hidden rounded-sm border border-white/[0.1] bg-[#061827] shadow-[0_24px_80px_rgba(0,34,54,0.45)] md:col-span-2" : "group relative aspect-[4/3] overflow-hidden rounded-sm border border-white/[0.1] bg-[#061827] shadow-[0_18px_52px_rgba(0,34,54,0.3)]"}>
                      <Image src={image} alt={`${service.title} ${index + 1}`} fill sizes="(max-width: 768px) 100vw, 60vw" className="object-cover brightness-[0.88] saturate-[0.92] transition duration-700 group-hover:scale-[1.04]" unoptimized />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#03111D]/44 via-transparent to-transparent" />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="grid gap-5 md:grid-cols-3">
              <InsightCard title="Problema" body={problem} />
              <InsightCard title="Aplicacion" body={(service.applications.length ? service.applications : ["Obras, predios, infraestructura o expedientes tecnicos"]).join(". ")} />
              <InsightCard title="Entregable" body={(service.deliverables.length ? service.deliverables : ["Informe tecnico y archivos de soporte"]).join(". ")} />
            </div>

            <section className="rounded-sm border border-white/[0.08] bg-[#061827] p-6 shadow-[0_24px_80px_rgba(0,34,54,0.32)] md:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7DE4FF]">Ruta de trabajo</p>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {process.map((item, index) => (
                  <div key={item} className="rounded-sm border border-white/[0.08] bg-white/[0.045] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7DE4FF]/70">Paso {index + 1}</p>
                    <p className="mt-2 font-semibold text-white">{item}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-5 md:grid-cols-2">
              <InfoList title="Beneficios" items={service.benefits} fallback={["Menos incertidumbre tecnica", "Mejor trazabilidad de decisiones"]} />
              <InfoList title="Entregables" items={service.deliverables} fallback={["Informe tecnico", "Archivos editables segun alcance"]} />
              <InfoList title="Tecnologias" items={equipment} fallback={["GNSS", "Estacion total", "CAD/GIS"]} />
              <InfoList title="Compatibilidad" items={service.compatibility.length ? service.compatibility : service.formats} fallback={["CAD", "GIS", "PDF tecnico"]} />
            </section>

            {relatedProjects.length || relatedServices.length ? (
              <section className="rounded-sm border border-white/[0.08] bg-[#061827] p-6 shadow-[0_24px_80px_rgba(0,34,54,0.32)] md:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7DE4FF]">Relaciones</p>
                <h2 className="mt-2 font-display text-3xl font-bold">Casos y servicios conectados</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {relatedProjects.map((project) => (
                    <Link key={project.id} href={`/proyectos/${project.slug}`} className="group overflow-hidden rounded-sm border border-white/[0.08] bg-white/[0.045]">
                      {project.images[0]?.url ? <div className="relative h-36"><Image src={project.images[0].url} alt={project.title} fill sizes="360px" className="object-cover brightness-[0.82]" unoptimized /></div> : null}
                      <div className="p-4">
                        <p className="text-[10px] font-semibold uppercase text-[#7DE4FF]/70">Proyecto relacionado</p>
                        <p className="mt-1 font-semibold text-white">{project.title}</p>
                      </div>
                    </Link>
                  ))}
                  {relatedServices.map((related) => (
                    <Link key={related.id} href={`/servicios/${related.slug}`} className="rounded-sm border border-white/[0.08] bg-white/[0.045] p-4 transition hover:border-[#24C8EE]/35">
                      <p className="text-[10px] font-semibold uppercase text-[#7DE4FF]/70">Servicio relacionado</p>
                      <p className="mt-1 font-semibold text-white">{related.title}</p>
                      <p className="mt-2 text-sm leading-6 text-white/60">{related.summary}</p>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <div className="overflow-hidden rounded-sm border border-[#24C8EE]/18 bg-[#061827] shadow-[0_24px_80px_rgba(0,34,54,0.35)]">
              <div className="border-b border-white/[0.08] bg-[#063D63] p-6 text-white">
                <p className="text-xs font-semibold uppercase text-[#7DE4FF]">Ficha del servicio</p>
                <h2 className="mt-2 font-display text-2xl font-bold">{serviceStatusLabel(service.status)}</h2>
              </div>
              <div className="space-y-4 p-5">
                <FactRow label="Categoria" value={displayCategory(service)} />
                <FactRow label="Precision" value={service.precision || "Segun alcance"} />
                <FactRow label="Formatos" value={(service.formats.length ? service.formats : ["PDF", "CAD", "Informe"]).join(", ")} />
                <FactRow label="Video" value={service.video ? "Disponible" : "No publicado"} />
              </div>
            </div>
            <div className="rounded-sm border border-[#24C8EE]/18 bg-[#020D17] p-6 text-white shadow-[0_24px_80px_rgba(0,34,54,0.35)]">
              <p className="text-xs font-semibold uppercase text-[#7DE4FF]">Solicitud</p>
              <h2 className="mt-2 font-display text-2xl font-bold">Conversemos el alcance tecnico</h2>
              <div className="mt-5">
                <ContactForm intent="service" context={service.title} />
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

function firstItems(...groups: string[][]) {
  for (const group of groups) {
    if (group.length) return group;
  }
  return [];
}

function displayCategory(service: { category?: string | null; categoryRef?: { name: string } | null; subcategoryRef?: { name: string } | null }) {
  return service.subcategoryRef?.name || service.categoryRef?.name || service.category || "Servicio tecnico ICC";
}

function HeroFact({ icon: Icon, label, value }: { icon: typeof Layers3; label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/14 bg-white/[0.075] p-4 backdrop-blur">
      <Icon className="h-5 w-5 text-[#24C8EE]" />
      <p className="mt-3 text-xs font-semibold uppercase text-white/50">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function MiniMetric({ icon: Icon, label, value }: { icon: typeof MapPinned; label: string; value: string }) {
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
    <div className="rounded-sm border border-white/[0.08] bg-[#061827] p-5 shadow-[0_18px_52px_rgba(0,34,54,0.28)]">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7DE4FF]">{title}</p>
      <p className="mt-3 text-sm leading-7 text-white/66">{body}</p>
    </div>
  );
}

function InfoList({ title, items, fallback }: { title: string; items: string[]; fallback: string[] }) {
  const values = items.length ? items : fallback;
  return (
    <div className="rounded-sm border border-white/[0.08] bg-[#061827] p-6 shadow-[0_18px_52px_rgba(0,34,54,0.28)]">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7DE4FF]">{title}</p>
      <div className="mt-4 grid gap-3">
        {values.map((item) => (
          <div key={item} className="flex gap-3 text-sm leading-6 text-white/72">
            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#24C8EE]" />
            <span>{item}</span>
          </div>
        ))}
      </div>
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

function serviceStatusLabel(status: string) {
  return {
    ACTIVE: "Activo / disponible",
    FEATURED: "Servicio destacado",
    IN_DEVELOPMENT: "En desarrollo",
    PAUSED: "Pausado",
    ARCHIVED: "Archivado"
  }[status] || status;
}

function serviceStatusBadgeClass(status: string) {
  if (status === "ACTIVE" || status === "FEATURED") {
    return "rounded-sm border border-emerald-400/35 bg-emerald-400/14 px-3 py-1 text-xs font-semibold text-emerald-200 backdrop-blur";
  }
  if (status === "IN_DEVELOPMENT") {
    return "rounded-sm border border-[#1E90C8]/50 bg-[#1E90C8]/20 px-3 py-1 text-xs font-semibold text-[#7EC8F0] backdrop-blur";
  }
  return "rounded-sm border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/70 backdrop-blur";
}
