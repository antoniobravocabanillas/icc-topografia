"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TeamHubData } from "@/lib/terraqo/teams";

type Props = Pick<TeamHubData, "workspaces" | "colleagues" | "projects">;

export function TeamComposer({ workspaces, colleagues, projects }: Props) {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const availableColleagues = useMemo(() => colleagues.filter((item) => item.workspaceId === workspaceId), [colleagues, workspaceId]);
  const availableProjects = useMemo(() => projects.filter((item) => item.terraqoWorkspaceId === workspaceId), [projects, workspaceId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/terraqo/teams", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: String(data.get("name") || ""),
          purpose: String(data.get("purpose") || ""),
          projectId: String(data.get("projectId") || "") || undefined,
          memberUserIds: data.getAll("memberUserIds").map(String)
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || "No pudimos crear el equipo.");
      form.reset();
      router.push(`/portal/equipos/${payload.data.id}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos crear el equipo.");
    } finally {
      setBusy(false);
    }
  }

  if (!workspaces.length) return null;

  return (
    <details className="group rounded-lg border bg-white shadow-technical">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold marker:hidden">
        <span className="flex items-center gap-3"><UsersRound className="h-5 w-5 text-primary" /> Formar un nuevo equipo</span>
        <span className="rounded-md bg-primary/10 px-3 py-1 text-xs text-primary group-open:hidden">Crear squad</span>
      </summary>
      <form onSubmit={submit} className="grid gap-5 border-t p-5 lg:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">Workspace
          <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className="h-11 rounded-md border bg-background px-3">
            {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">Proyecto vinculado, opcional
          <select name="projectId" className="h-11 rounded-md border bg-background px-3">
            <option value="">Sin proyecto por ahora</option>
            {availableProjects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold lg:col-span-2">Nombre del equipo
          <input name="name" className="h-11 rounded-md border bg-background px-3" placeholder="Ej. Squad control geometrico Torre Norte" minLength={3} maxLength={120} required />
        </label>
        <label className="grid gap-2 text-sm font-semibold lg:col-span-2">Objetivo compartido
          <textarea name="purpose" className="min-h-28 rounded-md border bg-background p-3" placeholder="Describe el reto, el resultado esperado y como pueden complementarse." minLength={20} maxLength={1200} required />
        </label>
        <fieldset className="grid gap-3 lg:col-span-2">
          <legend className="mb-2 text-sm font-semibold">Profesionales a invitar</legend>
          {availableColleagues.length ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {availableColleagues.map((colleague) => (
                <label key={`${colleague.workspaceId}:${colleague.userId}`} className="flex cursor-pointer gap-3 rounded-md border p-3 transition hover:border-primary/50 hover:bg-primary/5">
                  <input type="checkbox" name="memberUserIds" value={colleague.userId} className="mt-1 h-4 w-4 accent-primary" />
                  <span><strong className="block text-sm">{colleague.name}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{colleague.headline}</span></span>
                </label>
              ))}
            </div>
          ) : <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No hay otros profesionales disponibles en este workspace.</p>}
        </fieldset>
        <div className="flex flex-col gap-3 lg:col-span-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-muted-foreground">Las personas invitadas deben aceptar antes de entrar a la sala privada.</p>
          <Button type="submit" disabled={busy || !availableColleagues.length}>{busy ? "Creando equipo..." : "Crear e invitar"}</Button>
        </div>
        {message ? <p role="status" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 lg:col-span-2">{message}</p> : null}
      </form>
    </details>
  );
}
