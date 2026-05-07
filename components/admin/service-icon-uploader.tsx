"use client";

import { ChangeEvent, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";

type UploadedIcon = {
  url: string;
  fileName: string;
};

export function ServiceIconUploader({ initialIcon = "" }: { initialIcon?: string | null }) {
  const [icon, setIcon] = useState(initialIcon || "");
  const [status, setStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    setIsUploading(true);
    setStatus("Subiendo icono...");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/admin/uploads/service-icons", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();

      if (!response.ok) throw new Error(payload.error || "No se pudo subir el icono.");

      const uploadedIcon = payload.icon as UploadedIcon;
      setIcon(uploadedIcon.url);
      setStatus(`Icono subido: ${uploadedIcon.fileName}. Guarda para publicar los cambios.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo subir el icono.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="grid gap-3 text-sm font-semibold md:col-span-2">
      <div className="flex flex-col justify-between gap-3 rounded-md border bg-background p-4 md:flex-row md:items-center">
        <div>
          <span>Icono del servicio</span>
          <p className="mt-1 text-xs font-normal text-muted-foreground">Sube SVG, JPG, PNG, WebP o AVIF. Tambien puedes dejar un nombre lucide en el campo.</p>
        </div>
        <input ref={fileInputRef} type="file" accept="image/svg+xml,image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => uploadFile(event.target.files)} />
        <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          Upload
        </Button>
      </div>
      {icon && icon.startsWith("http") ? (
        <div className="flex items-center gap-4 rounded-md border bg-white p-4">
          <div className="relative h-14 w-14 shrink-0">
            <Image src={icon} alt="Vista previa del icono" fill sizes="56px" className="object-contain" unoptimized />
          </div>
          <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">{icon}</span>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-md border border-dashed bg-muted/45 p-4 text-muted-foreground">
          <ImagePlus className="h-5 w-5" />
          <p className="text-sm font-normal">{icon || "Aun no hay icono cargado."}</p>
        </div>
      )}
      <input type="hidden" name="icon" value={icon} />
      {status ? <p className="rounded-md bg-emerald-50 p-3 text-xs font-normal text-emerald-900">{status}</p> : null}
    </div>
  );
}
