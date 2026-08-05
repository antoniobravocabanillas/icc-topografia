import { notFound } from "next/navigation";
import { Download, MessageCircle } from "lucide-react";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { ContactForm } from "@/components/forms/contact-form";
import { ProductGallery } from "@/components/product-gallery";
import { ProductCard } from "@/components/product-card";
import { ProductDetailTabs } from "@/components/store/product-detail-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { serializeProduct } from "@/lib/server/serializers";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";
import { createMetadata } from "@/lib/seo";
import { absoluteUrl, formatCurrency } from "@/lib/utils";

type ProductPageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: ProductPageProps) {
  const { slug } = await params;
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  const product = await prisma.product.findFirst({ where: { slug, isActive: true, isVisible: true, terraqoWorkspaceId } });
  if (!product) return {};
  return createMetadata({ title: product.name, description: product.summary, path: `/tienda/${product.slug}` });
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  const dbProduct = await prisma.product.findFirst({
    where: { slug, isActive: true, isVisible: true, terraqoWorkspaceId },
    include: { category: true, variants: true }
  });
  if (!dbProduct) notFound();

  const product = serializeProduct(dbProduct);
  const related = (await prisma.product.findMany({
    where: { categoryId: dbProduct.categoryId, id: { not: dbProduct.id }, isActive: true, isVisible: true, terraqoWorkspaceId },
    include: { category: true, variants: true },
    take: 3
  })).map(serializeProduct);
  const quoteSubject = `${product.name} | ${product.brand} ${product.model || ""} | Categoria: ${product.category.name}`;
  const quoteContext = `Producto: ${product.name} | SKU: ${product.sku} | Marca: ${product.brand} | Modelo: ${product.model || "-"} | Categoria: ${product.category.name} | URL: ${absoluteUrl(`/tienda/${product.slug}`)}`;

  return (
    <section className="container py-16">
      <div className="grid gap-10 lg:grid-cols-[1fr_420px]">
        <div>
          <ProductGallery
            images={product.images}
            productName={product.name}
            brand={product.brand}
            model={product.model}
            badge={product.badge}
            requiresQuote={product.requiresQuote}
          />
          <ProductDetailTabs product={product} />
        </div>
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>{product.price ? formatCurrency(product.price) : "Precio bajo cotizacion"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Disponibilidad: <strong className="text-foreground">{product.stock > 0 ? `${product.stock} disponible(s)` : product.availability}</strong>
              </p>
              <AddToCartButton
                disabled={!product.price || product.stock <= 0}
                disabledLabel={product.price ? "Sin stock para compra directa" : "Compra consultiva"}
                item={{
                  productId: product.id,
                  slug: product.slug,
                  name: product.name,
                  brand: product.brand,
                  model: product.model,
                  price: product.price || 0,
                  currency: product.currency,
                  image: product.images[0] || null,
                  stock: product.stock
                }}
              />
              <Button asChild variant="secondary" className="w-full">
                <a href="#cotizar-producto">Solicitar cotizacion</a>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <a href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "51999999999"}`}>
                  <MessageCircle className="h-4 w-4" />
                  Asesor tecnico
                </a>
              </Button>
              <Button asChild={Boolean(product.technicalSheet)} variant="ghost" className="w-full" disabled={!product.technicalSheet}>
                {product.technicalSheet ? (
                  <a href={product.technicalSheet} target="_blank" rel="noreferrer">
                    <Download className="h-4 w-4" />
                    Descargar ficha tecnica
                  </a>
                ) : (
                  <span>
                    <Download className="h-4 w-4" />
                    Ficha tecnica pendiente
                  </span>
                )}
              </Button>
            </CardContent>
          </Card>
          <div id="cotizar-producto" className="scroll-mt-24">
            <ContactForm intent="product" context={quoteContext} subject={quoteSubject} />
          </div>
        </aside>
      </div>
      {related.length ? (
        <div className="mt-14">
          <h2 className="text-2xl font-bold">Productos relacionados</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {related.map((item) => <ProductCard key={item.slug} product={item} />)}
          </div>
        </div>
      ) : null}
    </section>
  );
}
