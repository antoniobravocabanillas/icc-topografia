import Link from "next/link";
import { ArrowRight, CheckCircle2, Database, Layers3, MapPinned, Ruler } from "lucide-react";
import { ConversionBand } from "@/components/conversion-band";
import { ScrollReveal } from "@/components/scroll-reveal";
import { Button } from "@/components/ui/button";
import { brand } from "@/lib/brand";
import { operatingStandard, partners } from "@/lib/content/site";
import { prisma } from "@/lib/prisma";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Nosotros",
  description: "Empresa especializada en topografia, geodesia, instrumentacion, venta tecnica y soporte para proyectos de ingenieria.",
  path: "/nosotros"
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

const pillars = [
  {
    id: "01",
    icon: Ruler,
    title: "Captura geoespacial",
    text: "Levantamientos, GNSS/RTK, drones, LiDAR, escaneo 3D y control geometrico con metodologia verificable.",
    tags: ["GNSS RTK", "UAV", "LiDAR", "Control de obra"]
  },
  {
    id: "02",
    icon: Database,
    title: "Inteligencia territorial",
    text: "Procesamos datos de campo para convertirlos en reportes, volumenes, modelos, planos y decisiones de avance.",
    tags: ["Volumetria", "GIS", "QA/QC", "Trazabilidad"]
  },
  {
    id: "03",
    icon: Layers3,
    title: "Ingenieria digital",
    text: "Integramos CAD, GIS, BIM y entregables digitales para expedientes, obra, mineria, catastro e infraestructura.",
    tags: ["BIM", "CAD/GIS", "Modelado 3D", "Expedientes"]
  }
];

const values = [
  ["Precision", "Tolerancias documentadas y controladas desde campo hasta gabinete."],
  ["Trazabilidad", "Cada dato conserva origen, metodo, control y entregable asociado."],
  ["Velocidad", "Flujos de captura y procesamiento pensados para reducir incertidumbre operativa."],
  ["Soporte", "Acompanamiento tecnico para servicios, equipos, alquiler, calibracion y capacitacion."]
];

const timeline = [
  ["2012", "Origen tecnico", "Inicio de operaciones como A&B Topografia Peru, con trabajos de levantamiento y control en campo."],
  ["2018", "Drones y fotogrametria", "Incorporacion de tecnologia UAV para control de avance, ortomosaicos y soporte en infraestructura."],
  ["2021", "BIM, GIS y LiDAR", "Evolucion hacia modelado, analisis geoespacial y captura de alta densidad para proyectos exigentes."],
  ["2024", "ICC Topografia", "Consolidacion corporativa para servicios, instrumentacion, alquiler, calibracion y consultoria tecnica."],
  ["2026", "Operacion premium", "Estandarizacion de procesos, portfolio digital, sectores administrables y enfoque de alto valor B2B."]
];

export default async function AboutPage() {
  const services = await prisma.service.findMany({
    where: { isPublished: true },
    select: { title: true, slug: true, category: true },
    orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
    take: 8
  });
  const serviceCount = await prisma.service.count({ where: { isPublished: true } });
  const sectors = await prisma.sector.findMany({
    where: { active: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    take: 8
  });
  const projectCount = await prisma.project.count({ where: { isPublic: true } });

  return (
    <>
      <main className="overflow-hidden bg-[#03111D] text-white">
        <section className="relative border-b border-white/[0.08]">
          <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(36,200,238,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(11,131,196,0.14)_1px,transparent_1px)] [background-size:48px_48px]" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#24C8EE]/70 to-transparent" />
          <div className="relative mx-auto grid min-h-[720px] w-[min(1880px,calc(100%-44px))] gap-12 py-16 lg:grid-cols-[1fr_520px] lg:items-center">
            <ScrollReveal>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/48">
                <span>ICC</span><span className="text-[#24C8EE]">/</span><span>Nosotros</span>
              </div>
              <div className="mt-8 inline-flex rounded-full border border-[#24C8EE]/45 bg-[#061827]/70 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#7DE4FF]">
                Empresa de inteligencia geoespacial - Lima, Peru
              </div>
              <h1 className="mt-7 max-w-5xl font-display text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
                No solo medimos terreno.
                <span className="block text-[#24C8EE]">Generamos inteligencia tecnica sobre el.</span>
              </h1>
              <p className="mt-7 max-w-3xl text-lg leading-8 text-white/70">
                {brand.name} consolida la experiencia de A&B Topografia Peru en una operacion preparada para proyectos que requieren precision, trazabilidad, equipos correctos y soporte tecnico real.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/cotizacion">Solicitar evaluacion <ArrowRight className="h-4 w-4" /></Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/[0.06] text-white hover:bg-white/[0.12]">
                  <Link href="/servicios">Ver servicios</Link>
                </Button>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={100}>
              <div className="grid overflow-hidden rounded-sm border border-[#24C8EE]/22 bg-[#061827]/80 shadow-[0_24px_90px_rgba(0,0,0,0.42)] backdrop-blur">
                <Metric value="12+" label="anos de trayectoria tecnica" />
                <Metric value={String(serviceCount)} label="servicios estructurados desde el back" />
                <Metric value={String(sectors.length)} label="sectores atendidos" />
                <Metric value={`${projectCount}+`} label="referencias y casos publicados" />
              </div>
            </ScrollReveal>
          </div>
        </section>

        <section className="mx-auto w-[min(1880px,calc(100%-44px))] py-16">
          <SectionIntro label="Sistema operativo ICC" title="Capturamos, procesamos y convertimos datos en decisiones" text="La propuesta ICC no se queda en el levantamiento. Integra campo, gabinete, control de calidad, entregables y soporte comercial para sostener proyectos de alto ticket." />
          <div className="grid gap-4 lg:grid-cols-3">
            {pillars.map((pillar, index) => (
              <ScrollReveal key={pillar.id} delay={index * 80}>
                <div className="h-full rounded-sm border border-white/[0.08] bg-[#061827] p-6 shadow-[0_24px_70px_rgba(0,34,54,0.28)]">
                  <div className="flex items-center justify-between">
                    <pillar.icon className="h-8 w-8 text-[#24C8EE]" />
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-white/34">{pillar.id}</span>
                  </div>
                  <h2 className="mt-7 font-display text-2xl font-bold">{pillar.title}</h2>
                  <p className="mt-4 text-sm leading-7 text-white/62">{pillar.text}</p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {pillar.tags.map((tag) => <span key={tag} className="rounded-sm border border-[#24C8EE]/18 bg-[#24C8EE]/8 px-3 py-1 text-xs font-semibold text-[#7DE4FF]">{tag}</span>)}
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>

        <section className="border-y border-white/[0.08] bg-[#061827] py-16">
          <div className="mx-auto grid w-[min(1880px,calc(100%-44px))] gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <ScrollReveal>
              <SectionIntro label={operatingStandard.kicker} title={operatingStandard.title} text={operatingStandard.description} compact />
              <Button asChild className="mt-7">
                <a href={brand.legacyBrochure}>Ver brochure historico A&amp;B <ArrowRight className="h-4 w-4" /></a>
              </Button>
            </ScrollReveal>
            <div className="grid gap-3 md:grid-cols-2">
              {operatingStandard.credentials.map((item, index) => (
                <ScrollReveal key={item} delay={index * 60}>
                  <div className="flex min-h-24 gap-4 rounded-sm border border-white/[0.08] bg-white/[0.045] p-5">
                    <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[#24C8EE]" />
                    <p className="text-sm leading-7 text-white/68">{item}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid w-[min(1880px,calc(100%-44px))] gap-4 py-16 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-sm border border-[#24C8EE]/16 bg-[#061827] p-6">
            <SectionIntro label="Servicios conectados" title="Una arquitectura tecnica que nace en campo y termina en entregables" text="Los servicios visibles en el sitio alimentan la narrativa corporativa: precision, geodesia, control, catastro, mineria, infraestructura y consultoria." compact />
            <div className="mt-7 grid gap-3 md:grid-cols-2">
              {services.slice(0, 6).map((service) => (
                <Link key={service.slug} href={`/servicios/${service.slug}`} className="rounded-sm border border-white/[0.08] bg-white/[0.045] p-4 transition hover:border-[#24C8EE]/35">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7DE4FF]/70">{service.category || "Servicio ICC"}</p>
                  <p className="mt-2 font-semibold">{service.title}</p>
                </Link>
              ))}
            </div>
          </div>
          <div className="rounded-sm border border-[#24C8EE]/16 bg-[#061827] p-6">
            <SectionIntro label="Sectores atendidos" title="Experiencia aplicada a industrias con riesgo tecnico real" text="Construccion, mineria, catastro, energia, infraestructura y consultoria requieren metodologias distintas, no un mismo entregable repetido." compact />
            <div className="mt-7 grid grid-cols-2 gap-3">
              {sectors.slice(0, 8).map((sector) => (
                <div key={sector.id} className="rounded-sm border border-white/[0.08] bg-white/[0.045] p-4">
                  <MapPinned className="h-5 w-5 text-[#24C8EE]" />
                  <p className="mt-3 text-sm font-bold">{sector.name}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-white/[0.08] bg-[#020D17] py-16">
          <div className="mx-auto w-[min(1880px,calc(100%-44px))]">
            <SectionIntro label="Evolucion" title="De operacion topografica a plataforma tecnica de decision" text="Nuestra historia mantiene la precision de campo como base, pero suma procesamiento, tecnologia y consultoria para proyectos modernos." />
            <div className="grid gap-3 lg:grid-cols-5">
              {timeline.map(([year, title, text], index) => (
                <ScrollReveal key={year} delay={index * 70}>
                  <div className="h-full rounded-sm border border-white/[0.08] bg-white/[0.04] p-5">
                    <p className="font-display text-3xl font-black text-[#24C8EE]">{year}</p>
                    <p className="mt-4 font-bold">{title}</p>
                    <p className="mt-3 text-sm leading-6 text-white/58">{text}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid w-[min(1880px,calc(100%-44px))] gap-4 py-16 md:grid-cols-4">
          {values.map(([title, text], index) => (
            <ScrollReveal key={title} delay={index * 70}>
              <div className="h-full rounded-sm border border-white/[0.08] bg-[#061827] p-6">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#7DE4FF]/60">0{index + 1}</p>
                <h2 className="mt-8 font-display text-2xl font-bold">{title}</h2>
                <p className="mt-4 text-sm leading-7 text-white/62">{text}</p>
              </div>
            </ScrollReveal>
          ))}
        </section>

        <section className="border-t border-white/[0.08] bg-[#061827] py-10">
          <div className="mx-auto flex w-[min(1880px,calc(100%-44px))] flex-wrap items-center gap-8">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#7DE4FF]">Tecnologia y soporte</p>
            {partners.map((partner) => <span key={partner} className="text-lg font-bold text-white/58">{partner}</span>)}
          </div>
        </section>
      </main>

      <ConversionBand />
    </>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-b border-white/[0.08] p-7 last:border-b-0">
      <p className="font-display text-4xl font-black text-[#24C8EE]">{value}</p>
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/48">{label}</p>
    </div>
  );
}

function SectionIntro({ label, title, text, compact = false }: { label: string; title: string; text: string; compact?: boolean }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#24C8EE]">{label}</p>
      <h2 className={`${compact ? "max-w-xl text-3xl" : "max-w-4xl text-4xl md:text-5xl"} mt-4 font-display font-black leading-tight`}>{title}</h2>
      <p className={`${compact ? "max-w-xl" : "max-w-3xl"} mt-4 text-sm leading-7 text-white/62 md:text-base`}>{text}</p>
    </div>
  );
}
