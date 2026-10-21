"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";

type UploadedImage = {
  url: string;
  fileName: string;
};

type ProductImageUploaderProps = {
  initialImages?: string[];
};

export function ProductImageUploader({ initialImages = [] }: ProductImageUploaderProps) {
  const [images, setImages] = useState(initialImages);
  const [status, setStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagesValue = useMemo(() => images.join("\n"), [images]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;

    setIsUploading(true);
    setStatus("Subiendo imagenes a Netlify Blobs...");

    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/admin/uploads/product-images", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo subir la imagen.");
      }

      const uploadedUrls = (payload.images as UploadedImage[]).map((image) => image.url);
      setImages((current) => Array.from(new Set([...current, ...uploadedUrls])));
      setStatus(`${uploadedUrls.length} imagen(es) subida(s). Guarda el producto para publicar los cambios.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo subir la imagen.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeImage(image: string) {
    setImages((current) => current.filter((item) => item !== image));
  }

  return (
    <div className="grid gap-3 text-sm font-semibold">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <span>Imagenes del producto</span>
          <p className="mt-1 text-xs font-normal text-muted-foreground">Sube JPG, PNG, WebP o AVIF. Maximo 5 MB por imagen.</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => uploadFiles(event.target.files)} />
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            Subir imagenes
          </Button>
        </div>
      </div>

      {images.length ? (
        <div className="grid gap-3 md:grid-cols-4">
          {images.map((image) => (
            <div key={image} className="overflow-hidden rounded-md border bg-background">
              <div className="relative aspect-[4/3] bg-muted">
                <Image src={image} alt="Vista previa del producto" fill sizes="25vw" className="object-cover" unoptimized />
              </div>
              <div className="flex items-center justify-between gap-2 p-2">
                <span className="truncate text-xs font-normal text-muted-foreground">{image}</span>
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
          <p className="text-sm font-normal">Aun no hay imagenes cargadas para este producto.</p>
        </div>
      )}

      <input type="hidden" name="images" value={imagesValue} />
      {status ? <p className="text-xs font-normal text-muted-foreground">{status}</p> : null}
    </div>
  );
}
