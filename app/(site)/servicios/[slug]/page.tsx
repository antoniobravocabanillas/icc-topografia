import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, CheckCircle2, Clock3, Database, FileCheck2, Headphones, Layers3, MapPinned, Radar, ShieldCheck, Target, UsersRound } from "lucide-react";
import { ServiceEvaluationForm } from "@/components/forms/service-evaluation-form";
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
  const service = await prisma.service.findUnique({ where: { slug } });
  if (!service || !service.isPublished) return {};
  return createMetadata({
    title: service.seoTitle || service.title,
    description: service.metaDescription || service.summary,
    path: `/servicios/${service.slug}`
  });
}

export default async function ServicePage({ params }: ServicePageProps) {
  const { slug } = await params;
  const service = await prisma.service.findUnique({
    where: { slug },
    include: { categoryRef: true, subcategoryRef: true }
  });
  if (!service || !service.isPublished) notFound();

  const sectors = await prisma.sector.findMany({
    where: service.sectorSlugs.length ? { active: true, slug: { in: service.sectorSlugs } } : { active: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    take: 6
  });
  const relatedProjects = service.relatedProjects.length
    ? await prisma.project.findMany({
        where: { slug: { in: service.relatedProjects }, isPublic: true },
        include: { images: { orderBy: { position: "asc" }, take: 1 } },
        take: 3
      })
    : [];
  const relatedServices = service.relatedServices.length
    ? await prisma.service.findMany({ where: { slug: { in: service.relatedServices }, isPublished: true }, take: 3 })
    : [];

  const content = service.content as ServiceContent;
  const process = content.process || ["Diagnostico", "Planificacion", "Ejecucion", "Procesamiento", "Entrega", "Soporte"];
  const inclusions = firstItems(service.benefits, service.deliverables, ["Planificacion y coordinacion de estudios", "Levantamientos con tecnologia avanzada", "Control de calidad y validacion de datos", "Procesamiento, analisis e integracion", "Entregables tecnicos y soporte en obra", "Gestion documental y trazabilidad"]);
  const technologies = service.technologies.length ? service.technologies : content.equipment?.length ? content.equipment : ["GNSS / RTK", "Estacion total", "CAD / GIS", "BIM segun alcance"];
  const heroImage = service.cover || service.ogImage || "";

  return (
    <article className="bg-[#03111D] text-white">
      <section className="relative isolate overflow-hidden border-b border-white/[0.08]">
        {heroImage ? (
          <Image src={heroImage} alt={service.title} fill priority sizes="100vw" className="object-cover opacity-50" unoptimized />
        ) : (
          <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(36,200,238,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(36,200,238,0.11)_1px,transparent_1px)] [background-size:44px_44px]" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,17,29,0.98)_0%,rgba(3,17,29,0.76)_36%,rgba(3,17,29,0.26)_70%,rgba(3,17,29,0.92)_100%)]" />
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_62%_35%,rgba(36,200,238,0.34),transparent_30%)]" />

        <div className="relative mx-auto grid min-h-[640px] w-[min(1880px,calc(100%-44px))] gap-8 py-7 lg:grid-cols-[minmax(0,1fr)_450px] lg:items-center">
          <div>
            <nav className="mb-8 flex flex-wrap items-center gap-3 text-xs font-semibold text-white/62">
              <Link href="/">Inicio</Link><span>/</span><Link href="/servicios">Servicios</Link><span>/</span><span className="text-white">{service.title}</span>
            </nav>
            <div className="inline-flex rounded-full border border-[#24C8EE]/45 bg-[#061827]/70 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-white backdrop-blur">
              {displayCategory(service)}
            </div>
            <h1 className="mt-6 max-w-4xl font-display text-5xl font-black leading-[0.94] tracking-tight md:text-7xl">
              {splitTitle(service.title).main}<span className="block text-[#24C8EE]">{splitTitle(service.title).accent}</span>
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-white/78">{service.headline || service.summary}</p>
            <div className="mt-8 h-px max-w-2xl bg-gradient-to-r from-[#24C8EE] to-transparent" />
            <div className="mt-7 grid max-w-3xl grid-cols-2 gap-0 sm:grid-cols-5">
              {[
                [Target, "Coordinacion integral"],
                [Layers3, "Control QA/QC"],
                [Radar, "Tecnologia avanzada"],
                [Database, "Informacion confiable"],
                [ShieldCheck, "Decisiones estrategicas"]
              ].map(([Icon, label]) => (
                <div key={label as string} className="border-l border-[#24C8EE]/20 px-4 first:border-l-0 first:pl-0">
                  <Icon className="h-8 w-8 text-[#24C8EE]" />
                  <p className="mt-3 text-xs font-semibold leading-5 text-white">{label as string}</p>
                </div>
              ))}
            </div>
          </div>
          <ServiceEvaluationForm serviceTitle={service.title} sectorOptions={sectors.map((sector) => sector.name)} />
        </div>
      </section>

      <section className="mx-auto w-[min(1880px,calc(100%-44px))] py-5">
        <div className="grid overflow-hidden rounded-sm border border-[#24C8EE]/25 bg-[#061827]/90 md:grid-cols-3 xl:grid-cols-6">
          <Metric icon={BriefcaseBusiness} value="+250" label="Proyectos ejecutados" />
          <Metric icon={MapPinned} value="Cobertura nacional" label="Costa, Sierra y Selva" />
          <Metric icon={Target} value={service.precision || "Precision milimetrica"} label="Tecnologia GNSS RTK" />
          <Metric icon={Clock3} value="Reduccion de tiempos" label="Hasta 40% mas eficiente" />
          <Metric icon={UsersRound} value="Equipos multidisciplinarios" label="Topografia, GIS, BIM y mas" />
          <Metric icon={ShieldCheck} value="Estandares internacionales" label="ISO 9001 / QA-QC" />
        </div>
      </section>

      <section className="mx-auto grid w-[min(1880px,calc(100%-44px))] gap-4 pb-5 xl:grid-cols-[1fr_0.75fr_1.32fr]">
        <div className="grid gap-4 rounded-sm border border-[#24C8EE]/20 bg-[#061827]/88 p-5 md:grid-cols-[0.95fr_1.05fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#24C8EE]">Que incluye este servicio?</p>
            <p className="mt-5 text-sm leading-7 text-white/72">{content.problem || content.body || service.summary}</p>
            <Link href={`/cotizacion?context=servicio:${service.slug}`} className="mt-6 inline-flex items-center gap-3 rounded-sm border border-[#24C8EE]/35 px-5 py-3 text-sm font-bold text-white transition hover:bg-[#24C8EE]/12">
              Ver metodologia completa <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-2">
            {inclusions.slice(0, 6).map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-sm border border-white/[0.08] bg-white/[0.045] px-3 py-2 text-sm text-white/78">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#7DE4FF]" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-sm border border-[#24C8EE]/20 bg-[#061827]/88 p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#24C8EE]">Aplicaciones</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {sectors.map((sector) => (
              <div key={sector.id} className="relative min-h-24 overflow-hidden rounded-sm border border-white/[0.08] bg-white/[0.05] p-3">
                {sector.image ? <Image src={sector.image} alt={sector.name} fill sizes="180px" className="object-cover opacity-45" unoptimized /> : null}
                <div className="absolute inset-0 bg-gradient-to-t from-[#03111D] to-transparent" />
                <p className="relative mt-10 text-sm font-bold text-white">{sector.name}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-sm border border-[#24C8EE]/20 bg-[#061827]/88 p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#24C8EE]">Ruta de trabajo</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {process.slice(0, 6).map((item, index) => (
              <div key={item} className="rounded-sm border border-[#24C8EE]/18 bg-white/[0.035] p-4">
                <p className="text-sm font-black text-[#24C8EE]">{String(index + 1).padStart(2, "0")}</p>
                <FileCheck2 className="mt-4 h-7 w-7 text-[#7DE4FF]" />
                <p className="mt-4 text-sm font-bold text-white">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-[min(1880px,calc(100%-44px))] gap-4 pb-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-sm border border-[#24C8EE]/16 bg-[#061827]/72 p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#24C8EE]">Tecnologias y software</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {technologies.map((item) => <span key={item} className="rounded-sm border border-white/[0.1] bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white/82">{item}</span>)}
          </div>
        </div>
        <div className="rounded-sm border border-[#24C8EE]/16 bg-[#061827]/72 p-5">
          <MiniMetric icon={Headphones} label="Soporte" value="Transformamos datos del mundo real en informacion confiable para decisiones que construyen futuro." />
        </div>
      </section>

      {relatedProjects.length || relatedServices.length ? (
        <section className="mx-auto grid w-[min(1880px,calc(100%-44px))] gap-4 pb-12 md:grid-cols-3">
          {relatedProjects.map((project) => (
            <Link key={project.id} href={`/proyectos/${project.slug}`} className="overflow-hidden rounded-sm border border-[#24C8EE]/16 bg-[#061827]">
              {project.images[0]?.url ? <div className="relative h-44"><Image src={project.images[0].url} alt={project.title} fill sizes="33vw" className="object-cover opacity-75" unoptimized /></div> : null}
              <div className="p-5"><p className="text-xs uppercase tracking-[0.16em] text-[#24C8EE]">Proyecto relacionado</p><p className="mt-2 font-bold">{project.title}</p></div>
            </Link>
          ))}
          {relatedServices.map((related) => (
            <Link key={related.id} href={`/servicios/${related.slug}`} className="rounded-sm border border-[#24C8EE]/16 bg-[#061827] p-5">
              <p className="text-xs uppercase tracking-[0.16em] text-[#24C8EE]">Servicio relacionado</p>
              <p className="mt-2 font-bold">{related.title}</p>
              <p className="mt-3 text-sm leading-6 text-white/60">{related.summary}</p>
            </Link>
          ))}
        </section>
      ) : null}
    </article>
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

function splitTitle(title: string) {
  const words = title.split(" ");
  if (words.length <= 2) return { main: title, accent: "" };
  return { main: words.slice(0, Math.ceil(words.length / 2)).join(" "), accent: words.slice(Math.ceil(words.length / 2)).join(" ") };
}

function Metric({ icon: Icon, value, label }: { icon: typeof BriefcaseBusiness; value: string; label: string }) {
  return (
    <div className="flex items-center gap-4 border-l border-white/[0.1] p-5 first:border-l-0">
      <Icon className="h-9 w-9 shrink-0 text-[#24C8EE]" />
      <div>
        <p className="font-display text-xl font-black leading-tight text-white">{value}</p>
        <p className="mt-1 text-xs text-white/62">{label}</p>
      </div>
    </div>
  );
}

function MiniMetric({ icon: Icon, label, value }: { icon: typeof MapPinned; label: string; value: string }) {
  return (
    <div className="flex items-center gap-4">
      <Icon className="h-8 w-8 shrink-0 text-[#24C8EE]" />
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#24C8EE]">{label}</p>
        <p className="mt-1 text-sm leading-6 text-white/72">{value}</p>
      </div>
    </div>
  );
}
