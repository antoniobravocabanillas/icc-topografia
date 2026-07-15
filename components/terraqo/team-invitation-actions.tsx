"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function TeamInvitationActions({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function respond(action: "accept" | "decline") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/terraqo/teams/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId, action })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || "No pudimos actualizar la invitacion.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos actualizar la invitacion.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" onClick={() => respond("accept")} disabled={busy}>Aceptar invitacion</Button>
        <Button type="button" variant="outline" onClick={() => respond("decline")} disabled={busy}>Declinar</Button>
      </div>
      {message ? <p role="status" className="text-sm font-semibold text-red-700">{message}</p> : null}
    </div>
  );
}
