"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  Copy,
  Eye,
  FileLock2,
  Globe2,
  Image as ImageIcon,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Trash2,
} from "lucide-react";

const fieldOptions = [
  ["title", "Título"],
  ["summary", "Descripción"],
  ["outcome", "Resultado"],
  ["contributionRole", "Rol"],
  ["responsibilities", "Responsabilidades"],
  ["methods", "Métodos"],
  ["tools", "Herramientas"],
  ["occurredAt", "Fecha"],
  ["locationLabel", "Lugar"],
] as const;

type ShareField = (typeof fieldOptions)[number][0];
type Candidate = {
  revisionId: string;
  title: string;
  summary: string;
  occurredAt: string;
  locationLabel: string | null;
  mediaCount: number;
};
type Grant = {
  id: string;
  inviteEmail: string | null;
  subjectUserId: string | null;
  scopes: string[];
  lifecycle: string;
  expiresAt: string;
  revokedAt: string | null;
};
type Collection = {
  id: string;
  title: string;
  description: string | null;
  version: number;
  items: Array<{
    id: string;
    allowedFields: string[];
    includeMedia: boolean;
    revision: { title: string; worklog: { media: Array<{ id: string }> } };
  }>;
  grants: Grant[];
  publicProjection: { slug: string; revokedAt: string | null } | null;
};

type SelectionState = Record<string, { fields: ShareField[]; includeMedia: boolean }>;

function operationKey() {
  return crypto.randomUUID();
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "No se pudo completar la operación.");
  return payload.data;
}

export function ScopedSharingConsole({
  candidates,
  collections,
}: {
  candidates: Candidate[];
  collections: Collection[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selection, setSelection] = useState<SelectionState>({});
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [recipientByCollection, setRecipientByCollection] = useState<Record<string, string>>({});
  const [expiryByCollection, setExpiryByCollection] = useState<Record<string, string>>({});
  const [downloadByCollection, setDownloadByCollection] = useState<Record<string, boolean>>({});

  const selectedCandidates = useMemo(
    () => candidates.filter((candidate) => selection[candidate.revisionId]),
    [candidates, selection],
  );
  const canCreate = Boolean(
    title.trim().length >= 4 &&
      selectedCandidates.length &&
      selectedCandidates.every((candidate) => selection[candidate.revisionId].fields.length),
  );

  function run(action: () => Promise<void>) {
    setMessage(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (error) {
        setMessage({ tone: "error", text: error instanceof Error ? error.message : "Ocurrió un error inesperado." });
      }
    });
  }

  function toggleCandidate(revisionId: string) {
    setSelection((current) => {
      const next = { ...current };
      if (next[revisionId]) delete next[revisionId];
      else next[revisionId] = { fields: [], includeMedia: false };
      return next;
    });
  }

  function toggleField(revisionId: string, field: ShareField) {
    setSelection((current) => {
      const item = current[revisionId];
      if (!item) return current;
      return {
        ...current,
        [revisionId]: {
          ...item,
          fields: item.fields.includes(field)
            ? item.fields.filter((value) => value !== field)
            : [...item.fields, field],
        },
      };
    });
  }

  function createCollection() {
    if (!canCreate) return;
    run(async () => {
      await requestJson("/api/v1/share-collections", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": operationKey() },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          items: selectedCandidates.map((candidate) => ({
            revisionId: candidate.revisionId,
            allowedFields: selection[candidate.revisionId].fields,
            includeMedia: selection[candidate.revisionId].includeMedia,
          })),
        }),
      });
      setSelection({});
      setTitle("");
      setDescription("");
      setMessage({ tone: "ok", text: "Selección privada creada. Aún no se compartió con nadie." });
    });
  }

  return (
    <div className="space-y-8">
      {message ? (
        <div role="status" className={`rounded-xl border px-4 py-3 text-sm font-medium ${message.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
          {message.text}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-technical">
        <div className="grid gap-5 border-b border-slate-200 bg-gradient-to-r from-[#071c2d] via-[#09324a] to-[#0c5360] p-5 text-white lg:grid-cols-[1fr_auto] lg:items-end sm:p-7">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">Nueva selección privada</p>
            <h2 className="mt-2 font-display text-2xl font-bold">Elige exactamente qué puede ver otra persona</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Nada está preseleccionado. Crear la selección no la publica ni envía invitaciones.</p>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm backdrop-blur">
            <strong className="text-xl">{selectedCandidates.length}</strong> registros elegidos
          </div>
        </div>

        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_22rem] sm:p-7">
          <div className="space-y-3">
            {candidates.map((candidate) => {
              const selected = selection[candidate.revisionId];
              return (
                <article key={candidate.revisionId} className={`rounded-xl border p-4 transition ${selected ? "border-primary bg-primary/[0.035] ring-1 ring-primary/20" : "border-slate-200 hover:border-slate-300"}`}>
                  <label className="flex cursor-pointer gap-3">
                    <input type="checkbox" checked={Boolean(selected)} onChange={() => toggleCandidate(candidate.revisionId)} className="mt-1 h-4 w-4 accent-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-base font-bold text-slate-950">{candidate.title}</span>
                      <span className="mt-1 line-clamp-2 block text-sm leading-6 text-slate-600">{candidate.summary}</span>
                      <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>{new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(new Date(candidate.occurredAt))}</span>
                        {candidate.locationLabel ? <span>{candidate.locationLabel}</span> : null}
                        <span>{candidate.mediaCount} archivos</span>
                      </span>
                    </span>
                  </label>
                  {selected ? (
                    <div className="mt-4 border-t border-slate-200 pt-4">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Campos permitidos</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {fieldOptions.map(([value, label]) => (
                          <label key={value} className={`cursor-pointer rounded-full border px-3 py-2 text-xs font-semibold transition ${selected.fields.includes(value) ? "border-primary bg-primary text-white" : "border-slate-200 bg-white text-slate-700 hover:border-primary/40"}`}>
                            <input className="sr-only" type="checkbox" checked={selected.fields.includes(value)} onChange={() => toggleField(candidate.revisionId, value)} />
                            {label}
                          </label>
                        ))}
                      </div>
                      {candidate.mediaCount ? (
                        <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold">
                          <input type="checkbox" checked={selected.includeMedia} onChange={() => setSelection((current) => ({ ...current, [candidate.revisionId]: { ...selected, includeMedia: !selected.includeMedia } }))} className="h-4 w-4 accent-primary" />
                          <ImageIcon className="h-4 w-4 text-primary" /> Incluir archivos normalizados
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
            {!candidates.length ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">Aún no hay revisiones de bitácora disponibles para seleccionar.</p> : null}
          </div>

          <aside className="h-fit rounded-xl border border-slate-200 bg-slate-50 p-5 lg:sticky lg:top-24">
            <FileLock2 className="h-6 w-6 text-primary" />
            <h3 className="mt-3 font-display text-lg font-bold">Vista previa del alcance</h3>
            <label className="mt-5 block text-sm font-semibold">Nombre de la selección
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} className="mt-2 min-h-11 w-full rounded-lg border bg-white px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </label>
            <label className="mt-4 block text-sm font-semibold">Contexto opcional
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1200} rows={3} className="mt-2 w-full resize-y rounded-lg border bg-white px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </label>
            <div className="mt-5 space-y-3">
              {selectedCandidates.map((candidate) => (
                <div key={candidate.revisionId} className="rounded-lg border bg-white p-3 text-sm">
                  <strong>{candidate.title}</strong>
                  <p className="mt-1 text-xs text-slate-500">{selection[candidate.revisionId].fields.length} campos · {selection[candidate.revisionId].includeMedia ? `${candidate.mediaCount} archivos` : "sin archivos"}</p>
                </div>
              ))}
              {!selectedCandidates.length ? <p className="text-sm leading-6 text-slate-500">Selecciona registros y define sus campos. Terraqo no asumirá permisos por ti.</p> : null}
            </div>
            <button disabled={!canCreate || pending} onClick={createCollection} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45">
              {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Crear selección privada
            </button>
          </aside>
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Control de acceso</p>
            <h2 className="mt-1 font-display text-2xl font-bold">Tus selecciones</h2>
          </div>
          <p className="text-sm text-slate-500">{collections.length} activas</p>
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          {collections.map((collection) => {
            const activeProjection = collection.publicProjection && !collection.publicProjection.revokedAt ? collection.publicProjection : null;
            return (
              <article key={collection.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-technical sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div><h3 className="font-display text-xl font-bold">{collection.title}</h3><p className="mt-1 text-sm leading-6 text-slate-500">{collection.description || "Sin descripción adicional."}</p></div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">v{collection.version}</span>
                </div>
                <div className="mt-4 grid gap-2">
                  {collection.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border bg-slate-50 px-3 py-2 text-sm">
                      <span className="font-semibold">{item.revision.title}</span>
                      <span className="text-xs text-slate-500">{item.allowedFields.length} campos{item.includeMedia ? ` · ${item.revision.worklog.media.length} archivos` : ""}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /><h4 className="text-sm font-bold">Conceder acceso privado</h4></div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input type="email" value={recipientByCollection[collection.id] || ""} onChange={(event) => setRecipientByCollection((current) => ({ ...current, [collection.id]: event.target.value }))} placeholder="correo@empresa.com" className="min-h-11 rounded-lg border bg-white px-3 text-sm outline-none focus:border-primary" />
                    <input type="datetime-local" value={expiryByCollection[collection.id] || ""} onChange={(event) => setExpiryByCollection((current) => ({ ...current, [collection.id]: event.target.value }))} className="min-h-11 rounded-lg border bg-white px-3 text-sm outline-none focus:border-primary" />
                  </div>
                  <label className="mt-3 flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" checked={Boolean(downloadByCollection[collection.id])} onChange={(event) => setDownloadByCollection((current) => ({ ...current, [collection.id]: event.target.checked }))} className="h-4 w-4 accent-primary" /> Permitir descargar archivos autorizados</label>
                  <button disabled={pending || !recipientByCollection[collection.id] || !expiryByCollection[collection.id]} onClick={() => run(async () => {
                    const result = await requestJson(`/api/v1/share-collections/${collection.id}/grants`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": operationKey() }, body: JSON.stringify({ expectedVersion: collection.version, inviteEmail: recipientByCollection[collection.id], scopes: downloadByCollection[collection.id] ? ["VIEW_COLLECTION", "DOWNLOAD_MEDIA"] : ["VIEW_COLLECTION"], expiresAt: new Date(expiryByCollection[collection.id]).toISOString() }) });
                    setMessage({ tone: "ok", text: result.invitationToken ? "Acceso guardado. La invitación aún no se envió; copia el enlace desde el flujo de invitación." : "Acceso ya registrado anteriormente." });
                  })} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary bg-white px-4 text-sm font-bold text-primary hover:bg-primary hover:text-white disabled:opacity-45"><Check className="h-4 w-4" /> Guardar permiso</button>
                </div>
                {collection.grants.length ? <div className="mt-4 space-y-2">{collection.grants.map((grant) => <div key={grant.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs"><span><strong>{grant.inviteEmail || "Usuario Terraqo"}</strong><br /><span className="text-slate-500">{grant.lifecycle} · vence {new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(new Date(grant.expiresAt))}</span></span>{grant.lifecycle === "ACTIVE" ? <span className="flex gap-1"><button aria-label="Copiar enlace privado" onClick={async () => { await navigator.clipboard.writeText(`${window.location.origin}/portal/selecciones/${collection.id}`); setMessage({ tone: "ok", text: "Enlace privado copiado. Solo funcionará para la identidad autorizada y dentro de la vigencia." }); }} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-primary hover:bg-primary/5"><Copy className="h-4 w-4" /></button><button aria-label="Revocar acceso" disabled={pending} onClick={() => run(async () => { await requestJson(`/api/v1/share-collections/${collection.id}/grants`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grantId: grant.id, expectedVersion: collection.version, reason: "Revocado por el titular" }) }); setMessage({ tone: "ok", text: "Acceso revocado de inmediato." }); })} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></span> : null}</div>)}</div> : null}
                <div className="mt-5 flex flex-wrap gap-2 border-t pt-5">
                  {activeProjection ? <><Link href={`/selecciones/${activeProjection.slug}`} target="_blank" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white"><Eye className="h-4 w-4" /> Ver página pública</Link><button disabled={pending} onClick={() => run(async () => { await requestJson(`/api/v1/share-collections/${collection.id}/projection`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: collection.version }) }); setMessage({ tone: "ok", text: "La página pública dejó de admitir nuevas lecturas." }); })} className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-bold text-red-700 hover:bg-red-50">Revocar publicación</button></> : <button disabled={pending} onClick={() => run(async () => { await requestJson(`/api/v1/share-collections/${collection.id}/projection`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: collection.version }) }); setMessage({ tone: "ok", text: "Selección publicada con un enlace opaco y revocable." }); })} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white hover:bg-primary/90"><Globe2 className="h-4 w-4" /> Publicar selección</button>}
                </div>
              </article>
            );
          })}
          {!collections.length ? <div className="rounded-2xl border border-dashed bg-white p-10 text-center xl:col-span-2"><FileLock2 className="mx-auto h-7 w-7 text-slate-400" /><h3 className="mt-3 font-display text-lg font-bold">Aún no tienes selecciones</h3><p className="mt-2 text-sm text-slate-500">Crea la primera sin otorgar permisos automáticos.</p></div> : null}
        </div>
      </section>
    </div>
  );
}
