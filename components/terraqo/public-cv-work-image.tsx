"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon } from "lucide-react";

export function PublicCvWorkImage({ src, title }: { src: string | null; title: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // An eager SSR image may fail before hydration attaches the error handler.
    if (src && image.current?.complete && image.current.naturalWidth === 0) setFailedSource(src);
  }, [src]);
  if (!src || failedSource === src) {
    return <span className="flex h-full flex-col items-center justify-center gap-3 text-sm text-slate-300"><ImageIcon aria-hidden="true" className="h-8 w-8" />Sin imagen pública</span>;
  }
  // The source is an authorization-aware endpoint; never substitute private or project media.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={image} src={src} alt={title} loading="eager" onError={() => setFailedSource(src)} className="h-full w-full object-cover" />;
}
