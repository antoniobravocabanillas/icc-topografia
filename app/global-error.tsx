"use client";

import { useEffect } from "react";

function isAssetVersionError(error: Error & { digest?: string }) {
  return /chunk|loading css|failed to fetch dynamically imported module|unexpected token/i.test(error.message || "");
}

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Terraqo application error", error);
    const report = JSON.stringify({ source: "global-error", message: error.message || "Unknown client error", stack: error.stack, digest: error.digest, path: window.location.pathname });
    navigator.sendBeacon?.("/api/telemetry/client-error", new Blob([report], { type: "application/json" }));
    if (!isAssetVersionError(error)) return;
    const recoveryKey = `terraqo:asset-recovery:${window.location.pathname}`;
    const lastAttempt = Number(window.sessionStorage.getItem(recoveryKey) || 0);
    if (Date.now() - lastAttempt < 60_000) return;
    window.sessionStorage.setItem(recoveryKey, String(Date.now()));
    window.location.reload();
  }, [error]);

  return (
    <html lang="es">
      <body className="m-0 grid min-h-screen place-items-center bg-[#eef3f6] p-6 font-sans text-[#0e1a26]">
        <main className="w-full max-w-lg rounded-2xl border border-[#d8e0e7] bg-white p-7 shadow-[0_24px_70px_rgba(14,26,38,0.12)]">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#168ca0]">Portal Terraqo</p>
          <h1 className="mt-3 text-2xl font-bold">No pudimos mostrar esta pantalla</h1>
          <p className="mt-3 leading-6 text-[#5b6b7a]">Tu información no se perdió. Intenta recuperar la vista; si el problema continúa, vuelve al panel.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={reset} className="min-h-11 rounded-xl bg-[#4374ba] px-5 font-bold text-white">Intentar nuevamente</button>
            <button type="button" onClick={() => window.location.assign("/")} className="min-h-11 rounded-xl border border-[#bdc9d3] px-5 font-bold">Volver al inicio</button>
          </div>
        </main>
      </body>
    </html>
  );
}
