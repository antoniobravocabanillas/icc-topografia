"use client";

import { ChangeEvent, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";

type UploadedLogo = {
  url: string;
  fileName: string;
};

type ClientLogoUploaderProps = {
  initialLogoUrl?: string | null;
  inputName?: string;
  label?: string;
  description?: string;
};

export function ClientLogoUploader({
  initialLogoUrl,
  inputName = "logoUrl",
  label = "Logo del cliente",
  description = "Sube SVG, JPG, PNG, WebP o AVIF. Máximo 3 MB."
}: ClientLogoUploaderProps) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl || "");
  const [status, setStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    setIsUploading(true);
    setStatus("Subiendo logo...");

    const formData = new FormData();
    formData.append("files", file);

    try {
      const response = await fetch("/api/admin/uploads/client-logos", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo subir el logo.");
      }

      const [uploadedLogo] = payload.logos as UploadedLogo[];
      setLogoUrl(uploadedLogo.url);
      setStatus(`Logo subido: ${uploadedLogo.fileName}. Guarda para publicar los cambios.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo subir el logo.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="grid gap-3 text-sm font-semibold md:col-span-2">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <span>{label}</span>
          <p className="mt-1 text-xs font-normal text-muted-foreground">{description}</p>
        </div>
        <input ref={fileInputRef} type="file" accept="image/svg+xml,image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => uploadFiles(event.target.files)} />
        <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          Upload
        </Button>
      </div>

      {logoUrl ? (
        <div className="flex items-center gap-4 rounded-md border bg-white p-4">
          <div className="relative h-16 w-36 shrink-0">
            <Image src={logoUrl} alt="Vista previa del logo" fill sizes="144px" className="object-contain" unoptimized />
          </div>
          <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">{logoUrl}</span>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-md border border-dashed bg-muted/45 p-4 text-muted-foreground">
          <ImagePlus className="h-5 w-5" />
          <p className="text-sm font-normal">Aún no hay logo cargado.</p>
        </div>
      )}

      <input type="hidden" name={inputName} value={logoUrl} />
      {status ? <p className="text-xs font-normal text-muted-foreground">{status}</p> : null}
    </div>
  );
}
