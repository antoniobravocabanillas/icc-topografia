"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Ban, Check, Clock3, MessageSquareText, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/terraqo/user-avatar";

type ConversationRequest = {
  id: string;
  direction: "INCOMING" | "OUTGOING";
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "BLOCKED";
  version: number;
  note: string | null;
  conversationId: string | null;
  createdAt: string;
  workspace: { id: string; name: string };
  requester: { id: string; name: string | null; image: string | null };
  recipient: { id: string; name: string | null; image: string | null };
  context: {
    kind: "EVALUATION" | "PROTECTED";
    title: string;
    revisionNo: number | null;
  };
};

type ApiEnvelope<T> = {
  data?: T;
  error?: string | { message?: string };
};

function apiErrorMessage<T>(payload: ApiEnvelope<T>, fallback: string) {
  if (typeof payload.error === "string") return payload.error;
  return payload.error?.message || fallback;
}

const statusLabel: Record<ConversationRequest["status"], string> = {
  PENDING: "Pendiente",
  ACCEPTED: "Aceptada",
  REJECTED: "Rechazada",
  CANCELLED: "Cancelada",
  BLOCKED: "Bloqueada",
};

export function ConversationRequestsPanel({
  basePath,
}: {
  basePath: "/portal/mensajes" | "/admin/terraqo/mensajes";
}) {
  const [requests, setRequests] = useState<ConversationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/conversation-requests", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<
        ConversationRequest[]
      >;
      if (!response.ok) {
        setError(apiErrorMessage(payload, "No se pudieron cargar las solicitudes."));
        return;
      }
      setRequests(payload.data || []);
      setError("");
    } catch {
      setError("No hay conexión para cargar las solicitudes. Revisa tu red e inténtalo nuevamente.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(
    request: ConversationRequest,
    action: "ACCEPT" | "REJECT" | "BLOCK" | "REPORT",
  ) {
    const reason = reasonById[request.id]?.trim() || "";
    if ((action === "BLOCK" || action === "REPORT") && !reason) {
      setError("Indica el motivo antes de bloquear o reportar.");
      document.getElementById(`conversation-request-reason-${request.id}`)?.focus();
      return;
    }
    setWorkingId(request.id);
    setError("");
    try {
      const response = await fetch(
        `/api/v1/conversation-requests/${encodeURIComponent(request.id)}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            expectedVersion: request.version,
            ...(reason ? { reason } : {}),
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<unknown>;
      if (!response.ok)
        setError(apiErrorMessage(payload, "No se pudo resolver la solicitud."));
      else await load();
    } catch {
      setError("La decisión no se envió por un problema de conexión. Puedes reintentarlo sin perder el motivo.");
    } finally {
      setWorkingId("");
    }
  }

  if (!loading && !requests.length && !error) return null;

  const pending = requests.filter((request) => request.status === "PENDING");

  return (
    <section aria-busy={loading || Boolean(workingId)} className="overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-[0_16px_50px_-38px_rgba(15,23,42,0.55)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-[linear-gradient(120deg,#f8fbff_0%,#eef8f6_100%)] px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0b6f68]">
            Acceso controlado
          </p>
          <h2 className="mt-1 font-display text-lg font-bold text-slate-950">
            Solicitudes de conversación
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Aceptar una conversación no comparte evidencias ni abre el expediente.
          </p>
        </div>
        {pending.length ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
            {pending.length} pendiente{pending.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </header>

      <div className="divide-y">
        {loading ? (
          <p role="status" aria-live="polite" className="px-5 py-6 text-sm text-slate-500">Cargando solicitudes…</p>
        ) : (
          requests.slice(0, 12).map((request) => {
            const incoming = request.direction === "INCOMING";
            const counterpart = incoming ? request.requester : request.recipient;
            const pendingIncoming = incoming && request.status === "PENDING";
            return (
              <article key={request.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <UserAvatar name={counterpart.name} image={counterpart.image} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-950">
                          {incoming
                            ? `${request.workspace.name} quiere conversar`
                            : `Solicitud para ${counterpart.name || "profesional"}`}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {request.context.title}
                          {request.context.revisionNo
                            ? ` · revisión ${request.context.revisionNo}`
                            : ""}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                        <Clock3 className="h-3 w-3" />
                        {statusLabel[request.status]}
                      </span>
                    </div>
                    {request.note ? (
                      <p className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
                        {request.note}
                      </p>
                    ) : null}

                    {pendingIncoming ? (
                      <div className="mt-3 space-y-2">
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Motivo, solo si bloqueas o reportas
                          <input
                            id={`conversation-request-reason-${request.id}`}
                            value={reasonById[request.id] || ""}
                            onChange={(event) =>
                              setReasonById((current) => ({
                                ...current,
                                [request.id]: event.target.value,
                              }))
                            }
                            maxLength={500}
                            placeholder="Describe brevemente el motivo"
                            className="mt-1 min-h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-[#0b6f68] focus:ring-2 focus:ring-[#0b6f68]/20"
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={workingId === request.id}
                            onClick={() => void decide(request, "ACCEPT")}
                          >
                            <Check className="h-4 w-4" /> Aceptar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={workingId === request.id}
                            onClick={() => void decide(request, "REJECT")}
                          >
                            <X className="h-4 w-4" /> Rechazar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={workingId === request.id}
                            onClick={() => void decide(request, "BLOCK")}
                          >
                            <Ban className="h-4 w-4" /> Bloquear
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={workingId === request.id}
                            onClick={() => void decide(request, "REPORT")}
                          >
                            <ShieldAlert className="h-4 w-4" /> Reportar
                          </Button>
                        </div>
                      </div>
                    ) : request.status === "ACCEPTED" && request.conversationId ? (
                      <Button asChild size="sm" variant="outline" className="mt-3">
                        <Link href={`${basePath}?conversation=${request.conversationId}`}>
                          <MessageSquareText className="h-4 w-4" /> Abrir conversación
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
      {error ? (
        <p role="alert" className="border-t bg-red-50 px-5 py-3 text-xs font-semibold text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
