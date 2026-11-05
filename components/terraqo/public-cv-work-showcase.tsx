import type { PublicWorkCaseCard } from "@/lib/terraqo/public-work-case";
import { WorkCaseCardAccess, WorkCaseCards } from "./public-cv-work-cases";
import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin, ImageIcon } from "lucide-react";
import { publicCvEvidenceHref, publicWorkCaseListHref } from "@/lib/terraqo/public-cv-permalink";

export type PublicWorkPreview = {
  id: string;
  title: string;
  summary: string | null;
  date: string;
  location: string | null;
  image: string | null;
  skills: string[];
  status: string;
};

/** Receives only records already authorized for the public CV. */
export function PublicCvWorkShowcase({ username, records, cases }: { cases: PublicWorkCaseCard[]; username: string; records: PublicWorkPreview[] }) {
  return (
    <section id="trabajos" aria-label="Trabajos documentados" className="min-w-0 scroll-mt-24">
      <nav aria-label="Explorar el CV" className="mb-5 flex w-full max-w-lg rounded-xl border border-[#294259] bg-[#0b1926] p-1 text-sm">
        <Link href="#trabajos" className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-[#2869c7] px-3 font-semibold text-white">Trabajos</Link>
        <Link href={`/cv/${encodeURIComponent(username)}/evidencias`} className="flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 text-slate-200 hover:bg-white/10">Bitácoras</Link>
        <Link href="#respaldo" className="flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 text-slate-200 hover:bg-white/10">Respaldo</Link>
      </nav>
      {cases.length > 0 && <WorkCaseCardAccess username={username} cards={cases} page="resumen"><section className="mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">Trabajos agrupados</h2>
          <Link href={publicWorkCaseListHref(username)} prefetch={false} className="inline-flex min-h-11 items-center text-sm text-sky-300">Ver todos los trabajos</Link>
        </div><WorkCaseCards cards={cases} username={username} />
      </section></WorkCaseCardAccess>}
      {records.length > 0 && <h2 className="mb-3 text-xl font-semibold">Bitácoras recientes</h2>}
      <div className="space-y-4">
        {records.map(record => (
          <article key={record.id} className="grid overflow-hidden rounded-xl border border-[#294259] bg-[#0a1927] p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-5">
            <Link href={publicCvEvidenceHref(username, record.id)} aria-label={`Ver imágenes de ${record.title}`} className="relative block aspect-[4/3] overflow-hidden rounded-lg bg-[#112435] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
              {record.image ? (
                // Public media is served through the existing authorization-aware endpoint.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={record.image} alt={record.title} loading="lazy" className="h-full w-full object-cover" />
              ) : <span className="flex h-full flex-col items-center justify-center gap-3 text-sm text-slate-400"><ImageIcon aria-hidden="true" className="h-8 w-8" />Sin imagen pública</span>}
            </Link>
            <div className="flex min-w-0 flex-col pt-4 sm:pt-1">
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] leading-5 text-slate-300">
                <span className="inline-flex items-center gap-2"><CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-sky-400" />{record.date}</span>
                {record.location ? <span className="inline-flex items-start gap-2"><MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />{record.location}</span> : null}
              </div>
              <h2 className="mt-3 text-xl font-semibold leading-snug text-white"><Link href={publicCvEvidenceHref(username, record.id)} className="hover:text-sky-300">{record.title}</Link></h2>
              {record.skills.length ? <ul className="mt-3 flex flex-wrap gap-2">{record.skills.slice(0, 3).map(skill => <li key={skill} className="rounded-full bg-[#203b54] px-3 py-1 text-[13px] text-slate-200">{skill}</li>)}</ul> : null}
              {record.summary ? <p className="my-5 line-clamp-3 text-base leading-6 text-slate-300">{record.summary}</p> : null}
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
                <span className="rounded-full border border-slate-500/30 bg-white/5 px-3 py-2 text-[13px] text-slate-200">{record.status}</span>
                <Link href={publicCvEvidenceHref(username, record.id)} className="inline-flex min-h-11 items-center gap-3 rounded-lg bg-[#2869c7] px-4 text-sm font-semibold text-white hover:bg-[#347bdc]">Ver bitácora<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
              </div>
            </div>
          </article>
        ))}
        {!records.length && !cases.length ? <p className="rounded-xl border border-[#294259] p-6 text-slate-300">Este profesional todavía no ha compartido trabajos públicos.</p> : null}
      </div>
      <Link href={`/cv/${encodeURIComponent(username)}/evidencias`} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm text-sky-300 hover:text-white">Explorar todas las bitácoras<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
    </section>
  );
}
