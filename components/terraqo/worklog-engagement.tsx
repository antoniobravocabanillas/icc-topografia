"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, MessageSquare, ShieldCheck, ThumbsUp } from "lucide-react";

const reactions = [
  { type: "USEFUL", label: "Util", icon: ThumbsUp },
  { type: "INSIGHTFUL", label: "Aporta", icon: Lightbulb },
  { type: "RESPECT", label: "Reconocer", icon: ShieldCheck }
] as const;

export function WorklogEngagement({ worklogId, currentReaction, reactionCount, commentCount }: { worklogId: string; currentReaction?: string; reactionCount: number; commentCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showComment, setShowComment] = useState(false);

  async function send(body: object) {
    setBusy(true);
    try {
      const response = await fetch(`/api/terraqo/worklog/${worklogId}/engagement`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error("No se pudo guardar la interaccion.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function comment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await send({ action: "comment", body: String(data.get("body") || "") });
    form.reset();
    setShowComment(false);
  }

  return (
    <div className="border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        {reactions.map(({ type, label, icon: Icon }) => (
          <button key={type} type="button" disabled={busy} onClick={() => send({ action: "react", type })} className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition ${currentReaction === type ? "border-primary bg-primary text-white" : "bg-white hover:bg-muted"}`}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
        <button type="button" onClick={() => setShowComment((value) => !value)} className="ml-auto inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold text-muted-foreground hover:bg-muted">
          <MessageSquare className="h-3.5 w-3.5" /> {commentCount} comentarios
        </button>
        <span className="text-xs font-semibold text-muted-foreground">{reactionCount} reacciones</span>
      </div>
      {showComment ? (
        <form onSubmit={comment} className="mt-3 flex gap-2">
          <input name="body" className="h-10 min-w-0 flex-1 rounded-md border px-3 text-sm" placeholder="Aporta una observacion tecnica" required minLength={2} maxLength={800} />
          <button disabled={busy} className="rounded-md bg-primary px-4 text-sm font-semibold text-white">Enviar</button>
        </form>
      ) : null}
    </div>
  );
}
