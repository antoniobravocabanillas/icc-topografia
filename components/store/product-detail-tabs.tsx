"use client";

import { type ReactNode, useMemo, useState } from "react";
import { FileDown, MessageSquareText, PackageCheck, Ruler, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getStorefrontMeta, type StorefrontProduct } from "@/lib/storefront";

type TabKey = "descripcion" | "especificaciones" | "incluye" | "descargas" | "opiniones";

const tabs: { key: TabKey; label: string }[] = [
  { key: "descripcion", label: "Descripcion" },
  { key: "especificaciones", label: "Especificaciones" },
  { key: "incluye", label: "Incluye" },
  { key: "descargas", label: "Descargas" },
  { key: "opiniones", label: "Opiniones" }
];

export function ProductDetailTabs({ product }: { product: StorefrontProduct }) {
  const [active, setActive] = useState<TabKey>("descripcion");
  const meta = useMemo(() => getStorefrontMeta(product), [product]);
  const specs = useMemo(() => {
    const ignored = new Set([
      "shippingLabel",
      "envio",
      "discount",
      "descuento",
      "rating",
      "calificacion",
      "reviews",
      "opiniones",
      "listPrice",
      "precioLista",
      "oldPrice",
      "precioAnterior",
      "includes",
      "incluye",
      "downloads",
      "descargas"
    ]);
    const entries = Object.entries(meta.specs).filter(([key, value]) => !ignored.has(key) && typeof value !== "object");
    return entries.length
      ? entries.map(([key, value]) => [humanize(key), String(value)])
      : [
          ["Precision", meta.precision],
          ["Alcance", meta.range],
          ["Garantia", meta.warranty],
          ["Proteccion", meta.protection],
          ["Conectividad", meta.connectivity]
        ];
  }, [meta]);

  const includes = meta.includes.length
    ? meta.includes
    : [
        "Equipo calibrado y revisado antes de entrega",
        "Asesoria para configuracion inicial",
        "Soporte tecnico especializado",
        "Documentacion comercial y garantia"
      ];

  const downloads = [
    product.technicalSheet ? { label: "Ficha tecnica", href: product.technicalSheet } : null,
    product.manualUrl ? { label: "Manual de usuario", href: product.manualUrl } : null,
    ...meta.downloads.map((download) => ({ label: download, href: download.startsWith("http") || download.startsWith("/") ? download : "" }))
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <div className="mt-10 rounded-xl border border-primary/12 bg-white p-5 shadow-[0_24px_90px_rgba(4,45,45,0.08)]">
      <div className="flex gap-3 overflow-x-auto border-b border-primary/10">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={cn(
              "shrink-0 border-b-2 px-4 py-3 text-sm font-black transition",
              active === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-[240px] p-2 pt-7">
        {active === "descripcion" ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <div className="space-y-4 leading-7 text-muted-foreground">
              <p>{product.description || product.summary || "Equipo tecnico disponible para cotizacion y compra con soporte especializado."}</p>
              <ul className="grid gap-2 text-sm">
                {includes.slice(0, 5).map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg bg-[#f4fbfa] p-5">
              <Feature icon={<PackageCheck className="h-5 w-5" />} title="Envios a todo el Peru" text="Entrega coordinada segun ciudad y disponibilidad." />
              <Feature icon={<ShieldCheck className="h-5 w-5" />} title="Garantia oficial" text={`${meta.warranty} de respaldo tecnico.`} />
              <Feature icon={<Ruler className="h-5 w-5" />} title="Soporte especializado" text="Asesoria para seleccion, uso y postventa." />
            </div>
          </div>
        ) : null}

        {active === "especificaciones" ? (
          <dl className="grid gap-3 md:grid-cols-2">
            {specs.map(([key, value]) => (
              <div key={key} className="rounded-lg border border-primary/10 bg-[#f9fdfc] p-4">
                <dt className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-primary">{key}</dt>
                <dd className="mt-2 text-lg font-black">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {active === "incluye" ? (
          <div className="grid gap-3 md:grid-cols-2">
            {includes.map((item) => (
              <div key={item} className="flex gap-3 rounded-lg border border-primary/10 bg-white p-4">
                <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span className="text-sm font-semibold leading-6">{item}</span>
              </div>
            ))}
          </div>
        ) : null}

        {active === "descargas" ? (
          <div className="grid gap-3 md:grid-cols-2">
            {downloads.length ? (
              downloads.map((download) => (
                download.href ? (
                  <Button key={download.label} asChild variant="outline" className="justify-start">
                    <a href={download.href} target="_blank" rel="noreferrer">
                      <FileDown className="h-4 w-4" />
                      {download.label}
                    </a>
                  </Button>
                ) : (
                  <Button key={download.label} variant="outline" className="justify-start" disabled>
                    <span>
                      <FileDown className="h-4 w-4" />
                      {download.label}
                    </span>
                  </Button>
                )
              ))
            ) : (
              <p className="text-sm text-muted-foreground">La ficha tecnica se adjuntara al confirmar disponibilidad.</p>
            )}
          </div>
        ) : null}

        {active === "opiniones" ? (
          <div className="rounded-lg border border-primary/10 bg-[#f9fdfc] p-6">
            <MessageSquareText className="h-6 w-6 text-primary" />
            <p className="mt-4 text-2xl font-black">{meta.rating} / 5.0</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Valoracion referencial basada en {meta.reviews} opiniones, soporte tecnico y experiencia de uso.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3 border-b border-primary/10 py-3 last:border-b-0">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-primary">{icon}</span>
      <span>
        <span className="block text-sm font-black">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{text}</span>
      </span>
    </div>
  );
}

function humanize(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}
