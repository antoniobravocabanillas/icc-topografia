"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";

type UploadedImage = {
  url: string;
  fileName: string;
};

type ProjectImageUploaderProps = {
  initialImages?: string[];
};

export function ProjectImageUploader({ initialImages = [] }: ProjectImageUploaderProps) {
  const [images, setImages] = useState(initialImages);
  const [status, setStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagesValue = useMemo(() => images.join("\n"), [images]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;

    setIsUploading(true);
    setStatus("Subiendo imagenes del proyecto...");

    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/admin/uploads/project-images", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "No se pudieron subir las imagenes.");
      }

      const uploadedUrls = (payload.images as UploadedImage[]).map((image) => image.url);
      setImages((current) => Array.from(new Set([...current, ...uploadedUrls])));
      setStatus(`${uploadedUrls.length} imagen(es) subida(s). Guarda cambios para publicarlas en el proyecto.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudieron subir las imagenes.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeImage(image: string) {
    setImages((current) => current.filter((item) => item !== image));
    setStatus("Imagen retirada de la galeria. Guarda cambios para actualizar el proyecto.");
  }

  return (
    <div className="grid gap-3 md:col-span-2">
      <div className="flex flex-col justify-between gap-3 rounded-md border bg-background p-4 md:flex-row md:items-center">
        <div>
          <p className="font-semibold">Imagenes del proyecto</p>
          <p className="mt-1 text-xs text-muted-foreground">Sube fotos o evidencias JPG, PNG, WebP o AVIF. Maximo 8 MB por imagen.</p>
        </div>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => uploadFiles(event.target.files)} />
        <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          Subir imagenes
        </Button>
      </div>

      {images.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {images.map((image) => (
            <div key={image} className="overflow-hidden rounded-md border bg-background">
              <div className="relative aspect-[4/3] bg-muted">
                <Image src={image} alt="Imagen del proyecto" fill sizes="(max-width: 1024px) 50vw, 25vw" className="object-cover" unoptimized />
              </div>
              <div className="flex items-center justify-between gap-2 p-2">
                <span className="truncate text-xs text-muted-foreground">{image}</span>
                <Button type="button" variant="ghost" size="icon" aria-label="Quitar imagen" onClick={() => removeImage(image)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-md border border-dashed bg-muted/45 p-4 text-muted-foreground">
          <ImagePlus className="h-5 w-5" />
          <p className="text-sm">Aun no hay imagenes cargadas para este proyecto.</p>
        </div>
      )}

      <input type="hidden" name="images" value={imagesValue} />
      {status ? <p className="rounded-md bg-emerald-50 p-3 text-xs font-medium text-emerald-900">{status}</p> : null}
    </div>
  );
}
