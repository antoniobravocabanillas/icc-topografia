import { notFound } from "next/navigation";
import Image from "next/image";
import { CalendarDays, Download, MapPin, ShieldCheck } from "lucide-react";
import { getPublicCollectionProjection, ScopedSharingError } from "@/lib/terraqo/scoped-sharing";

export const dynamic = "force-dynamic";

export default async function PublicSelectionPage({ params }: { params: Promise<{ slug: string }> }) {
  if (process.env.TERRAQO_SCOPED_SHARING_V1 !== "true") notFound();
  const { slug } = await params;
  const selection = await getPublicCollectionProjection(slug).catch((error) => {
    if (error instanceof ScopedSharingError && error.status === 404) notFound();
    throw error;
  });

  return (
    <main className="min-h-screen bg-[#071522] text-white">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <header className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0d2438] via-[#0b3145] to-[#08616a] p-7 shadow-2xl sm:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300">Selección profesional verificada por alcance</p>
              <h1 className="mt-4 max-w-4xl font-display text-4xl font-bold leading-tight sm:text-5xl">{selection.title}</h1>
              {selection.description ? <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">{selection.description}</p> : null}
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4 backdrop-blur">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-300"><ShieldCheck className="h-5 w-5" /> Alcance explícito</div>
              <p className="mt-2 text-xs text-slate-400">Política {selection.policyVersion}</p>
            </div>
          </div>
        </header>

        <section className="mt-8 grid gap-6">
          {selection.items.map((item, index) => (
            <article key={`${item.worklogId}-${index}`} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045]">
              <div className="p-6 sm:p-8">
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">Evidencia {String(index + 1).padStart(2, "0")}</p>
                {item.title ? <h2 className="mt-2 font-display text-2xl font-bold sm:text-3xl">{item.title}</h2> : null}
                {item.summary ? <p className="mt-4 max-w-4xl text-[15px] leading-7 text-slate-300">{item.summary}</p> : null}
                {item.outcome ? <div className="mt-5 border-l-2 border-cyan-400 bg-cyan-400/[0.07] px-4 py-3"><p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-300">Resultado</p><p className="mt-1 text-sm leading-6">{item.outcome}</p></div> : null}
                <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-400">
                  {item.occurredAt ? <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" />{new Intl.DateTimeFormat("es-PE", { dateStyle: "long" }).format(new Date(item.occurredAt))}</span> : null}
                  {item.locationLabel ? <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" />{item.locationLabel}</span> : null}
                  {item.contributionRole ? <span className="rounded-full border border-white/10 px-3 py-1">{item.contributionRole}</span> : null}
                </div>
                {[item.responsibilities, item.methods, item.tools].some((values) => values?.length) ? <div className="mt-6 grid gap-4 md:grid-cols-3">{[["Responsabilidades", item.responsibilities], ["Métodos", item.methods], ["Herramientas", item.tools]].map(([label, values]) => Array.isArray(values) && values.length ? <div key={label as string} className="rounded-xl border border-white/10 bg-black/15 p-4"><h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label as string}</h3><ul className="mt-3 space-y-2 text-sm">{values.map((value) => <li key={value}>• {value}</li>)}</ul></div> : null)}</div> : null}
              </div>
              {item.media.length ? <div className="grid gap-px border-t border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">{item.media.map((media) => <a key={media.id} href={media.href} target="_blank" rel="noreferrer" className="group relative block aspect-[4/3] overflow-hidden bg-[#08131d]"><Image src={media.href} alt="Evidencia visual autorizada" fill unoptimized sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover transition duration-500 group-hover:scale-[1.03]" /><span className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/60 backdrop-blur"><Download className="h-4 w-4" /></span></a>)}</div> : null}
            </article>
          ))}
        </section>
        <p className="mt-8 text-center text-xs leading-5 text-slate-500">Esta vista contiene únicamente los campos que su titular autorizó. El enlace puede ser revocado sin alterar la evidencia original.</p>
      </div>
    </main>
  );
}
