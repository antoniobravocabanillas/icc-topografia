"use client";

import { useEffect } from "react";

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="mx-auto my-16 max-w-xl rounded-xl border border-red-200 bg-white p-8 text-center shadow-xl">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-700">No pudimos cargar esta sección</p>
      <h1 className="mt-3 font-display text-3xl font-bold">Tu información permanece guardada.</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Actualiza la sección para continuar. Si estabas enviando archivos, revisa su formato y tamaño antes de intentar nuevamente.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-white">Volver a intentar</button>
    </div>
  );
}
