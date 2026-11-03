"use client";

import { useState } from "react";
import { Download, ImageOff } from "lucide-react";

export type SelectionMedia = { id: string; href: string; downloadHref?: string | null };

export function SelectionGallery({ media }: { media: SelectionMedia[] }) {
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const current = media[active] || media[0];
  if (!current) return <p className="rounded-xl border border-[#294057] p-6 text-slate-300">Esta selección no incluye imágenes para este registro.</p>;
  return <section aria-label="Imágenes autorizadas" className="min-w-0">
    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-[#294057] bg-[#08131f]">
      {failed.includes(current.id) ? <p role="status" className="flex items-center gap-3 px-6 text-sm text-slate-300"><ImageOff aria-hidden="true" />Imagen no disponible. El acceso puede haber cambiado.</p> : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={current.href} alt={`Evidencia autorizada ${active + 1}`} className="h-full w-full object-contain" onError={() => setFailed(values => [...values, current.id])} />
      )}
    </div>
    {media.length > 1 ? <div className="mt-3 flex gap-2 overflow-x-auto pb-2" aria-label="Elegir imagen">{media.map((item, index) => <button key={item.id} type="button" aria-label={`Ver imagen ${index + 1}`} aria-pressed={active === index} onClick={() => setActive(index)} className={`h-20 w-24 shrink-0 overflow-hidden rounded-lg border-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${active === index ? "border-sky-400" : "border-[#294057]"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.href} alt="" loading="lazy" className="h-full w-full object-cover" />
    </button>)}</div> : null}
    {current.downloadHref ? <a href={current.downloadHref} className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm text-sky-300"><Download aria-hidden="true" className="h-4 w-4" />Descargar imagen autorizada</a> : null}
  </section>;
}
