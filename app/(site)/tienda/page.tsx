import { StoreCatalog } from "@/components/store/store-catalog";
import { TechnicalPageHero } from "@/components/technical-page-hero";
import { prisma } from "@/lib/prisma";
import { serializeProduct } from "@/lib/server/serializers";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";
import { createMetadata } from "@/lib/seo";

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
      orderBy: { updatedAt: "desc" }
    })
  ]);
  const storeProducts = products.map(serializeProduct);
  const storeCategories = categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    count: category._count.products
  }));

  return (
    <>
      <TechnicalPageHero
        eyebrow="E-commerce B2B"
        title="Tienda tecnica para topografia e instrumentacion"
        description="Compra productos con precio publicado, compara alternativas y solicita una cotizacion consultiva para soluciones de alto ticket."
        metrics={[
          { value: "Stock", label: "equipos disponibles y bajo pedido" },
          { value: "Cotizar", label: "productos tecnicos de alto ticket" },
          { value: "Soporte", label: "postventa, calibracion y capacitacion" }
        ]}
        primaryCta={{ label: "Ver catalogo", href: "#catalogo" }}
        secondaryCta={{ label: "Solicitar asesoria", href: "/contacto" }}
      />
      <div id="catalogo" className="scroll-mt-24">
        <StoreCatalog categories={storeCategories} products={storeProducts} />
      </div>
    </>
  );
}
