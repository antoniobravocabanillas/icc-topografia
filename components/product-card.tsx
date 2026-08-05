"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Crosshair, Heart, Ruler, ShieldCheck, ShoppingBag, Star } from "lucide-react";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatStorePrice, getStorefrontMeta, StorefrontProduct } from "@/lib/storefront";

export type ProductCardProduct = StorefrontProduct;

type ProductCardProps = {
  product: ProductCardProduct;
  className?: string;
};

export function ProductCard({ product, className }: ProductCardProps) {
  const meta = getStorefrontMeta(product);
  const currency = product.currency || "PEN";
  const price = product.price || 0;
  const canBuy = Boolean(product.id && price && !product.requiresQuote && (product.stock || 0) > 0);

  return (
    <article
      className={cn(
        "group overflow-hidden rounded-lg border border-primary/10 bg-white shadow-[0_24px_70px_rgba(4,45,45,0.10)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_34px_90px_rgba(4,45,45,0.18)]",
        className
      )}
    >
      <div className="flex items-center gap-2 bg-gradient-to-r from-[#073f3b] to-[#0f6f66] px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white">
        <ShoppingBag className="h-4 w-4" />
        {meta.shippingLabel}
      </div>

      <div className="relative bg-gradient-to-b from-white to-[#f4fbfa] p-6">
        {meta.discountLabel ? (
          <span className="absolute left-5 top-5 rounded-r-md rounded-l-sm bg-primary px-4 py-2 text-sm font-black text-primary-foreground">
            {meta.discountLabel}
          </span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-5 top-5 z-10 rounded-full bg-white shadow-[0_12px_35px_rgba(10,31,45,0.12)]"
          aria-label="Agregar a favoritos"
        >
          <Heart className="h-5 w-5" />
        </Button>
        <Link href={`/tienda/${product.slug}`} className="relative block aspect-[1.03/1]">
          <Image
            src={meta.image}
            alt={product.name}
            fill
            sizes="(min-width: 1280px) 360px, (min-width: 768px) 45vw, 90vw"
            className="object-contain p-5 transition duration-700 group-hover:scale-[1.04]"
          />
        </Link>
      </div>

      <div className="space-y-5 p-6">
        <div>
          <p className="font-mono text-xs font-black uppercase tracking-[0.22em] text-primary">{product.brand}</p>
          <Link href={`/tienda/${product.slug}`} className="mt-2 block text-2xl font-black leading-tight text-foreground hover:text-primary">
            {product.name}
          </Link>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="flex text-[#f6b92b]">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star key={index} className="h-4 w-4 fill-current" />
              ))}
            </span>
            <strong>{meta.rating}</strong>
            <span className="text-muted-foreground">({meta.reviews})</span>
          </div>
          <p className="mt-3 min-h-[3.5rem] text-sm leading-6 text-muted-foreground">{product.summary}</p>
        </div>

        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-primary/10 bg-primary/10">
          {[
            { icon: Crosshair, label: "Precision", value: meta.precision },
            { icon: Ruler, label: "Alcance", value: meta.range },
            { icon: ShieldCheck, label: "Garantia", value: meta.warranty }
          ].map((item) => (
            <div key={item.label} className="bg-[#eef9f8] px-3 py-3">
              <item.icon className="h-4 w-4 text-primary" />
              <p className="mt-1 text-[11px] text-muted-foreground">{item.label}</p>
              <p className="text-sm font-black">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {meta.listPrice ? <p className="text-sm text-muted-foreground">Antes: <span className="line-through">{formatStorePrice(meta.listPrice, currency)}</span></p> : null}
          <p className="text-3xl font-black text-primary">{formatStorePrice(product.price, currency)}</p>
          <div className="flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-2 font-bold text-primary">
              <CheckCircle2 className="h-5 w-5" />
              {meta.stockLabel}
            </span>
            <span className="font-mono text-xs text-muted-foreground">{meta.sku}</span>
          </div>
        </div>

        <AddToCartButton
          className="h-12 rounded-md bg-gradient-to-r from-[#0a7c72] to-[#0f6f66] shadow-[0_18px_40px_rgba(0,129,119,0.22)]"
          disabled={!canBuy}
          disabledLabel="Solicitar cotizacion"
          item={{
            productId: product.id || product.slug,
            slug: product.slug,
            name: product.name,
            brand: product.brand,
            model: product.model,
            price,
            currency,
            image: meta.image,
            stock: product.stock || 1
          }}
        />

        <Link href={`/tienda/${product.slug}`} className="flex items-center justify-center gap-2 text-sm font-black text-primary hover:text-primary/80">
          Ver detalles del producto
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}
