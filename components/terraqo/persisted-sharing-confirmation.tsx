"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { completeComposerOperation, type ComposerOperation } from "./sharing-composer-operation";
import { persistedConfirmationKey, persistedSharingGroups, type OwnerSharingReview, type ResumableCollection } from "./persisted-sharing-review";

export function PersistedSharingConfirmation({ collection, reviews }: { collection: ResumableCollection; reviews: OwnerSharingReview[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const operations = useRef(new Map<string, ComposerOperation>());
  const [result, setResult] = useState<{ error: boolean; text: string; path?: string } | null>(null);
  const groups = persistedSharingGroups(collection, reviews);
  if (!groups.length) return null;

  async function confirm(group: (typeof groups)[number]) {
    if (lock.current || !group.ready) return;
    if (group.target && Date.parse(group.target.expiresAt) <= Date.now() + 300_000) {
      setResult({ error: true, text: "La vigencia aprobada venció o le quedan menos de cinco minutos. No se ampliará automáticamente; solicita una nueva autorización." });
      return;
    }
    lock.current = true;
    setBusy(true);
    setResult(null);
    try {
      let operation = operations.current.get(group.key);
      if (!operation) {
        const key = await persistedConfirmationKey(collection.id, group.version, group.rows);
        operation = { key, grantKey: key, body: "", destination: group.invited ? "invited" : "public",
          collection: { id: collection.id, version: group.version }, recipient: group.target?.email ?? "",
          expiresAt: group.target?.expiresAt ?? "", download: group.target?.download ?? false,
          listOnCv: group.listOnCv, workCase: group.workCase };
        operations.current.set(group.key, operation);
      }
      const confirmed = await completeComposerOperation(operation);
      setResult({ error: false, text: confirmed.text, path: confirmed.path });
      router.refresh();
    } catch (error) {
      setResult({ error: true, text: `${error instanceof Error ? error.message : "No se pudo confirmar el destino."} Los datos aprobados se conservan en las autorizaciones. Actualiza su estado o reintenta sin cambiar el destinatario, la vigencia ni los permisos.` });
    } finally { lock.current = false; setBusy(false); }
  }

  return <section aria-label="Confirmaciones de autorizaciones guardadas" className="mt-5 space-y-4 border-t border-slate-200 pt-5">
    <h4 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />Retomar destino autorizado</h4>
    <p className="text-sm leading-6 text-slate-600">Estas solicitudes pertenecen a tu cuenta y están guardadas en el servidor. Puedes cerrar esta página y volver cuando las empresas decidan.</p>
    {groups.map(group => {
      const expired = Boolean(group.target && Date.parse(group.target.expiresAt) <= Date.now() + 300_000);
      return <div key={group.key} role="group" aria-label={`${group.invited ? "Acceso privado" : "Publicación pública"} solicitado · versión ${group.version}`} className="space-y-3 border-t border-slate-200 pt-4 text-sm">
        <p className="font-semibold">{group.invited ? "Personas invitadas" : group.listOnCv ? "Público · Enlace y CV público" : "Página pública"} · versión {group.version}</p>
        {group.target && <dl className="space-y-2 break-words text-slate-700">
          <div><dt className="font-semibold">Correo autorizado</dt><dd>{group.target.email}</dd></div>
          <div><dt className="font-semibold">Fin exacto de la vigencia</dt><dd><time dateTime={group.target.expiresAt}>{new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "medium", timeStyle: "long" }).format(new Date(group.target.expiresAt))}</time><span className="mt-1 block text-xs">{group.target.expiresAt} · No se recalcula al confirmar.</span></dd></div>
          <div><dt className="font-semibold">Permisos autorizados</dt><dd>{group.target.download ? "Ver selección y descargar archivos autorizados" : "Ver selección · Sin descarga"}</dd></div>
        </dl>}
        {!group.invited && <p className="leading-6 text-slate-600">La selección tendrá un enlace público incluso si tu perfil aún no está publicado.{group.listOnCv ? " También aparecerá en tu CV cuando el perfil tenga el CV público." : ""}</p>}
        <ul className="space-y-1 text-slate-600">{group.rows.map(row => <li key={row.id}>{row.workspace.name}: {row.revokedAt ? "Revocada" : ({ APPROVED: "Autorizada", PENDING: "Pendiente", DECLINED: "No autorizada", CHANGES_REQUESTED: "Cambios solicitados" }[row.decision] ?? "Sin confirmación")}</li>)}</ul>
        <p className="leading-6 text-slate-600">{expired ? "La vigencia aprobada venció o le quedan menos de cinco minutos. Se requiere una nueva autorización; no se ampliará automáticamente." : group.problem}</p>
        <button type="button" disabled={busy || !group.ready || expired || (result?.error === false)} onClick={() => confirm(group)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-bold text-white hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-45">
          {busy && <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />}{group.invited ? "Confirmar acceso autorizado" : "Confirmar publicación autorizada"}
        </button>
      </div>;
    })}
    <button type="button" disabled={busy} onClick={() => router.refresh()} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Actualizar autorizaciones</button>
    {result && <div role="status" className={`break-words rounded-lg border p-3 text-sm leading-6 ${result.error ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
      {result.text}{result.path && <label className="mt-3 block font-semibold">Enlace del destino confirmado<input readOnly value={`${window.location.origin}${result.path}`} className="mt-2 min-h-11 w-full rounded-lg border bg-white px-3 text-slate-900" /></label>}
    </div>}
  </section>;
}
