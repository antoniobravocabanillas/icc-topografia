"use client";

import { useEffect, useState } from "react";
import { Eye, FileText, X } from "lucide-react";

type ProfessionalDocumentPreviewProps = {
  href: string;
  title: string;
  fileName: string;
  contentType: string;
};

export function ProfessionalDocumentPreview({ href, title, fileName, contentType }: ProfessionalDocumentPreviewProps) {
  const [open, setOpen] = useState(false);
  const canPreview = contentType === "application/pdf" || contentType.startsWith("image/");

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-2 rounded-md border bg-background px-3 text-xs font-semibold transition-colors hover:border-primary hover:text-primary"
      >
        <Eye className="h-3.5 w-3.5" />
        {title}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/75 p-4" role="dialog" aria-modal="true" aria-label={`Vista previa de ${title}`}>
          <div className="flex h-[min(860px,92vh)] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase text-primary">{title}</p>
                <p className="truncate font-semibold text-slate-950">{fileName}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-md border text-slate-800" aria-label="Cerrar vista previa">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 bg-slate-100 p-3">
              {canPreview ? (
                <iframe title={fileName} src={`${href}?inline=1`} className="h-full w-full rounded-md bg-white" />
              ) : (
                <div className="grid h-full place-items-center p-8 text-center text-slate-800">
                  <div>
                    <FileText className="mx-auto h-12 w-12 text-primary" />
                    <p className="mt-4 font-semibold">Este formato requiere descarga para abrirse con su aplicacion compatible.</p>
                    <a href={href} className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Descargar archivo protegido</a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
