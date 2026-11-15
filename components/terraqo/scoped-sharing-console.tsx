"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { completeComposerOperation, type ComposerOperation, type SharingDestination } from "./sharing-composer-operation";
import { PersistedSharingConfirmation } from "./persisted-sharing-confirmation";
import type { OwnerSharingReview } from "./persisted-sharing-review";
import { RevokeAccessControl } from "./revoke-access-control";
import {
  Check,
  Copy,
  Eye,
  FileLock2,
  Globe2,
  Image as ImageIcon,
  KeyRound,
  LockKeyhole,
  Users,
  LoaderCircle,
  ShieldCheck,
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
  outcome?: string | null;
  contributionRole?: string | null;
  responsibilities?: string[];
  methods?: string[];
  tools?: string[];
  occurredAt: string;
  locationLabel: string | null;
  mediaCount: number;
  previewMediaIds: string[];
  belongsToCompany: boolean;
};
function SelectionPhotoPreview({ ids }: { ids: string[] }) {
  const [index, setIndex] = useState(0);
  const current = Math.min(index, ids.length - 1);
  if (current < 0) return null;
  return <figure className="mt-3 overflow-hidden rounded-xl border bg-white">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img alt={`Archivo seleccionado ${current + 1} de ${ids.length}`}
      src={`/api/terraqo/worklog/evidence/${encodeURIComponent(ids[current])}`}
      className="aspect-video w-full bg-slate-100 object-contain" />
    {ids.length > 1 && <figcaption className="flex items-center justify-between gap-1 px-2 text-sm">
      <button type="button" aria-label="Archivo anterior" disabled={current === 0} onClick={() => setIndex(current - 1)} className="min-h-11 px-2 text-primary disabled:opacity-40">Anterior</button>
      <span aria-live="polite">{current + 1} de {ids.length}</span>
      <button type="button" aria-label="Archivo siguiente" disabled={current === ids.length - 1} onClick={() => setIndex(current + 1)} className="min-h-11 px-2 text-primary disabled:opacity-40">Siguiente</button>
    </figcaption>}
  </figure>;
}
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
  caseOffer?: { id: string; version: number; title: string };
  id: string;
  title: string;
  description: string | null;
  version: number;
  items: Array<{
    id: string;
    revisionId?: string;
    mediaIds?: string[];
    allowedFields: string[];
    includeMedia: boolean;
    revision: { title: string; worklog: { workspaceId?: string | null; media: Array<{ id: string }> } };
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
  publicationReviewEnabled = false,
  ownerReviews = [],
}: {
  candidates: Candidate[];
  collections: Collection[];
  publicationReviewEnabled?: boolean;
  ownerReviews?: OwnerSharingReview[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [destination, setDestination] = useState<SharingDestination>("private");
  const [recipient, setRecipient] = useState("");
  const [expiryDays, setExpiryDays] = useState("7");
  const [composerLocked, setComposerLocked] = useState(false);
  const [composerAwaitingReview, setComposerAwaitingReview] = useState(false);
  const [composerComplete, setComposerComplete] = useState(false);
  const [composerLink, setComposerLink] = useState("");
  const composerOperation = useRef<ComposerOperation | null>(null);
  const composerBusy = useRef(false);
  const [selection, setSelection] = useState<SelectionState>({});
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [recipientByCollection, setRecipientByCollection] = useState<Record<string, string>>({});
  const [expiryByCollection, setExpiryByCollection] = useState<Record<string, string>>({});
  const [caseConsent, setCaseConsent] = useState<Record<string, string>>({});
  const [downloadByCollection, setDownloadByCollection] = useState<Record<string, boolean>>({});

  const selectedCandidates = useMemo(
    () => candidates.filter((candidate) => selection[candidate.revisionId]),
    [candidates, selection],
  );
  const canCreate = Boolean(
    title.trim().length >= 4 &&
      selectedCandidates.length > 0 && selectedCandidates.length <= 100 &&
      (destination !== "invited" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim())) &&
      selectedCandidates.every((candidate) => selection[candidate.revisionId].fields.length),
  );

  const previewState = composerComplete
    ? destination === "public" ? "Publicación confirmada" : destination === "invited" ? "Acceso autorizado" : "Privado · Solo tú"
    : composerAwaitingReview ? "Autorización solicitada · Confirma tras la aprobación"
    : composerLocked ? "Destino por confirmar" : "Aún no compartido";

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

  function resetComposer() {
    composerOperation.current = null;
    setComposerLocked(false);
    setComposerComplete(false);
    setComposerAwaitingReview(false);
    setComposerLink("");
    setSelection({});
    setTitle("");
    setDescription("");
    setRecipient("");
    setDestination("private");
    setMessage(null);
  }

  function createCollection() {
    if (composerBusy.current || (!canCreate && !composerOperation.current)) return;
    if (!composerOperation.current) composerOperation.current = {
      key: operationKey(), grantKey: operationKey(), destination,
      requestReview: destination !== "private" && publicationReviewEnabled && selectedCandidates.some(candidate => candidate.belongsToCompany),
      recipient: recipient.trim().toLowerCase(),
      expiresAt: new Date(Date.now() + Number(expiryDays) * 86_400_000).toISOString(),
      body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined,
        items: selectedCandidates.map(candidate => ({ revisionId: candidate.revisionId,
          allowedFields: selection[candidate.revisionId].fields, includeMedia: selection[candidate.revisionId].includeMedia })),
      }),
    };
    composerBusy.current = true;
    setComposerLocked(true);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await completeComposerOperation(composerOperation.current!);
        setComposerLink(result.path ? `${window.location.origin}${result.path}` : "");
        setComposerComplete(!result.awaitingReview);
        setComposerAwaitingReview(Boolean(result.awaitingReview));
        setMessage({ tone: "ok", text: result.text });
        router.refresh();
      } catch (error) {
        const saved = composerOperation.current?.collection;
        setMessage({ tone: "error", text: `${saved ? "La selección está guardada. El destino todavía no está confirmado. " : "No se pudo confirmar el guardado. "}${error instanceof Error ? error.message : "Reintenta la misma operación."} Conservamos el contenido de este intento mientras permanezcas en esta página.` });
      } finally { composerBusy.current = false; }
    });
  }

  return (
    <div className="space-y-8">
      {message ? (
        <div role="status" className={`rounded-xl border px-4 py-3 text-sm font-medium ${message.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
          {message.text}
        </div>
      ) : null}

      <section aria-label="Publicar y compartir selección" className="overflow-hidden rounded-2xl border border-[#294057] bg-[#101f30] text-slate-100">
        <div className="grid gap-5 border-b border-[#294057] bg-[#071c2d] p-5 text-white lg:grid-cols-[1fr_auto] lg:items-end sm:p-7">
          <div>
            <h2 className="mt-2 font-display text-2xl font-bold">Tú decides qué compartir</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Revisa la selección, define quién puede verla y guarda sus permisos. No se envían correos automáticamente.</p>
          </div>
          <div className="px-4 py-3 text-sm">
            <strong className="text-xl">{selectedCandidates.length}</strong> {selectedCandidates.length === 1 ? "registro elegido" : "registros elegidos"}
          </div>
        </div>

        <fieldset disabled={composerLocked || pending} className="grid min-w-0 gap-6 p-5 disabled:opacity-90 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] sm:p-7">
          <div className="min-w-0 space-y-3">
            <h3 className="font-display text-lg font-bold">Selección de registros</h3>
            {candidates.map((candidate) => {
              const selected = selection[candidate.revisionId];
              return (
                <article key={candidate.revisionId} className={`rounded-xl border p-4 transition ${selected ? "border-sky-400 bg-[#142c43] ring-1 ring-sky-400/20" : "border-[#294057] hover:border-[#43617d]"}`}>
                  <label className="flex cursor-pointer gap-3">
                    <input type="checkbox" checked={Boolean(selected)} onChange={() => toggleCandidate(candidate.revisionId)} className="mt-1 h-4 w-4 accent-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-base font-bold text-slate-100">{candidate.title}</span>
                      <span className="mt-1 line-clamp-2 block text-sm leading-6 text-slate-300">{candidate.summary}</span>
                      <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
                        <span>{new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(new Date(candidate.occurredAt))}</span>
                        {candidate.locationLabel ? <span>{candidate.locationLabel}</span> : null}
                        <span>{candidate.mediaCount} archivos</span>
                      </span>
                    </span>
                  </label>
                  {selected ? (
                    <div className="mt-4 border-t border-[#294057] pt-4">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-300">Campos permitidos</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {fieldOptions.map(([value, label]) => (
                          <label key={value} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-[#294057] px-3 py-2 text-xs font-semibold transition focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 ${selected.fields.includes(value) ? "border-sky-400 bg-primary text-white" : "border-[#294057] bg-[#101f30] text-slate-200 hover:border-sky-400/40"}`}>
                            <input className="h-4 w-4 accent-primary" type="checkbox" checked={selected.fields.includes(value)} onChange={() => toggleField(candidate.revisionId, value)} />
                            {label}
                          </label>
                        ))}
                      </div>
                      {candidate.mediaCount > 0 && !candidate.previewMediaIds.length ? <p className="mt-3 text-sm text-slate-300">Puedes compartir los campos de este registro. Sus adjuntos incluyen formatos que esta selección no admite.</p> : null}
                      {candidate.previewMediaIds.length ? (
                        <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-[#294057] bg-[#101f30] px-3 text-sm font-semibold">
                          <input type="checkbox" checked={selected.includeMedia} onChange={() => setSelection((current) => ({ ...current, [candidate.revisionId]: { ...selected, includeMedia: !selected.includeMedia } }))} className="h-4 w-4 accent-primary" />
                          <ImageIcon className="h-4 w-4 text-sky-300" /> Incluir archivos normalizados
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
            {!candidates.length ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-300">Aún no hay revisiones de bitácora disponibles para seleccionar.</p> : null}
            <fieldset className="min-w-0 space-y-2 border-t border-[#294057] pt-5">
              <legend className="pt-5 font-display text-lg font-bold">Visibilidad de la selección</legend>
              <p className="pb-2 text-sm text-slate-300">Define quién puede ver los registros seleccionados.</p>
              {([
                ["private", "Privado (Solo yo)", "Solo tú puedes ver esta selección.", LockKeyhole],
                ["public", "Público", "La selección tendrá un enlace público. También aparecerá en tu CV cuando el perfil tenga el CV público. Solo se mostrarán los campos y archivos autorizados.", Globe2],
                ["invited", "Personas invitadas", "Solo la persona con el correo autorizado y verificado podrá verla al iniciar sesión.", Users],
              ] as const).map(([value, label, detail, Icon]) => <label key={value} className={`flex min-h-20 cursor-pointer items-center gap-3 rounded-lg border p-3 focus-within:ring-2 focus-within:ring-primary ${destination === value ? "border-sky-400 bg-primary/5" : "border-[#294057]"}`}>
                <input type="radio" name="sharing-destination" value={value} checked={destination === value} onChange={() => setDestination(value)} className="h-4 w-4 shrink-0 accent-primary" />
                <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-sky-300" />
                <span className="min-w-0"><span className="block text-sm font-bold">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-300">{detail}</span></span>
              </label>)}
            </fieldset>
          </div>

          <aside className="min-w-0 h-fit rounded-xl border border-[#294057] bg-[#0a1726] p-5">
            <FileLock2 className="h-6 w-6 text-sky-300" />
            <h3 className="mt-3 font-display text-lg font-bold">Vista previa · {previewState}</h3>
            <div className="mt-5 space-y-3">
              {selectedCandidates.map((candidate) => (
                <article aria-label="Contenido que se compartirá" key={candidate.revisionId} className="min-w-0 rounded-lg border border-[#294057] bg-[#101f30] p-4 text-sm">
                  <p className="text-xs font-semibold text-sky-300">Vista previa · {previewState}</p>
                  {selection[candidate.revisionId].includeMedia && <SelectionPhotoPreview ids={candidate.previewMediaIds} />}
                  <dl className="mt-3 space-y-3 break-words">
                    {fieldOptions.filter(([field]) => selection[candidate.revisionId].fields.includes(field)).map(([field, label]) => {
                      const value = candidate[field];
                      const text = Array.isArray(value) ? value.join(" · ") : value;
                      return <div key={field}><dt className="text-xs font-semibold text-slate-300">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-slate-100">{field === "occurredAt" && text ? new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeZone: "America/Lima" }).format(new Date(text)) : text || "Sin información registrada"}</dd></div>;
                    })}
                  </dl>
                  {!selection[candidate.revisionId].fields.length ? <p className="mt-3 text-slate-300">Elige los campos que podrá ver el destinatario.</p> : null}
                  <p className="mt-4 border-t pt-3 text-xs text-slate-300">{selection[candidate.revisionId].includeMedia ? `${candidate.mediaCount} archivos incluidos; su publicación depende de la autorización correspondiente.` : "Archivos excluidos de esta selección."}</p>
                </article>
              ))}
              {selectedCandidates.some(item => item.belongsToCompany && selection[item.revisionId].includeMedia) && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><strong>Archivos de empresa.</strong> {" "}{publicationReviewEnabled ? "Para publicarlos, guarda primero la selección privada y solicita autorización a la empresa." : "Su publicación requiere autorización de la empresa."}</p>}
              {!selectedCandidates.length ? <p className="text-sm leading-6 text-slate-300">Selecciona registros y define sus campos. Terraqo no asumirá permisos por ti.</p> : null}
            </div>
            <h3 className="mt-6 font-display text-lg font-bold">Opciones de uso compartido</h3>
            <label className="mt-5 block text-sm font-semibold">Nombre de la selección
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} className="mt-2 min-h-11 w-full rounded-lg border border-[#294057] bg-[#101f30] px-3 outline-none focus:border-sky-400 focus:ring-2 focus:ring-primary/15" />
            </label>
            <label className="mt-4 block text-sm font-semibold">Contexto opcional
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1200} rows={3} className="mt-2 w-full resize-y rounded-lg border border-[#294057] bg-[#101f30] px-3 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-primary/15" />
            </label>
            {destination === "invited" && <div className="mt-4 space-y-4">
              <label className="block text-sm font-semibold">Correo de la persona invitada
                <input type="email" autoComplete="off" value={recipient} onChange={event => setRecipient(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-[#294057] bg-[#101f30] px-3 outline-none focus:border-sky-400 focus:ring-2 focus:ring-primary/15" aria-describedby="composer-invitation-help" />
              </label>
              <p id="composer-invitation-help" className="text-xs leading-5 text-slate-300">Un correo por selección. El acceso es de solo lectura. El material de empresa requiere autorización para este correo y vigencia antes de conceder acceso. No se envía una invitación por email. Comparte el enlace manualmente.</p>
              <label className="block text-sm font-semibold">Caducidad del acceso
                <select value={expiryDays} onChange={event => setExpiryDays(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-[#294057] bg-[#101f30] px-3">
                  <option value="1">1 día</option><option value="7">7 días</option><option value="30">30 días</option>
                </select>
              </label>
            </div>}
            {destination === "public" && <p className="mt-4 text-sm leading-6 text-slate-300">La selección tendrá un enlace público incluso si tu perfil aún no está publicado. Aparecerá en tu CV cuando el perfil tenga el CV público. La página pública no tiene caducidad automática. Puedes revocar la publicación desde Tus selecciones. El material de empresa requiere autorización; si no está autorizada, la selección quedará guardada sin confirmar la publicación.</p>}
            <p className="mt-4 text-xs leading-5 text-slate-300">{destination === "private" ? "Una selección privada no genera un enlace para otras personas." : "El enlace estará disponible al confirmar el destino."}</p>
          </aside>
        </fieldset>
        <div className="flex flex-wrap justify-end gap-3 border-t border-[#294057] px-5 py-4 sm:px-7">
          {!composerLocked && <button type="button" disabled={pending} onClick={resetComposer} className="min-h-11 rounded-lg border border-[#294057] px-4 text-sm font-semibold hover:bg-[#0a1726]">Cancelar</button>}
          {composerLocked && !composerComplete && !pending && composerOperation.current?.collection && <button type="button" onClick={() => { resetComposer(); setMessage({ tone: "ok", text: "La selección guardada se conserva. Revisa su estado y continúa desde Tus selecciones." }); router.refresh(); }} className="min-h-11 rounded-lg border border-[#294057] px-4 text-sm font-semibold hover:bg-[#142c43]">Continuar desde Tus selecciones</button>}
          {composerAwaitingReview && ownerReviews.some(review => review.requestedByMe && review.collectionId === composerOperation.current?.collection?.id) ? <a href={`#selection-${composerOperation.current?.collection?.id}`} className="inline-flex min-h-11 items-center rounded-lg border border-[#294057] px-4 text-sm font-semibold">Revisar autorizaciones guardadas</a> : composerComplete ? <button type="button" onClick={resetComposer} className="min-h-11 rounded-lg border border-[#294057] px-4 text-sm font-semibold hover:bg-[#0a1726]">Crear otra selección</button> : <button type="button" disabled={pending || (!canCreate && !composerLocked)} onClick={createCollection} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45">
            {pending ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <ShieldCheck aria-hidden="true" className="h-4 w-4" />}{pending ? "Guardando selección…" : composerAwaitingReview ? (destination === "invited" ? "Confirmar acceso autorizado" : "Confirmar publicación autorizada") : composerLocked ? "Reintentar guardado y permisos" : "Guardar selección y permisos"}
          </button>}
        </div>
        {composerLocked && !composerComplete && !pending && <p className="px-5 pb-5 text-sm text-slate-300">{composerAwaitingReview ? "La solicitud está guardada. Puedes cerrar esta página y volver a Tus selecciones para confirmar el destino cuando la empresa lo apruebe." : "Reintenta desde esta página para confirmar el mismo contenido sin duplicarlo. Puedes revisar los permisos guardados en Tus selecciones."}</p>}
        {composerLink && <div className="space-y-3 border-t p-5">
          <label className="block text-sm font-semibold">Enlace para compartir<input readOnly value={composerLink} className="mt-2 min-h-11 w-full rounded-lg border border-[#294057] bg-[#0a1726] px-3 text-sm" /></label>
          <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(composerLink); setMessage({ tone: "ok", text: "Enlace copiado. No se envió ningún correo." }); } catch { setMessage({ tone: "error", text: "No se pudo copiar el enlace. Selecciona el texto del campo y cópialo manualmente." }); } }} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#294057] px-4 text-sm font-bold text-sky-300"><Copy aria-hidden="true" className="h-4 w-4" />Copiar enlace</button>
        </div>}
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
            const offer = collection.caseOffer;
            const persistedDestination = publicationReviewEnabled && collection.items.some(item => item.revision.worklog.workspaceId) && ownerReviews.some(review => review.requestedByMe && review.collectionId === collection.id);
            const consentVersion = offer ? `${collection.version}/${offer.id}/${offer.version}` : "";
            const asWork = !!offer && caseConsent[collection.id] === consentVersion;
            const publication = { expectedVersion: collection.version, listOnCv: true,
              ...(asWork && offer ? { workCase: { id: offer.id, version: offer.version } } : {}) };
            return (
              <article id={`selection-${collection.id}`} key={collection.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-technical sm:p-6">
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
                {publicationReviewEnabled && <PersistedSharingConfirmation collection={collection} reviews={ownerReviews} />}
                {!persistedDestination && <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /><h4 className="text-sm font-bold">Conceder acceso privado</h4></div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="min-w-0 text-sm font-medium">Correo de la persona<input type="email" value={recipientByCollection[collection.id] || ""} onChange={(event) => setRecipientByCollection((current) => ({ ...current, [collection.id]: event.target.value }))} placeholder="correo@empresa.com" className="mt-2 min-h-11 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:border-primary" /></label>
                    <label className="min-w-0 text-sm font-medium">Acceso hasta<input type="datetime-local" value={expiryByCollection[collection.id] || ""} onChange={(event) => setExpiryByCollection((current) => ({ ...current, [collection.id]: event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:border-primary" /></label>
                  </div>
                  <label className="mt-3 flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" checked={Boolean(downloadByCollection[collection.id])} onChange={(event) => setDownloadByCollection((current) => ({ ...current, [collection.id]: event.target.checked }))} className="h-4 w-4 accent-primary" /> Permitir descargar archivos autorizados</label>
                  <button disabled={pending || !recipientByCollection[collection.id] || !expiryByCollection[collection.id]} onClick={() => run(async () => {
                    await requestJson(`/api/v1/share-collections/${collection.id}/grants`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": operationKey() }, body: JSON.stringify({ expectedVersion: collection.version, inviteEmail: recipientByCollection[collection.id], scopes: downloadByCollection[collection.id] ? ["VIEW_COLLECTION", "DOWNLOAD_MEDIA"] : ["VIEW_COLLECTION"], expiresAt: new Date(expiryByCollection[collection.id]).toISOString() }) });
                    setMessage({ tone: "ok", text: "Permiso guardado. No se envió ningún correo. Copia el enlace privado; la persona debe iniciar sesión con el correo autorizado y verificado." });
                  })} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary bg-white px-4 text-sm font-bold text-primary hover:bg-primary hover:text-white disabled:opacity-45"><Check className="h-4 w-4" /> Guardar permiso</button>
                </div>}
                {collection.grants.length ? <div className="mt-4 space-y-2">{collection.grants.map((grant) => <div key={grant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs"><span><strong>{grant.inviteEmail || "Usuario Terraqo"}</strong><br /><span className="text-slate-500">{grant.lifecycle} · vence {new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(new Date(grant.expiresAt))}</span></span>{grant.lifecycle === "ACTIVE" ? <span className="flex flex-wrap items-center gap-2"><button aria-label="Copiar enlace privado" onClick={async () => { await navigator.clipboard.writeText(`${window.location.origin}/portal/selecciones/${collection.id}`); setMessage({ tone: "ok", text: "Enlace privado copiado. Solo funcionará para la identidad autorizada y dentro de la vigencia." }); }} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-primary hover:bg-primary/5"><Copy className="h-4 w-4" /></button><RevokeAccessControl key={`${grant.id}:${collection.version}`} label="Revocar acceso" subject={grant.inviteEmail || "Usuario Terraqo"} pending={pending} onConfirm={() => run(async () => { await requestJson(`/api/v1/share-collections/${collection.id}/grants`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grantId: grant.id, expectedVersion: collection.version, reason: "Revocado por el titular" }) }); setMessage({ tone: "ok", text: "Acceso revocado de inmediato." }); })} /></span> : null}</div>)}</div> : null}
                <div className="mt-5 flex flex-wrap gap-2 border-t pt-5">
                  {offer && !activeProjection && !persistedDestination && <label className="flex min-h-11 w-full items-center gap-3 text-sm font-medium">
                    <input type="checkbox" checked={asWork} disabled={pending} className="h-4 w-4 accent-primary"
                      onChange={event => {
                        const choice = event.currentTarget.checked ? consentVersion : "";
                        setCaseConsent(current => ({ ...current, [collection.id]: choice }));
                      }} />
                    <span>Mostrar esta selección como trabajo agrupado en mi CV público ({offer.title})
                      <span className="mt-1 block font-normal text-slate-600">Se mostrará con el título «{collection.title}» y solo con los campos y archivos seleccionados.</span>
                    </span>
                  </label>}
                  {publicationReviewEnabled && !persistedDestination && collection.items.some(item => item.revision.worklog.workspaceId) ? <button disabled={pending} onClick={() => run(async () => { await requestJson("/api/v1/publication-reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collectionId: collection.id, ...publication }) }); setMessage({ tone: "ok", text: "Solicitud enviada. Consulta el estado en Autorizaciones de publicación; el material sigue sin publicarse." }); })} className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-bold hover:bg-slate-50"><ShieldCheck className="h-4 w-4" />Solicitar autorización empresarial</button> : null}
                  {activeProjection ? <><Link href={`/selecciones/${activeProjection.slug}`} target="_blank" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white"><Eye className="h-4 w-4" /> Ver página pública</Link><RevokeAccessControl key={`${collection.id}:${collection.version}`} label="Revocar publicación" subject="enlace público de esta selección" pending={pending} onConfirm={() => run(async () => { await requestJson(`/api/v1/share-collections/${collection.id}/projection`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: collection.version }) }); setMessage({ tone: "ok", text: "La página pública dejó de admitir nuevas lecturas." }); })} /></> : !persistedDestination ? <button disabled={pending} onClick={() => run(async () => { await requestJson(`/api/v1/share-collections/${collection.id}/projection`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(publication) }); setMessage({ tone: "ok", text: "Selección publicada con enlace revocable. Aparecerá en tu CV cuando el perfil tenga el CV público." }); })} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white hover:bg-primary/90"><Globe2 className="h-4 w-4" /> {asWork ? "Publicar selección y mostrar trabajo en mi CV" : "Publicar selección"}</button> : null}
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
