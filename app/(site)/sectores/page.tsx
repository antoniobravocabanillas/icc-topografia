import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Factory,
  Gauge,
  Leaf,
  Map,
  Mountain,
  Pickaxe,
  RadioTower,
  ShieldCheck,
  Target,
  Waypoints
} from "lucide-react";
import { ConversionBand } from "@/components/conversion-band";
import { ScrollReveal } from "@/components/scroll-reveal";
import { Button } from "@/components/ui/button";
import { sectors as fallbackSectorNames } from "@/lib/content/site";
import { prisma } from "@/lib/prisma";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Sectores que atendemos",
  description: "Soluciones topograficas para construccion, mineria, energia, catastro, infraestructura e industria.",
  path: "/sectores"
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

const sectorIcons = [Building2, Mountain, RadioTower, Map, Gauge, Factory, Leaf, Pickaxe];

const fallbackDescriptions = [
  "Control de obra, replanteos, cubicaciones, modelos y soporte para decisiones de avance.",
  "Redes de control, monitoreo, puntos geodesicos y trazabilidad para operaciones exigentes.",
  "Levantamientos, inspeccion, fotogrametria y datos para infraestructura critica.",
  "Georreferenciacion, saneamiento, catastro, planos compatibles con GIS y memorias tecnicas.",
  "Corredores viales, ejes, secciones, control geometrico y reportes de construccion.",
  "Montaje industrial, tolerancias, estructuras metalicas y control dimensional.",
  "Drones, GNSS, modelos digitales y control para agricultura tecnificada.",
  "Base cartografica, control de activos y apoyo tecnico para consultorias especializadas."
];

const operatingBands = [
  ["Diagnostico", "Alcance, restricciones, tecnologia requerida y entregables por sector."],
  ["Ejecucion", "Campo, gabinete, QA/QC, procesamiento y control tecnico trazable."],
  ["Cierre", "Planos, reportes, modelos, evidencia y soporte para decisiones."]
];

type SectorView = {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: string | null;
  icon: string | null;
  position: number;
};

type ServiceView = {
  title: string;
  slug: string;
  category: string | null;
  sectorSlugs: string[];
};

export default async function SectorsPage() {
  const dbSectors = await prisma.sector.findMany({
    where: { active: true },
    orderBy: [{ position: "asc" }, { name: "asc" }]
  });

  const services = await prisma.service.findMany({
    where: { isPublished: true },
    select: { title: true, slug: true, category: true, sectorSlugs: true },
    orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }]
  });

  const sectors: SectorView[] = dbSectors.length
    ? dbSectors.map((sector) => ({
        id: sector.id,
        name: sector.name,
        slug: sector.slug,
        description: sector.description,
        image: sector.image,
        icon: sector.icon,
        position: sector.position
      }))
    : fallbackSectorNames.map((name, index) => ({
        id: name,
        name,
        slug: slugify(name),
        description: fallbackDescriptions[index] || fallbackDescriptions[0],
        image: null,
        icon: null,
        position: index + 1
      }));

  const featuredSectors = sectors.slice(0, 8);
  const sectorCount = sectors.length;
  const linkedServiceCount = services.length;

  return (
    <>
      <main className="overflow-hidden bg-[#03111D] text-white">
        <section className="icc-depth-bg relative border-b border-white/[0.08]">
          <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(36,200,238,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(11,131,196,0.14)_1px,transparent_1px)] [background-size:48px_48px]" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#24C8EE]/70 to-transparent" />
          <div className="relative mx-auto grid min-h-[600px] w-[min(1720px,calc(100%-72px))] gap-14 py-14 lg:grid-cols-[minmax(0,0.96fr)_460px] lg:items-center">
            <ScrollReveal>
              <div className="inline-flex rounded-full border border-[#24C8EE]/45 bg-[#061827]/70 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#7DE4FF]">
                Sectores atendidos
              </div>
              <h1 className="icc-ambient-glow mt-7 max-w-4xl font-display text-5xl font-black leading-[1.02] tracking-tight md:text-6xl xl:text-[72px]">
                Precision topografica para industrias donde el error cuesta caro.
              </h1>
              <p className="mt-7 max-w-3xl text-base leading-8 text-white/70 md:text-lg">
                Adaptamos metodologia, cuadrilla, tecnologia y entregables al contexto operativo de cada sector: obra, mineria, catastro, infraestructura, industria, ambiente y consultoria tecnica.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/cotizacion">Cotizar proyecto <ArrowRight className="h-4 w-4" /></Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/[0.06] text-white hover:bg-white/[0.12]">
                  <Link href="/servicios">Ver servicios</Link>
                </Button>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={100}>
              <div className="icc-glass rounded-sm border p-7">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#7DE4FF]">Sistema operativo ICC</p>
                <div className="mt-7 space-y-6">
                  <HeroMetric value={String(sectorCount)} label="sectores estrategicos atendidos" />
                  <HeroMetric value={String(linkedServiceCount)} label="servicios tecnicos especializados" />
                  <HeroMetric value="QA/QC" label="control tecnico por alcance y entregable" />
                </div>
              </div>
            </ScrollReveal>
          </div>
        </section>

        <section className="icc-depth-bg mx-auto w-[min(1720px,calc(100%-72px))] py-20">
          <ScrollReveal>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#24C8EE]">Cobertura sectorial</p>
            <h2 className="icc-ambient-glow mt-4 max-w-5xl font-display text-3xl font-black leading-tight md:text-4xl xl:text-5xl">
              Cada industria exige otra forma de medir, documentar y sostener decisiones.
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-white/62">
              Organizamos cada alcance por riesgo operativo, tecnologia requerida y tipo de entregable para que el cliente encuentre rapido la solucion correcta.
            </p>
          </ScrollReveal>

          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {featuredSectors.map((sector, index) => (
              <SectorCard key={sector.id} sector={sector} services={services} index={index} />
            ))}
          </div>
        </section>

        <section className="icc-depth-bg border-y border-white/[0.08] bg-[#061827] py-20">
          <div className="mx-auto grid w-[min(1720px,calc(100%-72px))] gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <ScrollReveal>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#24C8EE]">Especialidades conectadas</p>
              <h2 className="icc-ambient-glow mt-4 max-w-2xl font-display text-3xl font-black leading-tight md:text-4xl">
                Servicios que se ajustan al sector, no al reves.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-white/62">
                Catastro, geodesia, control de obra, fotogrametria, LiDAR, mineria e infraestructura necesitan protocolos, tolerancias y formatos distintos.
              </p>
            </ScrollReveal>

            <div className="grid gap-3 md:grid-cols-2">
              {services.slice(0, 8).map((service, index) => (
                <ScrollReveal key={service.slug} delay={index * 50}>
                  <Link href={`/servicios/${service.slug}`} className="icc-glass group flex h-full items-start gap-4 rounded-sm border p-5 transition hover:border-[#24C8EE]/35 hover:bg-white/[0.07]">
                    <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[#24C8EE]" />
                    <span>
                      <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#7DE4FF]/70">{service.category || "Servicio ICC"}</span>
                      <span className="mt-2 block font-bold leading-6">{service.title}</span>
                    </span>
                  </Link>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-[min(1720px,calc(100%-72px))] py-20">
          <div className="grid gap-4 md:grid-cols-3">
            {operatingBands.map(([title, text], index) => {
              const Icon = [Target, Waypoints, ShieldCheck][index];
              return (
                <ScrollReveal key={title} delay={index * 70}>
                  <div className="icc-glass h-full rounded-sm border p-7">
                    <Icon className="h-8 w-8 text-[#24C8EE]" />
                    <p className="mt-8 font-display text-3xl font-black text-white">{title}</p>
                    <p className="mt-4 text-sm leading-7 text-white/62">{text}</p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </section>
      </main>

      <ConversionBand />
    </>
  );
}

function SectorCard({ sector, services, index }: { sector: SectorView; services: ServiceView[]; index: number }) {
  const Icon = sectorIcons[index % sectorIcons.length];
  const relatedServices = getRelatedServices(sector, services);
  const isFeatured = index < 2;

  return (
    <ScrollReveal delay={index * 55}>
      <article className={`icc-panel-depth group overflow-hidden rounded-sm border border-[#24C8EE]/20 bg-[#061827] shadow-[0_28px_90px_rgba(0,24,40,0.35)] transition duration-300 hover:-translate-y-1 hover:border-[#7DE4FF]/50 motion-reduce:transform-none ${isFeatured ? "xl:col-span-2" : ""}`}>
        <div className={isFeatured ? "grid h-full md:grid-cols-[0.95fr_1.05fr]" : "flex h-full flex-col"}>
          <div className={`icc-image-depth relative overflow-hidden ${isFeatured ? "min-h-[360px]" : "h-48"}`}>
            {sector.image ? (
                  <Image src={sector.image} alt={sector.name} fill sizes={isFeatured ? "(min-width: 1280px) 25vw, 100vw" : "(min-width: 1280px) 20vw, (min-width: 768px) 50vw, 100vw"} className="object-cover opacity-78 transition duration-700 group-hover:scale-[1.04]" />
            ) : (
              <div className="absolute inset-0 bg-[#061827] opacity-100 [background-image:linear-gradient(rgba(36,200,238,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(11,131,196,0.13)_1px,transparent_1px)] [background-size:34px_34px]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#03111D] via-[#03111D]/28 to-transparent" />
            <div className="absolute left-5 top-5 rounded-full border border-white/25 bg-[#03111D]/62 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-white/78 backdrop-blur">
              SEC - {String(index + 1).padStart(2, "0")}
            </div>
            <div className="absolute bottom-5 right-5 grid h-11 w-11 place-items-center rounded-sm border border-[#24C8EE]/35 bg-[#03111D]/70 text-[#24C8EE] backdrop-blur">
              <Icon className="h-6 w-6" />
            </div>
          </div>

          <div className={`flex flex-1 flex-col ${isFeatured ? "p-7" : "p-6"}`}>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7DE4FF]/62">Cobertura sectorial</p>
            <h2 className={`${isFeatured ? "text-3xl" : "text-2xl"} mt-4 font-display font-black leading-tight text-white`}>{sector.name}</h2>
            <p className="mt-4 line-clamp-3 text-sm leading-7 text-white/66">{sector.description}</p>

            <div className="mt-6 grid gap-2">
              {relatedServices.slice(0, 3).map((service) => (
                <Link key={service.slug} href={`/servicios/${service.slug}`} className="group/item flex items-center gap-3 rounded-sm border border-white/[0.08] bg-white/[0.045] px-3 py-2.5 text-xs font-bold text-white/80 transition hover:border-[#24C8EE]/35 hover:bg-white/[0.07]">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#24C8EE]" />
                  <span className="line-clamp-1 group-hover/item:text-[#7DE4FF]">{service.title}</span>
                </Link>
              ))}
            </div>

            <Link href="/cotizacion" className="mt-auto inline-flex items-center gap-2 pt-7 text-xs font-black uppercase tracking-[0.16em] text-[#7DE4FF]">
              Consultar alcance <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </article>
    </ScrollReveal>
  );
}

function HeroMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-b border-white/[0.14] pb-5 last:border-b-0 last:pb-0">
      <p className="font-display text-3xl font-black text-[#24C8EE] md:text-4xl">{value}</p>
      <p className="mt-1 text-sm font-semibold text-white/70">{label}</p>
    </div>
  );
}

function getRelatedServices(sector: SectorView, services: ServiceView[]) {
  const sectorKey = normalizeText(sector.slug || sector.name);
  const nameKey = normalizeText(sector.name);
  const direct = services.filter((service) => {
    const haystack = normalizeText(`${service.title} ${service.category || ""} ${service.sectorSlugs.join(" ")}`);
    return service.sectorSlugs.map(normalizeText).includes(sectorKey) || haystack.includes(nameKey.split(" ")[0] || sectorKey);
  });

  if (direct.length) return direct;
  return services.slice(0, 3);
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(value: string) {
  return normalizeText(value).replace(/\s+/g, "-");
}
