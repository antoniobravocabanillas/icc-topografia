import Link from "next/link";
import { ArrowRight, Building2, Factory, Gauge, Leaf, Map, Mountain, Pickaxe, RadioTower } from "lucide-react";
import { ScrollReveal } from "@/components/scroll-reveal";
import { TechnicalPageHero } from "@/components/technical-page-hero";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { sectors } from "@/lib/content/site";
import { prisma } from "@/lib/prisma";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Sectores que atendemos",
  description: "Soluciones topograficas para construccion, mineria, energia, catastro, infraestructura e industria.",
  path: "/sectores"
});

const sectorIcons = [Building2, Mountain, RadioTower, Map, Gauge, Factory, Leaf, Pickaxe];
const sectorDescriptions = [
  "Control de obra, replanteos, cubicaciones, modelos y soporte para decisiones de avance.",
  "Redes de control, monitoreo, puntos geodesicos y trazabilidad para operaciones exigentes.",
  "Levantamientos, inspeccion, fotogrametria y datos para infraestructura critica.",
  "Georreferenciacion, saneamiento, catastro, planos compatibles con GIS y memorias tecnicas.",
  "Corredores viales, ejes, secciones, control geometrico y reportes de construccion.",
  "Montaje industrial, tolerancias, estructuras metalicas y control dimensional.",
  "Drones, GNSS, modelos digitales y control para agricultura tecnificada.",
  "Base cartografica, control de activos y apoyo tecnico para consultorias especializadas."
];

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SectorsPage() {
  const dbSectors = await prisma.sector.findMany({
    where: { active: true },
    orderBy: [{ position: "asc" }, { name: "asc" }]
  });
  const sectorItems = dbSectors.length
    ? dbSectors.map((sector) => ({ name: sector.name, description: sector.description }))
    : sectors.map((sector, index) => ({ name: sector, description: sectorDescriptions[index] }));

  return (
    <>
      <TechnicalPageHero
        eyebrow="Sectores"
        title="Especializacion para industrias donde la precision impacta costo y seguridad"
        description="Adaptamos metodologia, equipos y entregables al contexto operativo de cada industria: obra, mineria, energia, catastro, montaje, agricultura y consultoria."
        metrics={[
          { value: "8", label: "sectores con demanda tecnica" },
          { value: "GIS", label: "datos compatibles con gestion territorial" },
          { value: "QA/QC", label: "control operativo por proyecto" }
        ]}
        primaryCta={{ label: "Cotizar proyecto", href: "/cotizacion" }}
        secondaryCta={{ label: "Ver servicios", href: "/servicios" }}
      />

      <section className="container py-20">
        <ScrollReveal>
          <Badge variant="outline">Cobertura sectorial</Badge>
          <h2 className="mt-4 max-w-3xl font-display text-3xl font-bold md:text-4xl">Soluciones tecnicas que cambian segun el riesgo, el terreno y el entregable</h2>
        </ScrollReveal>
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {sectorItems.map((sector, index) => {
            const Icon = sectorIcons[index % sectorIcons.length];
            return (
              <ScrollReveal key={sector.name} delay={index * 55}>
                <Card className="h-full transition duration-300 hover:-translate-y-1 hover:border-primary/60 motion-reduce:transform-none">
                  <CardHeader>
                    <Icon className="h-6 w-6 text-primary" />
                    <CardTitle className="text-xl">{sector.name}</CardTitle>
                    <CardDescription>{sector.description}</CardDescription>
                    <Link href="/contacto" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                      Consultar alcance <ArrowRight className="h-4 w-4" />
                    </Link>
                  </CardHeader>
                </Card>
              </ScrollReveal>
            );
          })}
        </div>
      </section>

      <section className="border-y bg-[#061827] py-16 text-white">
        <div className="container grid gap-6 md:grid-cols-3">
          {[
            ["Levantamiento", "captura de informacion planimetrica, altimetrica y geoespacial"],
            ["Control", "verificacion geometrica, tolerancias, avances y trazabilidad"],
            ["Soporte", "equipos, alquiler, capacitacion y postventa para continuidad operativa"]
          ].map(([title, text], index) => (
            <ScrollReveal key={title} delay={index * 80}>
              <div className="rounded-lg border border-white/14 bg-white/[0.06] p-6">
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
