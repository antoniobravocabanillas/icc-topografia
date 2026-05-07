import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Boxes, CheckCircle2, DraftingCompass, MapPinned, Radar, Ruler, ScanLine, Wrench, Zap } from "lucide-react";
import type { Service, ServiceCategory } from "@prisma/client";
import { ScrollReveal } from "@/components/scroll-reveal";
import { TechnicalPageHero } from "@/components/technical-page-hero";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Servicios de topografia y soporte tecnico",
  description: "Servicios de levantamiento topografico, georreferenciacion, replanteo, control geometrico, alquiler, calibracion, capacitacion y soporte.",
  path: "/servicios"
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

const serviceIcons = { MapPinned, Radar, DraftingCompass, Ruler, Boxes, Wrench, Zap, ScanLine };
const fallbackIcons = [MapPinned, Radar, DraftingCompass, Ruler, Boxes, Wrench, Zap, ScanLine];
const SERVICES_PER_PAGE = 8;
type ServiceWithCategory = Service & { categoryRef: ServiceCategory | null; subcategoryRef: ServiceCategory | null };

type ServicesPageProps = {
  searchParams?: Promise<{ categoria?: string; estado?: string; pagina?: string }>;
};

export default async function ServicesPage({ searchParams }: ServicesPageProps) {
  const resolvedSearchParams = await searchParams;
  const services = await prisma.service.findMany({
    where: { isPublished: true },
    include: { categoryRef: true, subcategoryRef: true },
    orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }]
  });

  const categories = Array.from(new Set(services.map((service) => displayCategory(service)))).sort();
  const statuses = Array.from(new Set(services.map((service) => service.status))).sort();
  const selectedCategory = resolvedSearchParams?.categoria || "todos";
  const selectedStatus = resolvedSearchParams?.estado || "todos";
  const filteredServices = services.filter((service) => {
    const category = displayCategory(service);
    return (selectedCategory === "todos" || category === selectedCategory) && (selectedStatus === "todos" || service.status === selectedStatus);
  });
  const requestedPage = Number(resolvedSearchParams?.pagina || "1");
  const totalPages = Math.max(1, Math.ceil(filteredServices.length / SERVICES_PER_PAGE));
  const currentPage = Number.isFinite(requestedPage) ? Math.min(Math.max(1, Math.trunc(requestedPage)), totalPages) : 1;
  const startIndex = (currentPage - 1) * SERVICES_PER_PAGE;
  const paginatedServices = filteredServices.slice(startIndex, startIndex + SERVICES_PER_PAGE);
  const featuredService = currentPage === 1 ? paginatedServices.find((service) => service.isFeatured) || paginatedServices[0] : null;
  const regularServices = featuredService ? paginatedServices.filter((service) => service.id !== featuredService.id) : paginatedServices;
  const resultStart = filteredServices.length ? startIndex + 1 : 0;
  const resultEnd = Math.min(startIndex + paginatedServices.length, filteredServices.length);

  return (
    <>
      <TechnicalPageHero
        eyebrow="Servicios"
        title="Cobertura tecnica de campo, gabinete y soporte especializado"
        description="Servicios disenados para reducir riesgo operativo, mejorar trazabilidad y acelerar decisiones tecnicas con entregables claros."
        metrics={[
          { value: "Campo", label: "levantamiento, replanteo y control" },
          { value: "Gabinete", label: "procesamiento, CAD, GIS y modelos" },
          { value: "Soporte", label: "alquiler, calibracion y capacitacion" }
        ]}
        primaryCta={{ label: "Solicitar servicio", href: "/cotizacion" }}
        secondaryCta={{ label: "Hablar con asesor", href: "/contacto" }}
      />

      <section className="relative overflow-hidden bg-[#03111D] py-20 text-white">
        <div className="absolute inset-0 pointer-events-none opacity-[0.13] [background-image:linear-gradient(rgba(36,200,238,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(11,131,196,0.14)_1px,transparent_1px)] [background-size:38px_38px]" />
        <div className="container relative">
          <div className="grid gap-8 border-b border-white/[0.08] pb-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
            <ScrollReveal>
              <Badge className="bg-white text-[#063D63] hover:bg-white">Servicios destacados</Badge>
              <h2 className="mt-5 max-w-3xl font-display text-4xl font-bold leading-tight md:text-5xl">Soluciones organizadas por alcance, proceso y entregable</h2>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-white/64 md:text-base">Cada ficha conecta necesidad tecnica, recursos de campo, gabinete, QA/QC y evidencia final para clientes que necesitan claridad antes de ejecutar.</p>
            </ScrollReveal>
            <ScrollReveal delay={80}>
              <div className="grid gap-5 rounded-sm border border-white/[0.08] bg-[#161C25]/80 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
                <div className="grid gap-5 sm:grid-cols-2">
                  <FilterGroup title="Categoria" items={["todos", ...categories]} selected={selectedCategory} param="categoria" params={{ categoria: selectedCategory, estado: selectedStatus }} />
                  <FilterGroup title="Estado" items={["todos", ...statuses]} selected={selectedStatus} param="estado" params={{ categoria: selectedCategory, estado: selectedStatus }} formatter={(value) => value === "todos" ? "Todos" : serviceStatusLabel(value)} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
                  <p className="text-xs text-white/56">
                    Mostrando <span className="font-semibold text-white">{resultStart}-{resultEnd}</span> de <span className="font-semibold text-white">{filteredServices.length}</span> servicios publicados.
                  </p>
                  {selectedCategory !== "todos" || selectedStatus !== "todos" ? (
                    <Link href="/servicios" className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7DE4FF] transition hover:text-white">Limpiar filtros</Link>
                  ) : null}
                </div>
              </div>
            </ScrollReveal>
          </div>

          {featuredService ? <FeaturedServiceCard service={featuredService} /> : null}

          <div className="mt-8 grid overflow-hidden border border-white/[0.08] bg-white/[0.07] md:grid-cols-2 xl:grid-cols-3">
            {regularServices.map((service, index) => (
              <ScrollReveal key={service.slug} delay={index * 60} className="h-full">
                <ServiceCard service={service} index={index + 1} />
              </ScrollReveal>
            ))}
          </div>

          {!filteredServices.length ? (
            <div className="mt-10 rounded-sm border border-white/[0.08] bg-[#061827] p-8 text-white/60">No hay servicios publicados con esos filtros. Ajusta categoria o estado para ver mas opciones.</div>
          ) : null}

          {totalPages > 1 ? (
            <Pagination currentPage={currentPage} totalPages={totalPages} params={{ categoria: selectedCategory, estado: selectedStatus }} />
          ) : null}
        </div>
      </section>

      <section className="border-y bg-[#061827] py-16 text-white">
        <div className="container grid gap-5 md:grid-cols-3">
          {[
            ["Diagnostico", "alcance, restricciones, equipo requerido y entregables"],
            ["Ejecucion", "campo, gabinete, QA/QC y seguimiento operativo"],
            ["Cierre", "documentacion, recomendaciones y soporte posterior"]
          ].map(([title, text], index) => (
            <ScrollReveal key={title} delay={index * 80}>
              <div className="rounded-sm border border-white/14 bg-white/[0.06] p-6">
                <p className="font-display text-2xl font-bold text-[#24C8EE]">{title}</p>
                <p className="mt-3 text-sm leading-6 text-white/70">{text}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>
    </>
  );
}

function FeaturedServiceCard({ service }: { service: ServiceWithCategory }) {
  const highlights = service.benefits.length ? service.benefits : service.deliverables.length ? service.deliverables : ["Alcance tecnico definido", "Entregables claros", "Seguimiento operativo", "Soporte especializado"];
  const Icon = iconForService(service, 0);

  return (
    <ScrollReveal className="mt-10">
      <Link href={`/servicios/${service.slug}`} className="group block">
        <article className="grid overflow-hidden border border-white/[0.08] bg-[#061827] shadow-[0_32px_90px_rgba(0,34,54,0.52)] lg:grid-cols-[0.9fr_1.1fr]">
          <div className="relative min-h-[360px] overflow-hidden bg-[#061827]">
            {service.cover ? (
              <Image src={service.cover} alt={service.title} fill sizes="(max-width: 1024px) 100vw, 45vw" className="object-cover brightness-[0.78] saturate-[0.9] transition duration-700 group-hover:scale-[1.04]" unoptimized />
            ) : (
              <div className="absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(36,200,238,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(11,131,196,0.12)_1px,transparent_1px)] [background-size:28px_28px]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#061827] via-[#061827]/52 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6">
              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/55">{displayCategory(service)}</p>
              <h3 className="mt-3 font-display text-4xl font-bold leading-tight text-white">{service.title}</h3>
            </div>
          </div>
          <div className="p-7 md:p-9">
            <div className="flex flex-wrap gap-3">
              <span className="rounded-sm border border-[#24C8EE]/35 bg-[#24C8EE]/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7DE4FF]">Destacado</span>
              <span className={serviceStatusBadgeClass(service.status)}>{serviceStatusLabel(service.status)}</span>
            </div>
            <div className="mt-6 flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-[#24C8EE]/20 bg-[#24C8EE]/8 text-[#24C8EE]">
                <Icon className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7DE4FF]">Sistema operativo ICC</p>
                <p className="mt-2 text-lg font-semibold leading-7 text-white">{service.headline || service.summary}</p>
              </div>
            </div>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {highlights.slice(0, 4).map((item) => (
                <div key={item} className="flex min-h-14 gap-3 rounded-md border border-white/10 bg-white/[0.045] p-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#24C8EE]" />
                  <p className="text-[13px] font-semibold leading-5 text-white/92">{item}</p>
                </div>
              ))}
            </div>
            <div className="mt-7 grid gap-4 border-y border-white/[0.08] py-5 md:grid-cols-3">
              <MiniServiceFact label="Precision" value={service.precision || "Segun alcance"} />
              <MiniServiceFact label="Formatos" value={(service.formats[0] || "CAD / PDF / reportes")} />
              <MiniServiceFact label="Tecnologia" value={(service.technologies[0] || "Equipo tecnico ICC")} />
            </div>
            <span className="mt-6 inline-flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7DE4FF] opacity-75 transition duration-300 group-hover:translate-x-1 group-hover:opacity-100">
              Ver servicio completo <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </article>
      </Link>
    </ScrollReveal>
  );
}

function ServiceCard({ service, index }: { service: ServiceWithCategory; index: number }) {
  const Icon = iconForService(service, index);
  const items = service.deliverables.length ? service.deliverables : service.benefits;
  return (
    <Link href={`/servicios/${service.slug}`} className="group block h-full">
      <article className="flex h-full flex-col bg-[#061827] transition duration-500 hover:z-10 hover:-translate-y-1 hover:shadow-[0_32px_80px_rgba(0,34,54,0.62)] motion-reduce:transform-none">
        <div className="h-px w-0 bg-gradient-to-r from-[#0B83C4] to-[#24C8EE] transition-all duration-500 group-hover:w-full" />
        <div className="flex-1 p-7">
          <div className="flex items-start justify-between gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-[#24C8EE]/20 bg-[#24C8EE]/8 text-[#24C8EE]">
              <Icon className="h-5 w-5" />
            </span>
            <span className={serviceStatusBadgeClass(service.status)}>{serviceStatusLabel(service.status)}</span>
          </div>
          <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#7DE4FF]/70">{displayCategory(service)}</p>
          <h3 className="mt-3 font-display text-2xl font-bold leading-tight text-white">{service.title}</h3>
          <p className="mt-4 text-sm leading-7 text-white/66">{service.summary}</p>
          <div className="mt-5 grid gap-2">
            {(items.length ? items : ["Alcance tecnico editable desde admin"]).slice(0, 3).map((item) => (
              <div key={item} className="flex gap-2 text-sm leading-6 text-white/74">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#24C8EE]" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-auto px-7 pb-7">
          <span className="inline-flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7DE4FF] opacity-75 transition duration-300 group-hover:translate-x-1 group-hover:opacity-100">
            Ver detalle <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </article>
    </Link>
  );
}

function MiniServiceFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase text-white/45">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-5 text-white">{value}</p>
    </div>
  );
}

function FilterGroup({ title, items, selected, param, params, formatter = (value) => value }: { title: string; items: string[]; selected: string; param: "categoria" | "estado"; params: { categoria?: string; estado?: string }; formatter?: (value: string) => string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/42">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <Link key={item} href={servicesHref({ ...params, [param]: item, pagina: 1 })} className={item === selected ? "rounded-sm border border-[#24C8EE]/55 bg-[#24C8EE]/18 px-3 py-1 text-xs font-semibold text-[#7DE4FF]" : "rounded-sm border border-white/[0.1] bg-white/[0.05] px-3 py-1 text-xs text-white/64 transition hover:border-[#24C8EE]/35 hover:text-white"}>
            {formatter(item)}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Pagination({ currentPage, totalPages, params }: { currentPage: number; totalPages: number; params: { categoria?: string; estado?: string } }) {
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
      {currentPage > 1 ? (
        <Link href={servicesHref({ ...params, pagina: currentPage - 1 })} className="rounded-sm border border-white/[0.12] bg-white/[0.05] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/70 transition hover:border-[#24C8EE]/35 hover:text-white">
          Anterior
        </Link>
      ) : null}
      {pages.map((page) => (
        <Link key={page} href={servicesHref({ ...params, pagina: page })} className={page === currentPage ? "rounded-sm border border-[#24C8EE]/55 bg-[#24C8EE]/18 px-4 py-2 text-sm font-semibold text-[#7DE4FF]" : "rounded-sm border border-white/[0.12] bg-white/[0.05] px-4 py-2 text-sm text-white/64 transition hover:border-[#24C8EE]/35 hover:text-white"}>
          {page}
        </Link>
      ))}
      {currentPage < totalPages ? (
        <Link href={servicesHref({ ...params, pagina: currentPage + 1 })} className="rounded-sm border border-white/[0.12] bg-white/[0.05] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/70 transition hover:border-[#24C8EE]/35 hover:text-white">
          Siguiente
        </Link>
      ) : null}
    </div>
  );
}

function servicesHref(params: { categoria?: string; estado?: string; pagina?: number | string }) {
  const search = new URLSearchParams();
  if (params.categoria && params.categoria !== "todos") search.set("categoria", params.categoria);
  if (params.estado && params.estado !== "todos") search.set("estado", params.estado);
  if (params.pagina && String(params.pagina) !== "1") search.set("pagina", String(params.pagina));
  const query = search.toString();
  return query ? `/servicios?${query}` : "/servicios";
}

function iconForService(service: Service, index: number) {
  if (service.icon && service.icon in serviceIcons) return serviceIcons[service.icon as keyof typeof serviceIcons];
  return fallbackIcons[index % fallbackIcons.length];
}

function displayCategory(service: ServiceWithCategory) {
  return service.subcategoryRef?.name || service.categoryRef?.name || service.category || "Servicios tecnicos";
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
    return "rounded-sm border border-emerald-400/35 bg-emerald-400/14 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200";
  }
  if (status === "IN_DEVELOPMENT") {
    return "rounded-sm border border-[#1E90C8]/50 bg-[#1E90C8]/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7EC8F0]";
  }
  return "rounded-sm border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70";
}
