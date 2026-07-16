"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, LockKeyhole, Plus, ShieldCheck, StickyNote, Trash2 } from "lucide-react";
import { decryptSecureNote, encryptSecureNote } from "@/lib/client/secure-notes";

type WorkspaceOption = { id: string; name: string };
type Note = { id: string; kind: "SIMPLE" | "SECURE"; title: string | null; body: string | null; securePayload: string | null; updatedAt: string };

export function PrivateNotesManager({ workspaces, apiBase = "/api/terraqo" }: { workspaces: WorkspaceOption[]; apiBase?: string }) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id || "");
  const [notes, setNotes] = useState<Note[]>([]);
  const [kind, setKind] = useState<"SIMPLE" | "SECURE">("SIMPLE");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [unlocked, setUnlocked] = useState<Record<string, { title: string; body: string }>>({});
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [unlockPassphrase, setUnlockPassphrase] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    const response = await fetch(`${apiBase}/notes?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "No se pudieron cargar tus notas.");
    setNotes(payload.data);
  }, [apiBase, workspaceId]);

  useEffect(() => { load().catch((error) => setStatus(error.message)); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (kind === "SECURE" && passphrase.length < 12) return setStatus("La frase de acceso debe tener al menos 12 caracteres.");
    setBusy(true);
    setStatus("");
    try {
      const securePayload = kind === "SECURE" ? await encryptSecureNote(passphrase, { title, body }) : undefined;
      const response = await fetch(`${apiBase}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, kind, title, body, securePayload })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "No se pudo guardar la nota.");
      setTitle(""); setBody(""); setPassphrase("");
      setStatus(kind === "SECURE" ? "Nota cifrada y guardada. Terraqo no conoce tu frase de acceso." : "Nota guardada.");
      await load();
    } catch (error) { setStatus(error instanceof Error ? error.message : "No se pudo guardar la nota."); }
    finally { setBusy(false); }
  }

  async function unlock(note: Note) {
    if (!note.securePayload) return;
    try {
      const value = await decryptSecureNote(unlockPassphrase, note.securePayload);
      setUnlocked((current) => ({ ...current, [note.id]: value }));
      setUnlocking(null); setUnlockPassphrase(""); setStatus("");
    } catch { setStatus("La frase de acceso es incorrecta o la nota no puede descifrarse."); }
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar esta nota de forma permanente?")) return;
    const response = await fetch(`${apiBase}/notes/${id}`, { method: "DELETE" });
    if (!response.ok) return setStatus("No se pudo eliminar la nota.");
    setUnlocked((current) => { const next = { ...current }; delete next[id]; return next; });
    await load();
  }

  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-lg border border-[#d9e8e5] bg-white shadow-[0_20px_60px_rgba(9,50,58,0.07)]">
        <div className="grid gap-0 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="bg-[#07383c] p-7 text-white lg:p-10">
            <ShieldCheck className="h-8 w-8 text-[#5ee0d3]" />
            <p className="mt-8 font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#69ded4]">Espacio personal</p>
            <h2 className="mt-3 max-w-md font-display text-3xl font-bold">Ideas rápidas o información que solo tú puedes abrir.</h2>
            <p className="mt-4 max-w-lg text-sm leading-6 text-white/70">Las notas simples son privadas. Las seguras se cifran en este dispositivo antes de enviarse a Terraqo.</p>
            <div className="mt-8 rounded-lg border border-white/15 bg-white/5 p-4 text-sm text-white/75">
              <b className="text-white">Importante:</b> si pierdes la frase de acceso, Terraqo no puede recuperar el contenido cifrado.
            </div>
          </div>
          <form onSubmit={submit} className="grid gap-4 p-6 lg:p-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-display text-2xl font-bold">Nueva nota</h3>
              {workspaces.length > 1 ? <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className="h-11 rounded-lg border px-3 text-sm">{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select> : null}
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#eef7f6] p-1.5">
              <button type="button" onClick={() => setKind("SIMPLE")} className={`min-h-11 rounded-md text-sm font-semibold ${kind === "SIMPLE" ? "bg-white text-[#07383c] shadow-sm" : "text-[#527078]"}`}><StickyNote className="mr-2 inline h-4 w-4" />Simple</button>
              <button type="button" onClick={() => setKind("SECURE")} className={`min-h-11 rounded-md text-sm font-semibold ${kind === "SECURE" ? "bg-[#07383c] text-white shadow-sm" : "text-[#527078]"}`}><LockKeyhole className="mr-2 inline h-4 w-4" />Segura</button>
            </div>
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} required placeholder="Título" className="h-12 rounded-lg border border-[#cfdfdc] px-4 outline-none focus:border-[#009c92]" />
            <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={24000} required placeholder="Escribe tu nota..." className="min-h-40 resize-y rounded-lg border border-[#cfdfdc] p-4 outline-none focus:border-[#009c92]" />
            {kind === "SECURE" ? <label className="grid gap-2 text-sm font-semibold">Frase de acceso de la bóveda<input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} minLength={12} required placeholder="Mínimo 12 caracteres" autoComplete="new-password" className="h-12 rounded-lg border border-[#cfdfdc] px-4 font-normal outline-none focus:border-[#009c92]" /></label> : null}
            <button disabled={busy || !workspaceId} className="min-h-12 rounded-lg bg-[#009c92] px-5 font-semibold text-white transition hover:bg-[#007f78] disabled:opacity-50"><Plus className="mr-2 inline h-4 w-4" />{busy ? "Protegiendo..." : "Guardar nota"}</button>
          </form>
        </div>
      </section>

      {status ? <p role="status" className="rounded-lg border border-[#b8ded9] bg-[#eaf8f6] px-4 py-3 text-sm font-semibold text-[#075a57]">{status}</p> : null}
      <section>
        <div className="mb-4 flex items-end justify-between gap-4"><div><p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-[#008f87]">Tu archivo personal</p><h2 className="mt-2 font-display text-2xl font-bold">Notas guardadas</h2></div><span className="font-mono text-xs text-[#668087]">{notes.length} notas</span></div>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {notes.map((note) => {
            const content = note.kind === "SIMPLE" ? { title: note.title || "Sin título", body: note.body || "" } : unlocked[note.id];
            return <article key={note.id} className={`min-h-64 rounded-lg border p-6 ${note.kind === "SECURE" ? "border-[#98d3cd] bg-[#07383c] text-white" : "border-[#d9e8e5] bg-white"}`}>
              <div className="flex items-start justify-between gap-4"><span className={`grid h-10 w-10 place-items-center rounded-lg ${note.kind === "SECURE" ? "bg-white/10 text-[#66e3d8]" : "bg-[#e8f7f5] text-[#008f87]"}`}>{note.kind === "SECURE" ? <KeyRound className="h-5 w-5" /> : <StickyNote className="h-5 w-5" />}</span><button onClick={() => remove(note.id)} className="grid h-9 w-9 place-items-center rounded-lg text-current/55 hover:bg-black/5 hover:text-red-600" aria-label="Eliminar nota"><Trash2 className="h-4 w-4" /></button></div>
              {content ? <><h3 className="mt-5 font-display text-xl font-bold">{content.title}</h3><p className={`mt-3 whitespace-pre-wrap text-sm leading-6 ${note.kind === "SECURE" ? "text-white/72" : "text-[#4c656e]"}`}>{content.body}</p>{note.kind === "SECURE" ? <button onClick={() => setUnlocked((current) => { const next = { ...current }; delete next[note.id]; return next; })} className="mt-5 text-sm font-semibold text-[#66e3d8]"><EyeOff className="mr-2 inline h-4 w-4" />Ocultar</button> : null}</> : <div className="mt-6"><h3 className="font-display text-xl font-bold">Nota segura</h3><p className="mt-2 text-sm text-white/65">El título y el contenido permanecen cifrados.</p>{unlocking === note.id ? <div className="mt-5 grid gap-2"><input type="password" value={unlockPassphrase} onChange={(event) => setUnlockPassphrase(event.target.value)} autoFocus placeholder="Frase de acceso" className="h-11 rounded-lg border border-white/20 bg-white/10 px-3 text-white outline-none placeholder:text-white/45" /><button onClick={() => unlock(note)} className="h-11 rounded-lg bg-[#63ded3] font-semibold text-[#063438]">Descifrar</button></div> : <button onClick={() => { setUnlocking(note.id); setUnlockPassphrase(""); }} className="mt-5 text-sm font-semibold text-[#66e3d8]"><Eye className="mr-2 inline h-4 w-4" />Abrir con frase</button>}</div>}
            </article>;
          })}
        </div>
        {!notes.length ? <div className="rounded-lg border border-dashed border-[#bed4d0] bg-white p-10 text-center text-[#627a82]">Aún no tienes notas en este espacio.</div> : null}
      </section>
    </div>
  );
}
