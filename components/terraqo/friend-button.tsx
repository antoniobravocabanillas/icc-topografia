"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock3, UserMinus, UserPlus } from "lucide-react";

type State = {
  id?: string | null;
  status?: "NONE" | "PENDING_SENT" | "PENDING_RECEIVED" | "ACCEPTED";
};

export function FriendButton({
  recipientId,
  initial,
}: {
  recipientId: string;
  initial?: State;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>(initial || { status: "NONE" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function act(action?: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        action && state.id
          ? `/api/terraqo/friends/${state.id}`
          : "/api/terraqo/friends",
        {
          method: action ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(action ? { action } : { recipientId }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          payload?.error?.message || "No pudimos actualizar la amistad.",
        );
      if (!action) setState({ id: payload.data.id, status: "PENDING_SENT" });
      else if (action === "accept")
        setState({ id: state.id, status: "ACCEPTED" });
      else setState({ status: "NONE" });
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos actualizar la amistad.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (state.status === "PENDING_RECEIVED")
    return (
      <div className="col-span-2 grid grid-cols-2 gap-2">
        <button
          disabled={busy}
          onClick={() => act("accept")}
          className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl bg-[#087d79] px-3 text-xs font-bold text-white"
        >
          <Check className="h-4 w-4" />
          Aceptar
        </button>
        <button
          disabled={busy}
          onClick={() => act("decline")}
          className="min-h-10 rounded-xl border px-3 text-xs font-bold"
        >
          Rechazar
        </button>
        {error ? (
          <span className="col-span-2 text-xs text-red-700">{error}</span>
        ) : null}
      </div>
    );
  const accepted = state.status === "ACCEPTED";
  const pending = state.status === "PENDING_SENT";
  return (
    <div className="col-span-2">
      <button
        disabled={busy}
        onClick={() =>
          act(accepted ? "remove" : pending ? "cancel" : undefined)
        }
        className={`inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold ${accepted ? "border-[#b9d9d5] bg-[#e9f7f6] text-[#087d79]" : pending ? "border-[#d7e3e8] text-[#667b89]" : "border-[#087d79] bg-[#087d79] text-white"}`}
      >
        {accepted ? (
          <UserMinus className="h-4 w-4" />
        ) : pending ? (
          <Clock3 className="h-4 w-4" />
        ) : (
          <UserPlus className="h-4 w-4" />
        )}
        {busy
          ? "Procesando..."
          : accepted
            ? "Eliminar amigo"
            : pending
              ? "Cancelar solicitud"
              : "Agregar amigo"}
      </button>
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
