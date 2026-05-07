"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, MapPinned, Search } from "lucide-react";

type ProjectSearchItem = {
  title: string;
  slug: string;
  sector: string;
  location: string;
  summary: string;
  metric: string;
  statusLabel: string;
};

type ProjectSearchPreviewProps = {
  items: ProjectSearchItem[];
  query: string;
  selectedRubro: string;
  selectedEstado: string;
};

export function ProjectSearchPreview({ items, query, selectedRubro, selectedEstado }: ProjectSearchPreviewProps) {
  const [value, setValue] = useState(query);
  const trimmedValue = value.trim();
  const matches = useMemo(() => {
    const normalizedValue = normalizeSearchText(trimmedValue);
    if (!normalizedValue) return [];

    return items
      .map((item) => ({
        item,
        matchText: [item.title, item.location, item.sector, item.summary, item.metric]
          .find((field) => normalizeSearchText(field).includes(normalizedValue)) || item.title
      }))
      .slice(0, 5);
  }, [items, trimmedValue]);

  return (
    <div className="relative">
      <form action="/proyectos" className="grid gap-3 md:grid-cols-[1fr_auto]">
        {selectedRubro !== "todos" ? <input type="hidden" name="rubro" value={selectedRubro} /> : null}
        {selectedEstado !== "todos" ? <input type="hidden" name="estado" value={selectedEstado} /> : null}
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7DE4FF]" />
          <input
            type="search"
            name="q"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Buscar por proyecto, distrito, rubro o entregable"
            className="h-11 w-full rounded-sm border border-white/[0.1] bg-[#03111D]/70 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-white/36 focus:border-[#24C8EE]/70"
            autoComplete="off"
          />
        </label>
        <button type="submit" className="h-11 rounded-sm bg-[#0B83C4] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[#24C8EE] hover:text-[#03111D]">
          Buscar
        </button>
      </form>

      {matches.length ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-30 overflow-hidden rounded-sm border border-[#24C8EE]/24 bg-[#03111D]/98 shadow-[0_24px_80px_rgba(0,34,54,0.65)] backdrop-blur-xl">
          <div className="border-b border-white/[0.08] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7DE4FF]">Coincidencias rapidas</p>
          </div>
          <div className="divide-y divide-white/[0.08]">
            {matches.map(({ item, matchText }) => (
              <Link key={item.slug} href={`/proyectos/${item.slug}`} className="group grid gap-3 p-4 transition hover:bg-[#0B83C4]/18 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-lg font-bold leading-tight text-white">{item.title}</p>
                    <span className="rounded-sm border border-[#24C8EE]/35 bg-[#24C8EE]/12 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#7DE4FF]">{item.statusLabel}</span>
                  </div>
                  <p className="mt-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-white/48">
                    <MapPinned className="h-3 w-3 text-[#24C8EE]" />
                    {item.location || "Ubicacion por confirmar"} - {item.sector}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/64">{highlightMatch(matchText, trimmedValue)}</p>
                </div>
                <span className="inline-flex items-center gap-2 self-center text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7DE4FF] opacity-75 transition group-hover:translate-x-1 group-hover:opacity-100">
                  Ver caso <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : trimmedValue ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-30 rounded-sm border border-white/[0.08] bg-[#03111D]/98 p-4 text-sm text-white/58 shadow-[0_24px_80px_rgba(0,34,54,0.55)] backdrop-blur-xl">
          Sin coincidencias rapidas. Puedes enviar la busqueda para revisar todo el portafolio.
        </div>
      ) : null}
    </div>
  );
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function highlightMatch(text: string, query: string) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return text;
  return text;
}
