import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ShoppingBag } from "lucide-react";
import { StoreCatalog } from "@/components/store/store-catalog";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { serializeProduct } from "@/lib/server/serializers";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";
import { createMetadata } from "@/lib/seo";
import { formatStorePrice, getStorefrontMeta } from "@/lib/storefront";

export const metadata = createMetadata({
  title: "Tienda tecnica de equipos topograficos",
  description: "Catalogo profesional de estaciones totales, GNSS, niveles, drones, escaneres, accesorios, alquiler y soporte tecnico.",
  path: "/tienda"
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StorePage() {
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  const [categories, products] = await Promise.all([
    prisma.category.findMany({
      include: { _count: { select: { products: { where: { isActive: true, isVisible: true, terraqoWorkspaceId } } } } },
      orderBy: { name: "asc" }
    }),
    prisma.product.findMany({
      where: { isActive: true, isVisible: true, terraqoWorkspaceId },
      include: { category: true, variants: true },
      orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }]
    })
  ]);
  const storeProducts = products.map(serializeProduct);
  const featured = storeProducts.find((product) => product.isFeatured) || storeProducts[0];
  const featuredMeta = featured ? getStorefrontMeta(featured) : null;
  const storeCategories = categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    count: category._count.products
  }));

  return (
    <>
      <section className="relative overflow-hidden bg-[#f7fbfa] py-20 md:py-28">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,150,136,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(0,150,136,0.045)_1px,transparent_1px)] bg-[size:44px_44px]" />
        <div className="pointer-events-none absolute -right-24 top-12 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="container relative grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="max-w-2xl">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.38em] text-primary">Tienda tecnica</p>
            <h1 className="mt-5 text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
              Equipos topograficos listos para cotizar con respaldo tecnico.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground">
              La tienda vive en ICC Topografia para el cliente. Terraqo queda como workspace operativo: administra stock,
              cotizaciones, trazabilidad comercial y seguimiento del lead sin duplicar catalogos.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-lg">
                <Link href="#catalogo">
                  Ver tienda tecnica
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-lg bg-white/70">
                <Link href="/contacto">Solicitar asesoria</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              {["GNSS", "Estaciones totales", "LiDAR", "Drones"].map((tag) => (
                <span key={tag} className="rounded-lg border border-primary/15 bg-white/80 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {featured && featuredMeta ? (
            <Link
              href={`/tienda/${featured.slug}`}
              className="group rounded-xl border border-primary/12 bg-white/88 p-4 shadow-[0_30px_120px_rgba(0,73,71,0.14)] backdrop-blur"
            >
              <div className="grid gap-4 md:grid-cols-[0.78fr_1fr]">
                <div className="relative min-h-[420px] overflow-hidden rounded-lg bg-[#eef8f6]">
                  <Image src={featuredMeta.image} alt={featured.name} fill sizes="420px" className="object-contain p-8 transition duration-700 group-hover:scale-[1.04]" />
                  <div className="absolute left-5 top-5 rounded-lg bg-primary px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.18em] text-white">
                    Equipo destacado
                  </div>
                  <div className="absolute bottom-5 left-5 right-5 rounded-lg bg-black/45 p-5 text-white backdrop-blur">
                    <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground/80">{featured.brand}</p>
                    <h2 className="mt-2 text-3xl font-black leading-none">{featured.name}</h2>
                    <p className="mt-2 text-sm text-white/75">{featured.summary}</p>
                  </div>
                </div>
                <div className="grid gap-4">
                  {[
                    ["01", "Cliente explora", "icctopografia.com/tienda"],
                    ["02", "Cotizacion guiada", "WhatsApp, carrito o formulario"],
                    ["03", "Terraqo ordena", "stock, lead y seguimiento"]
                  ].map(([index, title, text]) => (
                    <div key={index} className="rounded-lg border border-primary/12 bg-white p-6">
                      <span className="grid h-10 w-10 place-items-center rounded-full border border-primary/20 font-mono text-sm font-black text-primary">{index}</span>
                      <h3 className="mt-5 text-2xl font-black">{title}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
                    </div>
                  ))}
                  <div className="rounded-lg bg-[#062f30] p-6 text-white">
                    <div className="flex items-center gap-4">
                      <span className="grid h-16 w-16 place-items-center rounded-full border border-primary/35 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                        Fuente unica
                      </span>
                      <div>
                        <h3 className="text-2xl font-black">Base operativa Terraqo</h3>
                        <p className="mt-1 text-sm text-white/70">El sitio muestra. El workspace gestiona.</p>
                        <p className="mt-2 text-xl font-black text-primary">{formatStorePrice(featured.price, featured.currency)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ) : (
            <div className="rounded-xl border border-primary/12 bg-white p-8">
              <ShoppingBag className="h-8 w-8 text-primary" />
              <h2 className="mt-5 text-3xl font-black">Catalogo en preparacion</h2>
              <p className="mt-3 text-muted-foreground">Los productos activos del workspace apareceran aqui automaticamente.</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3 lg:col-span-2">
            {[
              ["Compra segura", "Pedidos registrados en Terraqo"],
              ["Garantia oficial", "Soporte y trazabilidad"],
              ["Entrega tecnica", "Despacho coordinado en Peru"]
            ].map(([title, text]) => (
              <div key={title} className="flex items-center gap-3 rounded-lg border border-primary/10 bg-white/75 p-4">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-black">{title}</p>
                  <p className="text-sm text-muted-foreground">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <div id="catalogo" className="scroll-mt-24">
        <StoreCatalog categories={storeCategories} products={storeProducts} />
      </div>
    </>
  );
}
