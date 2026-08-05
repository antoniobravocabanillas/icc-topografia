"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ProductGalleryProps = {
  images: string[];
  productName: string;
  brand: string;
  model?: string | null;
  badge?: string | null;
  requiresQuote?: boolean;
};

export function ProductGallery({ images, productName, badge, requiresQuote }: ProductGalleryProps) {
  const normalizedImages = images.length ? images : ["/images/logo.png"];
  const [activeIndex, setActiveIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const activeImage = normalizedImages[activeIndex];

  function move(direction: number) {
    setActiveIndex((current) => (current + direction + normalizedImages.length) % normalizedImages.length);
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-primary/10 bg-white shadow-[0_28px_80px_rgba(4,45,45,0.10)]">
        <div className="relative aspect-[0.92/1] bg-gradient-to-b from-white to-[#f4fbfa]">
          <div className="absolute left-5 top-5 z-10 flex flex-wrap gap-2">
            {badge ? <span className="rounded-md bg-primary px-3 py-2 text-xs font-black uppercase text-primary-foreground">{badge}</span> : null}
            {requiresQuote ? <span className="rounded-md border bg-white px-3 py-2 text-xs font-black uppercase text-primary">Cotizacion</span> : null}
          </div>
          <Image src={activeImage} alt={productName} fill sizes="(min-width: 1024px) 48vw, 100vw" className="object-contain p-10" priority />
          <Button type="button" variant="ghost" size="icon" className="absolute bottom-5 right-5 rounded-full bg-white/90 shadow-lg" onClick={() => setIsZoomed(true)} aria-label="Ampliar imagen">
            <Maximize2 className="h-4 w-4" />
          </Button>
          {normalizedImages.length > 1 ? (
            <>
              <Button type="button" variant="ghost" size="icon" className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow-lg" onClick={() => move(-1)} aria-label="Imagen anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow-lg" onClick={() => move(1)} aria-label="Imagen siguiente">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          ) : null}
        </div>
        <div className="grid grid-cols-4 gap-3 border-t p-4">
          {normalizedImages.slice(0, 4).map((image, index) => (
            <button
              key={image}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={cn("relative aspect-square rounded-md border bg-white p-2 transition", activeIndex === index ? "border-primary ring-2 ring-primary/15" : "border-primary/10 hover:border-primary/40")}
              aria-label={`Ver imagen ${index + 1}`}
            >
              <Image src={image} alt={`${productName} ${index + 1}`} fill sizes="100px" className="object-contain p-2" />
            </button>
          ))}
        </div>
      </div>

      {isZoomed ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6" onClick={() => setIsZoomed(false)}>
          <div className="relative h-[86vh] w-full max-w-5xl rounded-lg bg-white" onClick={(event) => event.stopPropagation()}>
            <Image src={activeImage} alt={productName} fill sizes="90vw" className="object-contain p-8" />
            <Button type="button" className="absolute right-4 top-4" onClick={() => setIsZoomed(false)}>Cerrar</Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
