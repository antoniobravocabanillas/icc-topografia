"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Terraqo admin route error", error);
    const report = JSON.stringify({ source: "admin-error", message: error.message || "Unknown admin client error", stack: error.stack, digest: error.digest, path: window.location.pathname });
    navigator.sendBeacon?.("/api/telemetry/client-error", new Blob([report], { type: "application/json" }));
  }, [error]);

  return (
    <section className="mx-auto mt-12 max-w-xl rounded-2xl border bg-white p-7 shadow-technical">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Panel Terraqo</p>
      <h1 className="mt-3 font-display text-2xl font-bold">Esta sección no terminó de cargar</h1>
      <p className="mt-3 leading-6 text-muted-foreground">La operación anterior permanece guardada. Puedes reintentar la carga sin volver a enviar el formulario.</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button type="button" onClick={reset}>Reintentar</Button>
        <Button type="button" variant="outline" onClick={() => window.location.reload()}>Actualizar panel</Button>
      </div>
    </section>
  );
}
