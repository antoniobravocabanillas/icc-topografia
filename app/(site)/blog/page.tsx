import Link from "next/link";
import { ArrowRight, BookOpen, FileText, SearchCheck } from "lucide-react";
import { ScrollReveal } from "@/components/scroll-reveal";
import { TechnicalPageHero } from "@/components/technical-page-hero";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createBlogPreview } from "@/lib/blog-content";
import { prisma } from "@/lib/prisma";
import { createMetadata } from "@/lib/seo";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

export const metadata = createMetadata({
  title: "Blog y recursos",
  description: "Guias de compra, mantenimiento y operacion para topografia e instrumentacion.",
  path: "/blog"
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BlogPage() {
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  const posts = await prisma.blogPost.findMany({
    where: { publishedAt: { not: null }, terraqoWorkspaceId },
    orderBy: { publishedAt: "desc" }
  });
  const [featured, ...rest] = posts;
  const featuredPreview = featured ? createBlogPreview(featured.excerpt, featured.content, 280) : "";

  return (
    <>
      <TechnicalPageHero
        eyebrow="Recursos"
        title="Criterio tecnico para comprar, operar y mantener mejor"
        description="Guias y contenidos para reducir riesgo antes de seleccionar equipos, contratar servicios o planificar trabajos de campo y gabinete."
        metrics={[
          { value: "Guia", label: "compra y seleccion tecnica" },
          { value: "QA/QC", label: "operacion y mantenimiento" },
          { value: "B2B", label: "decision comercial informada" }
        ]}
        primaryCta={{ label: "Ver tienda", href: "/tienda" }}
        secondaryCta={{ label: "Solicitar asesoria", href: "/contacto" }}
      />

      <section className="container py-20">
        {featured ? (
          <ScrollReveal>
            <Link href={`/blog/${featured.slug}`} className="group grid gap-6 rounded-xl border bg-card p-6 shadow-technical transition hover:-translate-y-1 hover:border-primary/60 motion-reduce:transform-none lg:grid-cols-[0.8fr_1.2fr]">
              <div className="relative min-h-64 overflow-hidden rounded-lg bg-[#061827]">
                <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(36,200,238,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(36,200,238,0.12)_1px,transparent_1px)] [background-size:24px_24px]" />
                <div className="absolute inset-x-8 bottom-8">
                  <BookOpen className="h-8 w-8 text-[#24C8EE]" />
                  <p className="mt-4 text-sm font-semibold uppercase text-white/60">Recurso destacado</p>
                </div>
              </div>
              <div className="flex flex-col justify-center">
                <Badge variant="outline" className="w-fit">{featured.category || "Recurso tecnico"}</Badge>
                <h2 className="mt-5 font-display text-3xl font-bold leading-tight group-hover:text-primary md:text-4xl">{featured.title}</h2>
                <p className="mt-4 leading-8 text-muted-foreground">{featuredPreview}</p>
                <span className="mt-6 inline-flex items-center gap-2 font-semibold text-primary">Leer recurso <ArrowRight className="h-4 w-4" /></span>
              </div>
            </Link>
          </ScrollReveal>
        ) : null}

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {rest.map((post, index) => (
            <ScrollReveal key={post.slug} delay={index * 70}>
              <Link href={`/blog/${post.slug}`} className="block h-full">
                <Card className="h-full transition duration-300 hover:-translate-y-1 hover:border-primary/60 motion-reduce:transform-none">
                  <CardHeader>
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <Badge variant="outline">{post.category || "Recurso"}</Badge>
                      {index % 2 === 0 ? <SearchCheck className="h-5 w-5 text-primary" /> : <FileText className="h-5 w-5 text-primary" />}
                    </div>
                    <CardTitle>{post.title}</CardTitle>
                    <CardDescription>{createBlogPreview(post.excerpt, post.content, 160)}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      </section>
    </>
  );
}
