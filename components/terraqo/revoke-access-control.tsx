"use client";
import { useState } from "react";

export function RevokeAccessControl({ label, subject, pending, onConfirm }: {
  label: string; subject: string; pending: boolean; onConfirm: () => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  if (!reviewing) return <button type="button" disabled={pending} onClick={() => setReviewing(true)} className="min-h-11 rounded-lg border px-3 text-sm font-semibold text-red-700 disabled:opacity-45">{label}</button>;
  return <div className="w-full rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">
    <p className="break-words font-semibold">Revocar: {subject}</p>
    <p className="mt-1 leading-6">Se impedirán nuevas lecturas. Esto no recupera las copias que ya se hayan descargado.</p>
    <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={pending} onClick={() => { onConfirm(); setReviewing(false); }} className="min-h-11 rounded-lg bg-red-700 px-3 font-semibold text-white disabled:opacity-45">Confirmar revocación</button><button type="button" disabled={pending} onClick={() => setReviewing(false)} className="min-h-11 rounded-lg border bg-white px-3 font-semibold">Conservar acceso</button></div>
  </div>;
}
