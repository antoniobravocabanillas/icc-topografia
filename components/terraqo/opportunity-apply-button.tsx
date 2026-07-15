"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function OpportunityApplyButton({ jobId, applied }: { jobId: string; applied: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function apply() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/terraqo/jobs/${jobId}/apply`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || "No pudimos registrar tu postulacion.");
      setMessage("Postulacion registrada.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos registrar tu postulacion.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button type="button" onClick={apply} disabled={busy || applied} className="w-full sm:w-auto">
        {applied ? "Postulacion enviada" : busy ? "Enviando..." : "Postular con mi perfil"}
      </Button>
      {message ? <p className="mt-2 text-xs font-semibold text-primary">{message}</p> : null}
    </div>
  );
}
