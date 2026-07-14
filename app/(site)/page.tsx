import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CheckCircle2, MessageCircle, Radar, Ruler, ShieldCheck, SlidersHorizontal, Wrench } from "lucide-react";
import { HomeHero3D } from "@/components/home-hero-3d";
import { HomeServicesShowcase } from "@/components/home-services-showcase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConversionBand } from "@/components/conversion-band";
import { ProductCard } from "@/components/product-card";
import { ScrollReveal } from "@/components/scroll-reveal";
import { SectionHeading } from "@/components/section-heading";
import { operatingStandard, partners, projects } from "@/lib/content/site";
import { brand } from "@/lib/brand";
import { prisma } from "@/lib/prisma";
import { safeDb } from "@/lib/server/safe-db";
import { serializeProduct } from "@/lib/server/serializers";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

const advantages = [
  { icon: ShieldCheck, title: "Confianza tecnica", text: "Trazabilidad, certificados, QA/QC y entregables consistentes." },
  { icon: SlidersHorizontal, title: "Configuracion correcta", text: "Equipos, accesorios, software y capacitacion alineados al uso real." },
  { icon: Wrench, title: "Servicio postventa", text: "Mantenimiento, calibracion, soporte remoto y atencion de incidencias." },
  { icon: CheckCircle2, title: "Compra B2B ordenada", text: "Cotizaciones claras para compras corporativas y proyectos exigentes." }
];

const heroMetrics = [
  { icon: Ruler, value: "12+", label: "anos de experiencia tecnica" },
  { icon: Radar, value: "QA/QC", label: "entregables auditables" },
  { icon: ShieldCheck, value: "B2B", label: "compras, alquiler y soporte" },
  { icon: SlidersHorizontal, value: "360", label: "servicios, equipos y calibracion" }
];

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  const [services, faqs, testimonials, clientLogos, categories, products] = await Promise.all([
    safeDb("home services", prisma.service.findMany({ where: { isPublished: true, terraqoWorkspaceId }, orderBy: { updatedAt: "desc" }, take: 8 }), []),
    safeDb("home faqs", prisma.faq.findMany({ where: { active: true, terraqoWorkspaceId }, orderBy: [{ position: "asc" }, { createdAt: "desc" }], take: 6 }), []),
    safeDb("home testimonials", prisma.testimonial.findMany({ where: { active: true, terraqoWorkspaceId }, orderBy: { createdAt: "desc" }, take: 2 }), []),
    safeDb("home client logos", prisma.clientLogo.findMany({ where: { active: true, terraqoWorkspaceId }, orderBy: [{ position: "asc" }, { createdAt: "desc" }], take: 18 }), []),
    safeDb("home categories", prisma.category.findMany({ where: { terraqoWorkspaceId, products: { some: { isActive: true, terraqoWorkspaceId } } }, orderBy: { name: "asc" }, take: 12 }), []),
    safeDb("home products", prisma.product.findMany({ where: { isActive: true, terraqoWorkspaceId }, include: { category: true, variants: true }, orderBy: { updatedAt: "desc" }, take: 4 }), [])
  ]);
  const featuredProducts = products.map(serializeProduct);

  return (
    <>
      <section className="icc-depth-bg relative isolate overflow-hidden border-b bg-[#03111D] text-white">
        <HomeHero3D />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,17,29,0.96)_0%,rgba(3,17,29,0.78)_42%,rgba(3,17,29,0.18)_100%)]" />
        <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(36,200,238,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(36,200,238,0.11)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="container relative grid min-h-[calc(100svh-8rem)] items-center gap-10 py-12 lg:grid-cols-[0.98fr_1.02fr]">
          <div className="max-w-3xl">
            <Badge className="bg-white text-[#063D63] hover:bg-white">{brand.descriptor}</Badge>
            <h1 className="icc-ambient-glow mt-5 font-display text-5xl font-bold leading-[0.96] text-white md:text-7xl">
              ICC Topografia Group S.A.C.
            </h1>
            <p className="mt-5 max-w-2xl text-2xl font-semibold leading-tight text-[#7DE4FF] md:text-3xl">
              Topografia, geodesia e instrumentacion para proyectos criticos.
            </p>
            <p className="mt-6 max-w-2xl text-base leading-8 text-white/74 md:text-lg">
              Integramos servicios de campo, consultoria, venta tecnica, alquiler, calibracion y soporte para obras que necesitan datos confiables, equipos correctos y trazabilidad real.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/cotizacion">Solicitar cotizacion <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/tienda">Ver tienda tecnica</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/35 bg-white/10 text-white hover:bg-white/18">
                <a href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "51999999999"}`}>
                  <MessageCircle className="h-4 w-4" />
                  Hablar con asesor
                </a>
              </Button>
            </div>
          </div>
          <div className="hidden justify-self-end lg:block">
            <div className="icc-glass w-[390px] border p-6 text-white">
              <p className="text-xs font-semibold uppercase text-white/58">{brand.tagline}</p>
              <div className="mt-5 grid gap-5">
                {heroMetrics.map(({ icon: Icon, value, label }) => (
                  <div key={label} className="grid grid-cols-[34px_96px_1fr] items-center gap-4 border-b border-white/12 pb-4 last:border-b-0 last:pb-0">
                    <Icon className="h-5 w-5 text-[#24C8EE]" />
                    <span className="font-display text-3xl font-bold text-[#24C8EE]">{value}</span>
                    <span className="text-sm text-white/72">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <HomeServicesShowcase services={services} />

      {clientLogos.length ? (
        <section className="border-y bg-white py-16">
          <div className="container">
            <ScrollReveal>
              <SectionHeading eyebrow="Confianza en campo" title="Acompanamos decisiones que empiezan con mediciones precisas" description="Organizaciones que eligieron a ICC para convertir levantamientos, control y datos tecnicos en avances reales de obra." />
            </ScrollReveal>
            <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3 lg:grid-cols-6">
              {clientLogos.map((clientLogo, index) => {
                const logo = (
                  <div className="group flex h-28 items-center justify-center bg-background p-5 transition hover:bg-[#F7FBFD]">
                    <div className="relative h-full w-full">
                      <Image src={clientLogo.logoUrl} alt={`Logo de ${clientLogo.name}`} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw" className="object-contain opacity-78 grayscale transition duration-300 group-hover:opacity-100 group-hover:grayscale-0" unoptimized />
                    </div>
                  </div>
                );

                return (
                  <ScrollReveal key={clientLogo.id} delay={index * 35}>
                    {clientLogo.website ? (
                      <a href={clientLogo.website} target="_blank" rel="noreferrer" aria-label={clientLogo.name} className="block">
                        {logo}
                      </a>
                    ) : logo}
                  </ScrollReveal>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      <section className="icc-depth-bg relative overflow-hidden border-y bg-[#061827] py-20 text-white">
        <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(36,200,238,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(36,200,238,0.08)_1px,transparent_1px)] [background-size:36px_36px]" />
        <div className="container relative">
          <ScrollReveal>
            <SectionHeading tone="dark" eyebrow="Tienda tecnica" title="Categorias preparadas para compra consultiva" description="Catalogo pensado para instrumentos de ticket alto, productos con precio y soluciones que requieren cotizacion." />
          </ScrollReveal>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((category, index) => (
              <ScrollReveal key={category.id} delay={index * 35}>
                <Link href={`/tienda?categoria=${encodeURIComponent(category.slug)}`} className="icc-glass block rounded-md border p-4 font-semibold text-white transition hover:border-[#24C8EE]/70 hover:bg-white/[0.085]">
                  {category.name}
                </Link>
              </ScrollReveal>
            ))}
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {featuredProducts.map((product, index) => (
              <ScrollReveal key={product.slug} delay={index * 70}>
                <ProductCard product={product} />
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="container grid gap-8 py-20 lg:grid-cols-[0.9fr_1.1fr]">
        <ScrollReveal>
          <SectionHeading eyebrow="Ventajas competitivas" title="La venta tecnica no termina en la factura" description="Cada compra, alquiler o servicio se acompana con criterio de aplicacion, puesta en marcha y respaldo postventa." />
        </ScrollReveal>
        <div className="grid gap-4 sm:grid-cols-2">
          {advantages.map(({ icon: Icon, title, text }, index) => (
            <ScrollReveal key={title} delay={index * 80}>
              <Card className="h-full transition duration-300 hover:-translate-y-1 hover:border-primary/60 motion-reduce:transform-none">
              <CardHeader>
                <Icon className="h-6 w-6 text-primary" />
                <CardTitle>{title}</CardTitle>
                <CardDescription>{text}</CardDescription>
              </CardHeader>
            </Card>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <section className="icc-depth-bg border-y bg-[#063D63] py-20 text-white">
        <div className="container grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <ScrollReveal>
            <Badge className="bg-[#12B5DC] text-white">{operatingStandard.kicker}</Badge>
            <h2 className="mt-5 font-display text-3xl font-bold md:text-4xl">{operatingStandard.title}</h2>
            <p className="mt-5 text-base leading-7 text-white/76">{operatingStandard.description}</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {operatingStandard.metrics.map(([value, label]) => (
                <div key={label} className="icc-glass rounded-md border p-4">
                  <p className="text-3xl font-bold text-[#12B5DC]">{value}</p>
                  <p className="mt-1 text-sm text-white/72">{label}</p>
                </div>
              ))}
            </div>
          </ScrollReveal>
          <div className="grid gap-3">
            {operatingStandard.credentials.map((credential, index) => (
              <ScrollReveal key={credential} delay={index * 70}>
              <div className="icc-glass rounded-md border p-4 text-sm leading-6 text-white/82 transition hover:border-[#24C8EE]/50">
                {credential}
              </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y bg-white/72 py-20">
        <div className="container">
          <ScrollReveal>
            <SectionHeading eyebrow="Partners y marcas" title="Ecosistema de instrumentacion profesional" />
          </ScrollReveal>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {partners.map((partner, index) => (
              <ScrollReveal key={partner} delay={index * 45}>
                <div className="rounded-md border bg-background p-4 text-center text-sm font-semibold transition hover:-translate-y-1 hover:border-primary/60 motion-reduce:transform-none">{partner}</div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="container py-20">
        <ScrollReveal>
          <SectionHeading eyebrow="Casos de exito" title="Proyectos donde la precision tiene impacto comercial" />
        </ScrollReveal>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {projects.map((project, index) => (
            <ScrollReveal key={project.title} delay={index * 70}>
            <Card className="h-full transition duration-300 hover:-translate-y-1 hover:border-primary/60 motion-reduce:transform-none">
              <CardHeader>
                <Badge variant="outline">{project.sector}</Badge>
                <CardTitle>{project.title}</CardTitle>
                <CardDescription>{project.summary}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-primary">{project.metric}</p>
              </CardContent>
            </Card>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <section className="border-y bg-white/72 py-20">
        <div className="container grid gap-8 lg:grid-cols-2">
          {testimonials.map((testimonial, index) => (
            <ScrollReveal key={testimonial.author} delay={index * 90}>
            <blockquote className="rounded-lg border bg-background p-6 shadow-technical transition hover:-translate-y-1 hover:border-primary/50 motion-reduce:transform-none">
              <p className="text-lg leading-8">&ldquo;{testimonial.quote}&rdquo;</p>
              <footer className="mt-5 text-sm text-muted-foreground">{testimonial.author} - {testimonial.company}</footer>
            </blockquote>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <section className="container py-20">
        <ScrollReveal>
          <SectionHeading eyebrow="FAQ" title="Preguntas frecuentes antes de cotizar" />
        </ScrollReveal>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {faqs.map((faq, index) => (
            <ScrollReveal key={faq.question} delay={index * 55}>
            <Card className="h-full transition duration-300 hover:-translate-y-1 hover:border-primary/60 motion-reduce:transform-none">
              <CardHeader>
                <CardTitle>{faq.question}</CardTitle>
                <CardDescription>{faq.answer}</CardDescription>
              </CardHeader>
            </Card>
            </ScrollReveal>
          ))}
        </div>
      </section>
      <ConversionBand />
    </>
  );
}
