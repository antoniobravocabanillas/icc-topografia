"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, LoaderCircle, ShieldCheck } from "lucide-react";
import type { PublicationSnapshot } from "@/lib/terraqo/publication-review-policy";

export type PublicationReviewView = {
  id: string;
  collectionVersion: number;
  scopeHash: string;
  decision: string;
  comment: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  workspace: { name: string };
  snapshot: PublicationSnapshot;
};
const labels: Record<string, string> = {
  PENDING: "Pendiente de revisión",
  APPROVED: "Autorizada",
  CHANGES_REQUESTED: "Cambios solicitados",
  DECLINED: "No autorizada",
  title: "Título",
  summary: "Descripción",
  outcome: "Resultado",
  contributionRole: "Rol",
  responsibilities: "Responsabilidades",
  methods: "Métodos",
  tools: "Herramientas",
  occurredAt: "Fecha",
  locationLabel: "Lugar",
};
const control =
  "min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50";

function ReviewDetail({
  review,
  canReview,
}: {
  review: PublicationReviewView;
  canReview: boolean;
}) {
  const router = useRouter();
  const [loadedMedia, setLoadedMedia] = useState<Set<string>>(() => new Set());
  const [mediaFailed, setMediaFailed] = useState(false);
  const expectedMedia = [
    ...new Set(review.snapshot.items.flatMap((item) => item.mediaIds)),
  ];
  const previewReady =
    !mediaFailed && expectedMedia.every((id) => loadedMedia.has(id));
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(
    null,
  );
  async function decide(decision: string) {
    if (pending) return;
    setPending(true);
    setNotice(null);
    try {
      const revoke = decision === "REVOKE";
      const response = await fetch("/api/v1/publication-reviews", {
        method: revoke ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          revoke
            ? { reviewId: review.id, reason }
            : {
                reviewId: review.id,
                payload: {
                  decision,
                  scopeHash: review.scopeHash,
                  ...(decision === "APPROVED"
                    ? {
                        confirmed,
                        ...(reason.trim() ? { comment: reason.trim() } : {}),
                      }
                    : { comment: reason.trim() }),
                },
              },
        ),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload?.error?.message ||
            "No se pudo guardar la decisión. Vuelve a intentarlo.",
        );
      setConfirmed(false);
      setReason("");
      setNotice({
        error: false,
        text: revoke
          ? "Autorización retirada. El material deja de admitir nuevas consultas públicas."
          : decision === "APPROVED"
            ? "Autorización guardada. El profesional debe publicar la selección por separado."
            : "Decisión guardada. El profesional podrá consultar el motivo.",
      });
      router.refresh();
    } catch (error) {
      setNotice({
        error: true,
        text:
          error instanceof Error
            ? error.message
            : "No se pudo completar la operación.",
      });
    } finally {
      setPending(false);
    }
  }
  const actionable =
    canReview &&
    !review.revokedAt &&
    ["PENDING", "APPROVED"].includes(review.decision);
  return (
    <div className="space-y-7">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-sm font-medium text-slate-600">
          {review.workspace.name} · Versión {review.collectionVersion}
        </p>
        <h3 className="mt-2 break-words font-display text-2xl font-bold text-slate-950">
          {review.snapshot.title}
        </h3>
        {review.snapshot.workCaseScope && <p className="mt-3 font-semibold text-slate-800">
          También se solicita presentar estas bitácoras como trabajo agrupado en el CV público del profesional.
        </p>}
        {review.snapshot.description ? (
          <p className="mt-3 max-w-prose text-sm leading-6 text-slate-600">
            {review.snapshot.description}
          </p>
        ) : null}
        <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-primary">
          <ShieldCheck size={18} aria-hidden />
          {review.revokedAt ? "Autorización retirada" : labels[review.decision]}
        </p>
      </header>
      <section
        aria-label="Vista previa del material solicitado"
        className="space-y-6"
      >
        <div>
          <h4 className="font-semibold text-slate-950">
            Contenido solicitado para la página pública
          </h4>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Solo se incluyen los campos y adjuntos que aparecen aquí. Esta
            revisión corresponde al material de {review.workspace.name}.
          </p>
        </div>
        {review.snapshot.items.map((item, index) => (
          <article
            key={item.revisionId}
            className="border-b border-slate-200 pb-6 last:border-0"
          >
            <h5 className="mb-4 text-sm font-semibold text-slate-600">
              Registro {index + 1} · Revisión {item.revisionNo}
            </h5>
            <dl className="space-y-4">
              {Object.entries(item.fields).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-sm font-semibold text-slate-950">
                    {labels[key]}
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
                    {Array.isArray(value)
                      ? value.join(" · ")
                      : value || "Sin contenido"}
                  </dd>
                </div>
              ))}
            </dl>
            {item.mediaIds.length && !review.revokedAt ? (
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {item.mediaIds.map((id, i) => (
                  <Image
                    key={id}
                    src={`/api/v1/publication-reviews/${encodeURIComponent(review.id)}/media/${encodeURIComponent(id)}`}
                    width={640}
                    height={480}
                    unoptimized
                    onLoad={() =>
                      setLoadedMedia((previous) => new Set([...previous, id]))
                    }
                    onError={() => setMediaFailed(true)}
                    alt={`Adjunto ${i + 1} del registro ${index + 1} solicitado para publicación`}
                    className="h-auto w-full rounded-lg border border-slate-200 object-contain"
                  />
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </section>
      {mediaFailed ? (
        <p role="alert" className="text-sm text-red-800">
          No se pudo cargar un adjunto. Recarga la página para volver a
          comprobarlo; la autorización permanece bloqueada.
        </p>
      ) : null}
      {review.comment || review.revokedReason ? (
        <section className="border-t pt-5">
          <h4 className="text-sm font-semibold">Respuesta de la empresa</h4>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
            {review.revokedReason || review.comment}
          </p>
        </section>
      ) : null}
      {notice ? (
        <p
          role={notice.error ? "alert" : "status"}
          className={`rounded-lg border p-4 text-sm leading-6 ${notice.error ? "border-red-200 bg-red-50 text-red-900" : "border-teal-200 bg-teal-50 text-teal-900"}`}
        >
          {notice.text}
        </p>
      ) : null}
      {actionable ? (
        <section
          aria-label="Decisión de publicación"
          className="space-y-4 border-t border-slate-200 pt-6"
        >
          <h4 className="font-semibold text-slate-950">
            {review.decision === "APPROVED"
              ? "Retirar autorización"
              : "Tu decisión"}
          </h4>
          <label
            className="block text-sm font-medium"
            htmlFor={`reason-${review.id}`}
          >
            Motivo o comentario{" "}
            <span className="font-normal text-slate-500">
              (obligatorio para pedir cambios, rechazar o retirar)
            </span>
          </label>
          <textarea
            id={`reason-${review.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={2000}
            rows={3}
            disabled={pending}
            className="w-full rounded-lg border border-slate-300 p-3 text-sm focus-visible:outline-primary"
          />
          {review.decision === "PENDING" ? (
            <>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  disabled={pending || !previewReady}
                  className="mt-1 h-5 w-5 shrink-0 accent-primary"
                />
                He revisado esta versión y autorizo los campos y adjuntos
                mostrados para la página pública.
              </label>
              <p className="text-sm leading-6 text-slate-600">
                Autorizar no publica el material. Si necesita cambios, solicita
                una nueva selección antes de aprobar.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => decide("APPROVED")}
                  disabled={pending || !confirmed || !previewReady}
                  className={`${control} border-primary bg-primary text-white`}
                >
                  {pending ? (
                    <LoaderCircle
                      className="mr-2 inline animate-spin"
                      size={16}
                    />
                  ) : null}
                  Autorizar selección
                </button>
                <button
                  onClick={() => decide("CHANGES_REQUESTED")}
                  disabled={pending || reason.trim().length < 3}
                  className={control}
                >
                  Pedir cambios
                </button>
                <button
                  onClick={() => decide("DECLINED")}
                  disabled={pending || reason.trim().length < 3}
                  className={`${control} text-red-800`}
                >
                  No autorizar
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => decide("REVOKE")}
              disabled={pending || reason.trim().length < 3}
              className={`${control} text-red-800`}
            >
              Retirar autorización
            </button>
          )}
        </section>
      ) : null}
    </div>
  );
}

export function PublicationReviewConsole({
  reviews,
  canReview = false,
}: {
  reviews: PublicationReviewView[];
  canReview?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const current = reviews.find((review) => review.id === selected);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 text-slate-950 sm:p-7">
      <h2 className="font-display text-2xl font-bold">
        Autorizaciones de publicación
      </h2>
      <p className="mt-2 max-w-prose text-sm leading-6 text-slate-600">
        Revisa el alcance del material empresarial antes de compartirlo
        públicamente.
      </p>
      {!reviews.length ? (
        <p className="mt-8 border-t pt-6 text-sm text-slate-600">
          No hay solicitudes disponibles. Aquí aparecerán las selecciones
          enviadas para autorización.
        </p>
      ) : current ? (
        <div className="mt-6">
          <button
            className={`${control} mb-6 inline-flex items-center gap-2`}
            onClick={() => setSelected(null)}
          >
            <ArrowLeft size={16} aria-hidden />
            Volver a las solicitudes
          </button>
          <ReviewDetail
            key={current.id}
            review={current}
            canReview={canReview}
          />
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-slate-200 border-t border-slate-200">
          {reviews.map((review) => (
            <li key={review.id}>
              <button
                className="flex min-h-20 w-full flex-col gap-2 py-5 text-left hover:text-primary focus-visible:outline-primary sm:flex-row sm:items-center sm:justify-between"
                disabled={!interactive}
                onClick={() => setSelected(review.id)}
              >
                <span className="min-w-0">
                  <span className="block break-words font-semibold">
                    {review.snapshot.title}
                  </span>
                  <span className="mt-1 block text-sm text-slate-600">
                    {review.workspace.name} · Versión {review.collectionVersion}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold">
                  {review.revokedAt ? "Retirada" : labels[review.decision]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
