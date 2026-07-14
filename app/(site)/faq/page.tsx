import { HelpCircle } from "lucide-react";
import { ScrollReveal } from "@/components/scroll-reveal";
import { TechnicalPageHero } from "@/components/technical-page-hero";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { createMetadata } from "@/lib/seo";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

export const metadata = createMetadata({
  title: "Preguntas frecuentes",
  description: "Preguntas frecuentes sobre servicios, cotizaciones, tienda, calibracion y soporte.",
  path: "/faq"
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FaqPage() {
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  const faqs = await prisma.faq.findMany({
    where: { active: true, terraqoWorkspaceId },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }]
  });

  return (
    <>
      <TechnicalPageHero
        eyebrow="FAQ"
        title="Respuestas para compra, soporte y contratacion tecnica"
        description="Preguntas frecuentes para entender tiempos, cobertura, cotizaciones, productos bajo pedido, soporte y servicios especializados."
        metrics={[
          { value: "Compra", label: "equipos con precio o cotizacion" },
          { value: "Servicio", label: "alcances y entregables" },
          { value: "Soporte", label: "calibracion y postventa" }
        ]}
        primaryCta={{ label: "Hacer consulta", href: "/contacto" }}
        secondaryCta={{ label: "Solicitar cotizacion", href: "/cotizacion" }}
      />

      <section className="container py-20">
        <ScrollReveal>
          <Badge variant="outline">Base comercial</Badge>
          <h2 className="mt-4 max-w-3xl font-display text-3xl font-bold md:text-4xl">Lo esencial antes de comprar, alquilar o contratar</h2>
        </ScrollReveal>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {faqs.map((faq, index) => (
            <ScrollReveal key={faq.question} delay={index * 55}>
              <Card className="h-full transition duration-300 hover:-translate-y-1 hover:border-primary/60 motion-reduce:transform-none">
                <CardHeader>
                  <HelpCircle className="h-6 w-6 text-primary" />
                  <CardTitle>{faq.question}</CardTitle>
                  <CardDescription>{faq.answer}</CardDescription>
                </CardHeader>
              </Card>
            </ScrollReveal>
          ))}
        </div>
      </section>
    </>
  );
}
