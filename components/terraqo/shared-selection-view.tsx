import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays, Eye, ImageIcon, MapPin } from "lucide-react";
import { SelectionGallery, type SelectionMedia } from "@/components/terraqo/selection-gallery";

type SelectionItem = {
  worklogId: string;
  title?: string | null;
  summary?: string | null;
  outcome?: string | null;
  occurredAt?: Date | string | null;
  locationLabel?: string | null;
  contributionRole?: string | null;
  responsibilities?: string[];
  methods?: string[];
  tools?: string[];
  media: SelectionMedia[];
};
export type SharedSelection = { title: string; description: string | null; expiresAt?: Date | string; items: SelectionItem[] };

// The index addresses this authorized selection, never the unrestricted source record.
export function selectionRecordIndex(value: string | string[] | undefined, count: number) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return -1;
  const index = Number(value) - 1;
  return Number.isSafeInteger(index) && index < count ? index : -1;
}

const date = (value: Date | string) => new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "medium" }).format(new Date(value));
const action = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#355471] px-4 text-sm font-semibold text-sky-300 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300";

export function SharedSelectionView({ selection, basePath, recordIndex }: { selection: SharedSelection; basePath: string; recordIndex?: number }) {
  const item = recordIndex === undefined ? undefined : selection.items[recordIndex];
  return <div className="min-h-screen bg-[#07111e] px-4 py-8 text-[#f4f7fb] sm:px-8">
    <div className="mx-auto max-w-[1440px]">
      {item ? <Link href={basePath} prefetch={false} className={action}><ArrowLeft aria-hidden="true" className="h-4 w-4" />Volver a la selección</Link> : null}
      <header className="mb-8 mt-4">
        <h1 className="max-w-4xl text-3xl font-semibold leading-tight text-[#f4f7fb] sm:text-4xl">{item ? item.title || `Registro compartido ${(recordIndex ?? 0) + 1}` : selection.title}</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-[#afbdcd]">{item ? "Detalle incluido en esta selección" : selection.description || "Evidencias compartidas para tu revisión."}</p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2.2fr)_minmax(270px,1fr)]">
        <div className="min-w-0">
          {item ? <>
            <SelectionGallery key={recordIndex} media={item.media} />
            <section aria-label="Información autorizada" className="mt-6 space-y-5 rounded-xl border border-[#294057] bg-[#101d2d] p-5 sm:p-6">
              <ItemMetadata item={item} />
              {item.summary ? <div><h2 className="text-lg font-semibold text-white">Contribución documentada</h2><p className="mt-2 whitespace-pre-line text-base leading-7 text-slate-300">{item.summary}</p></div> : null}
              {item.outcome ? <div><h2 className="text-lg font-semibold text-white">Resultado declarado</h2><p className="mt-2 whitespace-pre-line text-base leading-7 text-slate-300">{item.outcome}</p></div> : null}
              {item.contributionRole ? <div><h2 className="text-lg font-semibold text-white">Participación</h2><p className="mt-2 text-slate-300">{item.contributionRole}</p></div> : null}
              {([['Responsabilidades', item.responsibilities], ['Métodos', item.methods], ['Herramientas', item.tools]] as const).map(([label, values]) => values?.length ? <div key={label}><h2 className="text-lg font-semibold text-white">{label}</h2><ul className="mt-2 list-inside list-disc space-y-2 text-slate-300">{values.map((value, index) => <li key={index}>{value}</li>)}</ul></div> : null)}
              {!item.summary && !item.outcome && !item.contributionRole && !item.occurredAt && !item.locationLabel && !item.responsibilities?.length && !item.methods?.length && !item.tools?.length ? <p className="text-slate-300">No se incluyeron otros campos en esta selección.</p> : null}
            </section>
            <nav aria-label="Recorrer selección" className="mt-5 flex flex-wrap justify-between gap-3">
              {recordIndex! > 0 ? <Link prefetch={false} href={`${basePath}?registro=${recordIndex}`} className={action}><ArrowLeft aria-hidden="true" className="h-4 w-4" />Anterior</Link> : <span />}
              {recordIndex! < selection.items.length - 1 ? <Link prefetch={false} href={`${basePath}?registro=${recordIndex! + 2}`} className={action}>Siguiente<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link> : null}
            </nav>
          </> : <section aria-label="Registros compartidos">
            <h2 className="mb-4 text-xl font-semibold text-white">{selection.items.length} registros compartidos</h2>
            <div className="space-y-4">{selection.items.map((record, index) => <article key={`${record.worklogId}-${index}`} className="grid gap-5 rounded-xl border border-[#294057] bg-[#101d2d] p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <Link href={`${basePath}?registro=${index + 1}`} prefetch={false} aria-label={`Ver imágenes del registro ${index + 1}`} className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-[#08131f]">
                {record.media[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={record.media[0].href} alt="Evidencia incluida en la selección" loading="lazy" className="h-full w-full object-cover" />
                ) : <span className="flex items-center gap-2 text-sm text-slate-400"><ImageIcon aria-hidden="true" className="h-5 w-5" />Sin imagen compartida</span>}
              </Link>
              <div className="flex min-w-0 flex-col items-start gap-4 py-1">
                <h3 className="text-xl font-semibold text-white">{record.title || `Registro compartido ${index + 1}`}</h3>
                <ItemMetadata item={record} />
                {record.summary ? <p className="line-clamp-3 text-base leading-6 text-slate-300">{record.summary}</p> : null}
                <Link href={`${basePath}?registro=${index + 1}`} prefetch={false} className={`${action} mt-auto`}>Ver detalle<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
              </div>
            </article>)}</div>
            {!selection.items.length ? <p className="rounded-xl border border-[#294057] p-6 text-slate-300">No hay registros disponibles en esta selección.</p> : null}
          </section>}
        </div>
        <aside className="rounded-xl border border-[#294057] bg-[#101d2d] p-6">
          <h2 className="text-xl font-semibold text-white">Alcance compartido</h2>
          <dl className="mt-5 space-y-5 text-sm text-slate-300">
            <div><dt className="flex items-center gap-2 text-slate-400"><Eye aria-hidden="true" className="h-4 w-4" />Tipo de acceso</dt><dd className="mt-2 text-white">{selection.expiresAt ? "Acceso autorizado · Solo lectura" : "Selección pública · Solo lectura"}</dd></div>
            {selection.expiresAt ? <div><dt className="text-slate-400">Vigente hasta</dt><dd className="mt-2 text-white">{date(selection.expiresAt)} · Hora de Perú</dd></div> : null}
            <div><dt className="text-slate-400">Contenido disponible</dt><dd className="mt-2 text-white">{selection.items.length} registros</dd></div>
          </dl>
          <p className="mt-6 border-t border-[#294057] pt-5 text-sm leading-6 text-slate-300">Solo se muestran los campos y adjuntos incluidos por su titular. Compartir una selección no certifica el trabajo ni habilita acceso al registro completo.</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">El acceso puede retirarse. Las descargas aparecen únicamente cuando están autorizadas.</p>
        </aside>
      </div>
    </div>
  </div>;
}

function ItemMetadata({ item }: { item: SelectionItem }) {
  return <div className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-slate-300">
    {item.occurredAt ? <span className="inline-flex items-center gap-2"><CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-sky-400" />{date(item.occurredAt)}</span> : null}
    {item.locationLabel ? <span className="inline-flex items-center gap-2"><MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-sky-400" />{item.locationLabel}</span> : null}
  </div>;
}
