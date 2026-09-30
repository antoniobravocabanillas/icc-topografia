"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  Images,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type EvidenceGalleryItem = {
  id: string;
  src: string;
  alt: string;
  downloadHref?: string;
};

export function EvidenceGallery({
  items,
  tone = "light",
  className = "",
}: {
  items: EvidenceGalleryItem[];
  tone?: "light" | "dark";
  className?: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const isDark = tone === "dark";
  const isOpen = activeIndex !== null;
  const visible = items.slice(0, 4);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveIndex(null);
      if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      if (items.length > 1 && event.key === "ArrowLeft") {
        setActiveIndex((current) =>
          current === null ? 0 : (current - 1 + items.length) % items.length,
        );
      }
      if (items.length > 1 && event.key === "ArrowRight") {
        setActiveIndex((current) =>
          current === null ? 0 : (current + 1) % items.length,
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
    };
  }, [isOpen, items.length]);

  if (!items.length) return null;

  const open = (index: number, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setActiveIndex(index);
  };
  const previous = () =>
    setActiveIndex((current) =>
      current === null ? 0 : (current - 1 + items.length) % items.length,
    );
  const next = () =>
    setActiveIndex((current) =>
      current === null ? 0 : (current + 1) % items.length,
    );
  const active = activeIndex === null ? null : items[activeIndex];

  return (
    <>
      <div
        className={`grid gap-2 ${
          items.length === 1
            ? "grid-cols-1"
            : items.length === 2
              ? "grid-cols-2"
              : "grid-cols-2 sm:grid-cols-4"
        } ${className}`}
        aria-label={`Galería de ${items.length} ${items.length === 1 ? "evidencia" : "evidencias"}`}
      >
        {visible.map((item, index) => {
          const remaining = items.length - visible.length;
          const featured = items.length === 3 && index === 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={(event) => open(index, event.currentTarget)}
              className={`group relative overflow-hidden rounded-xl border text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[#25c0d5] focus-visible:ring-offset-2 ${
                featured ? "col-span-2 aspect-[16/9] sm:col-span-2" : "aspect-[4/3]"
              } ${isDark ? "border-[#2a4561] bg-[#0e1a26] focus-visible:ring-offset-[#07111f]" : "border-border bg-muted focus-visible:ring-offset-background"}`}
              aria-label={`Abrir evidencia ${index + 1} de ${items.length}`}
            >
              <Image
                src={item.src}
                alt={item.alt}
                fill
                sizes="(max-width: 768px) 50vw, 340px"
                className="object-cover transition duration-500 motion-safe:group-hover:scale-[1.025]"
                unoptimized
              />
              <span className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-70 transition group-hover:opacity-100" />
              {index === visible.length - 1 && remaining > 0 ? (
                <span className="absolute inset-0 grid place-items-center bg-[#07111f]/70 text-lg font-black text-white backdrop-blur-[2px]">
                  +{remaining}
                </span>
              ) : null}
              <span className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full border border-white/25 bg-[#07111f]/75 text-white opacity-0 backdrop-blur transition group-hover:opacity-100 group-focus-visible:opacity-100">
                <Expand className="h-4 w-4" />
              </span>
            </button>
          );
        })}
      </div>

      {active && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={dialogRef}
              className="fixed inset-0 z-[200] flex flex-col bg-[#030914]/96 text-white backdrop-blur-md"
              role="dialog"
              aria-modal="true"
              aria-label={`Galería de evidencias. Imagen ${activeIndex! + 1} de ${items.length}`}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setActiveIndex(null);
              }}
            >
              <header className="flex min-h-16 items-center justify-between gap-4 border-b border-white/10 px-4 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <Images className="h-5 w-5 shrink-0 text-[#25c0d5]" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">Evidencia fotográfica</p>
                    <p className="text-xs text-white/55">
                      {activeIndex! + 1} de {items.length}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {active.downloadHref ? (
                    <a
                      href={active.downloadHref}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-black transition hover:border-[#25c0d5]/70 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25c0d5]"
                    >
                      <Download className="h-4 w-4" />
                      <span className="hidden sm:inline">Descargar</span>
                    </a>
                  ) : null}
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={() => setActiveIndex(null)}
                    className="grid h-10 w-10 place-items-center rounded-lg border border-white/15 transition hover:border-white/40 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25c0d5]"
                    aria-label="Cerrar galería"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </header>

              <div className="relative min-h-0 flex-1">
                <Image
                  src={active.src}
                  alt={active.alt}
                  fill
                  sizes="100vw"
                  className="object-contain p-4 sm:p-8"
                  unoptimized
                  priority
                />
                {items.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={previous}
                      className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-[#07111f]/75 backdrop-blur transition hover:bg-[#102a42] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25c0d5] sm:left-6"
                      aria-label="Ver evidencia anterior"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </button>
                    <button
                      type="button"
                      onClick={next}
                      className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-[#07111f]/75 backdrop-blur transition hover:bg-[#102a42] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25c0d5] sm:right-6"
                      aria-label="Ver evidencia siguiente"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </button>
                  </>
                ) : null}
              </div>

              {items.length > 1 ? (
                <nav className="flex min-h-24 items-center justify-center gap-2 overflow-x-auto border-t border-white/10 px-4 py-3" aria-label="Miniaturas de evidencias">
                  {items.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      className={`relative h-16 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25c0d5] ${index === activeIndex ? "border-[#25c0d5]" : "border-transparent opacity-55 hover:opacity-100"}`}
                      aria-label={`Mostrar evidencia ${index + 1}`}
                      aria-current={index === activeIndex ? "true" : undefined}
                    >
                      <Image src={item.src} alt="" fill sizes="80px" className="object-cover" unoptimized />
                    </button>
                  ))}
                </nav>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
