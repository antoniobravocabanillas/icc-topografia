"use client";

import { useEffect, useState, type ReactNode } from "react";

export type SharedAccess = {
  inviteEmail: string | null;
  scopes: string[];
  lifecycle: string;
  expiresAt: string;
  revokedAt: string | null;
};

/** Presentation only: every read and mutation remains authorized by the server. */
export function SharedAccessRow({ grant, children }: { grant: SharedAccess; children: ReactNode }) {
  const deadline = Date.parse(grant.expiresAt);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const current = Date.now(); setNow(current);
      if (Number.isFinite(deadline) && deadline > current) {
        timer = setTimeout(update, Math.min(deadline - current + 1, 2_147_483_647));
      }
    };
    update();
    return () => { if (timer) clearTimeout(timer); };
  }, [deadline]);
  const revoked = Boolean(grant.revokedAt) || grant.lifecycle === "REVOKED";
  const expired = grant.lifecycle === "EXPIRED" || (now !== null && deadline <= now);
  const active = now !== null && Number.isFinite(deadline) && !revoked && !expired && grant.lifecycle === "ACTIVE";
  const status = revoked ? "Revocado" : expired ? "Vencido" : now === null ? "Comprobando vigencia" : active ? "Vigente" : "No disponible";
  const scopeLabels: Record<string, string> = { VIEW_COLLECTION: "Ver selección", DOWNLOAD_MEDIA: "Descargar archivos autorizados" };
  const permissions = grant.scopes.map(scope => scopeLabels[scope] || "Permiso no reconocido");
  return <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 py-4 last:border-b-0">
    <div className="min-w-0 flex-1 basis-52">
      <p className="break-words text-sm font-semibold text-slate-950">{grant.inviteEmail || "Usuario Terraqo autorizado"}</p>
      <p className="mt-1 text-sm text-slate-600">{permissions.length ? permissions.join(" · ") : "Sin permisos concedidos"}</p>
      <p className="mt-1 text-xs text-slate-600">{Number.isFinite(deadline)
        ? <>Vence el <time dateTime={grant.expiresAt}>{new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" }).format(deadline)}</time> · hora de Perú</>
        : "Vigencia no disponible"}</p>
    </div>
    <span aria-live="polite" className={`text-xs font-semibold ${active ? "text-emerald-700" : "text-slate-600"}`}>{status}</span>
    {active ? children : null}
  </div>;
}
