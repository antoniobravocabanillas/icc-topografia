"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ClosureReferenceCandidate, ClosureReferenceSource } from "./closure-reference-picker";
import styles from "./closure-reference-preview.module.css";

type PreviewMedia = { id: string; contentType: string; previewHref: string };
type Preview = ClosureReferenceCandidate & { media?: PreviewMedia[] };

export function ClosureReferencePreview({ collaborationId, referenceId, source, revisionId, title, mode, compact = false }: {
  collaborationId: string;
  referenceId?: string;
  source?: ClosureReferenceSource;
  revisionId: string;
  title?: string;
  mode: "workspace" | "professional";
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "unavailable" | "error">("idle");
  const [retry, setRetry] = useState(0);
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [deniedMedia, setDeniedMedia] = useState<string[]>([]);
  const prefix = `/api/v1/collaborations/${encodeURIComponent(collaborationId)}/closure-references/${encodeURIComponent(revisionId)}`;
  const accessKind = source?.accessKind, accessReferenceId = source?.accessReferenceId;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setPreview(null);
    setStatus("loading");
    setSelectedMedia(null);
    setDeniedMedia([]);
    const query = new URLSearchParams({ view: mode });
    if (referenceId) query.set("referenceId", referenceId);
    else if (accessKind && accessReferenceId) {
      query.set("accessKind", accessKind);
      query.set("accessReferenceId", accessReferenceId);
    } else { setStatus("unavailable"); return; }
    void (async () => {
      try {
        const response = await fetch(`${prefix}?${query}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          if (!controller.signal.aborted) setStatus([401, 403, 404, 410].includes(response.status) ? "unavailable" : "error");
          return;
        }
        const body = await response.json() as { data?: Preview };
        if (!body.data?.fields || body.data.source.worklogRevisionId !== revisionId) throw new Error("Invalid preview");
        if (controller.signal.aborted) return;
        setPreview(body.data);
        setStatus("ready");
      } catch {
        if (!controller.signal.aborted) setStatus("error");
      }
    })();
    return () => controller.abort();
  }, [open, prefix, mode, referenceId, accessKind, accessReferenceId, revisionId, retry]);

  const fields = preview?.fields;
  const shownTitle = status === "idle" ? title || "Referencia autorizada" : fields?.title || "Referencia autorizada";
  const media = (preview?.media || []).filter(item => {
    if (item.contentType !== "image/webp" || deniedMedia.includes(item.id)) return false;
    // Protected evidence must bypass public image optimizers and external URLs.
    try {
      const target = new URL(item.previewHref, window.location.origin);
      return target.origin === window.location.origin && target.pathname.startsWith(prefix + "/media/");
    } catch { return false; }
  });
  const current = media.find(item => item.id === selectedMedia) || media[0];
  const entries = [["Descripción", fields?.summary], ["Resultado", fields?.outcome],
    ["Participación", fields?.contributionRole], ["Responsabilidades", fields?.responsibilities],
    ["Métodos", fields?.methods], ["Herramientas", fields?.tools]] as const;

  return <details className={styles.preview} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{compact ? "Ver evidencia autorizada" : <>{shownTitle}<span>Ver evidencia</span></>}</summary>
    {open ? <div className={styles.content}>
      {status === "loading" ? <p role="status">Comprobando el acceso a esta evidencia…</p> : null}
      {status === "unavailable" ? <p role="status">Esta referencia ya no está disponible con tus permisos actuales. El historial del cierre se conserva.</p> : null}
      {status === "error" ? <div role="alert"><p>No se pudo cargar la evidencia. Revisa tu conexión.</p><Button type="button" variant="outline" onClick={() => setRetry(value => value + 1)}>Reintentar evidencia</Button></div> : null}
      {status === "ready" ? <>
        <dl>{entries.map(([label, value]) => !value || Array.isArray(value) && !value.length ? null : <div key={label}><dt>{label}</dt><dd>{Array.isArray(value) ? value.join(" · ") : value}</dd></div>)}</dl>
        {current ? <div className={styles.gallery}>
          {/* Native images retain authenticated, no-store delivery from this exact reference. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.image} src={current.previewHref} alt={`Evidencia autorizada ${media.indexOf(current) + 1}`} onError={() => setDeniedMedia(ids => [...ids, current.id])} />
          {media.length > 1 ? <div className={styles.thumbnails} aria-label="Imágenes de la evidencia">{media.map((item, index) => <button key={item.id} type="button" aria-pressed={item.id === current.id} aria-label={`Ver imagen ${index + 1}`} onClick={() => setSelectedMedia(item.id)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.previewHref} alt="" loading="lazy" onError={() => setDeniedMedia(ids => [...ids, item.id])} />
          </button>)}</div> : null}
        </div> : <p>Esta referencia no incluye imágenes autorizadas para este cierre.</p>}
        {deniedMedia.length ? <p role="status">Una imagen dejó de estar disponible. Puedes volver a abrir la referencia para comprobar su estado.</p> : null}
      </> : null}
    </div> : null}
  </details>;
}
