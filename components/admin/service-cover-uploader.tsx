"use client";

import { ChangeEvent, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";

type UploadedImage = {
  url: string;
  fileName: string;
};

export function ServiceCoverUploader({ initialCover = "", inputName = "cover", label = "Imagen principal del servicio", description = "Se usa como preview de la card y fondo del hero del servicio." }: { initialCover?: string | null; inputName?: string; label?: string; description?: string }) {
  const [cover, setCover] = useState(initialCover || "");
  const [status, setStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    setIsUploading(true);
    setStatus("Subiendo imagen principal...");

    const formData = new FormData();
    formData.append("files", file);

    try {
      const response = await fetch("/api/admin/uploads/project-images", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();

      if (!response.ok) throw new Error(payload.error || "No se pudo subir la imagen.");

      const [uploadedImage] = payload.images as UploadedImage[];
      setCover(uploadedImage.url);
      setStatus(`Imagen subida: ${uploadedImage.fileName}. Guarda para usarla en la card y el hero.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo subir la imagen.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="grid gap-3 text-sm font-semibold md:col-span-2">
      <div className="flex flex-col justify-between gap-3 rounded-md border bg-background p-4 md:flex-row md:items-center">
        <div>
          <span>{label}</span>
          <p className="mt-1 text-xs font-normal text-muted-foreground">{description}</p>
        </div>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => uploadFile(event.target.files)} />
        <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          Upload
        </Button>
      </div>

      {cover ? (
        <div className="overflow-hidden rounded-md border bg-background">
          <div className="relative aspect-[16/7] bg-muted">
            <Image src={cover} alt="Imagen principal del servicio" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" unoptimized />
          </div>
          <div className="truncate p-3 text-xs font-normal text-muted-foreground">{cover}</div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-md border border-dashed bg-muted/45 p-4 text-muted-foreground">
          <ImagePlus className="h-5 w-5" />
          <p className="text-sm font-normal">Aun no hay imagen principal cargada.</p>
        </div>
      )}

      <input type="hidden" name={inputName} value={cover} />
      {status ? <p className="rounded-md bg-emerald-50 p-3 text-xs font-normal text-emerald-900">{status}</p> : null}
    </div>
  );
}
