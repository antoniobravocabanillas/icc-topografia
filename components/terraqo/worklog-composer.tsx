"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ImagePlus, Link2, NotebookPen, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type WorkspaceOption = {
  id: string;
  name: string;
  projects: Array<{ id: string; title: string }>;
};

export function WorklogComposer({ workspaces }: { workspaces: WorkspaceOption[] }) {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id || "");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const projects = useMemo(() => workspaces.find((item) => item.id === workspaceId)?.projects || [], [workspaceId, workspaces]);

  useEffect(() => {
    const previews = photoFiles.map((file) => URL.createObjectURL(file));
    setPhotoPreviews(previews);
    return () => previews.forEach((preview) => URL.revokeObjectURL(preview));
  }, [photoFiles]);

  function selectPhotos(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    if (selected.length > 6) setMessage("Puedes adjuntar hasta 6 fotos por bitacora.");
    setPhotoFiles(selected.slice(0, 6));
  }

  function removePhoto(index: number) {
    setPhotoFiles((current) => current.filter((_, photoIndex) => photoIndex !== index));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/terraqo/worklog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: String(data.get("workspaceId") || "") || undefined,
          projectId: String(data.get("projectId") || "") || undefined,
          title: String(data.get("title") || ""),
          summary: String(data.get("summary") || ""),
          outcome: String(data.get("outcome") || "") || undefined,
          type: String(data.get("type") || "FIELD_UPDATE"),
          visibility: String(data.get("visibility") || "PRIVATE"),
          skills: String(data.get("skills") || "").split(",").map((item) => item.trim()).filter(Boolean),
          evidenceUrls: String(data.get("evidenceUrls") || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
          occurredAt: String(data.get("occurredAt") || "") || undefined
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || "No pudimos registrar la bitacora.");

      if (photoFiles.length) {
        const evidenceData = new FormData();
        photoFiles.forEach((file) => evidenceData.append("photos", file));
        const uploadResponse = await fetch(`/api/terraqo/worklog/${payload.data.id}/evidence`, {
          method: "POST",
          body: evidenceData
        });
        const uploadPayload = await uploadResponse.json().catch(() => ({}));
        if (!uploadResponse.ok) {
          throw new Error(uploadPayload?.error?.message || "La bitacora se guardo, pero no pudimos adjuntar las fotos.");
        }
      }

      form.reset();
      setWorkspaceId(workspaces[0]?.id || "");
      setPhotoFiles([]);
      setMessage("Bitacora registrada. Tu trabajo ya suma evidencia a tu perfil.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos registrar la bitacora.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border bg-white p-6 shadow-technical">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary"><NotebookPen className="h-5 w-5" /></span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Nueva evidencia</p>
          <h2 className="font-display text-2xl font-bold">Documenta lo que resolviste</h2>
          <p className="mt-1 text-sm text-muted-foreground">Una entrada breve, concreta y vinculada al trabajo real.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">Workspace
          <select name="workspaceId" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className="h-11 rounded-md border bg-background px-3" required>
            {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">Proyecto vinculado
          <select name="projectId" className="h-11 rounded-md border bg-background px-3">
            <option value="">Sin proyecto vinculado</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold md:col-span-2">Titulo
          <input name="title" className="h-11 rounded-md border bg-background px-3" placeholder="Ej. Control de ejes completado en torre B" required minLength={4} maxLength={180} />
        </label>
        <label className="grid gap-2 text-sm font-semibold md:col-span-2">Que hiciste y que problema resolviste
          <textarea name="summary" className="min-h-32 rounded-md border bg-background p-3" placeholder="Describe el trabajo, la decision tecnica y el contexto necesario para entenderlo." required minLength={20} maxLength={2400} />
        </label>
        <label className="grid gap-2 text-sm font-semibold md:col-span-2">Resultado observable
          <textarea name="outcome" className="min-h-20 rounded-md border bg-background p-3" placeholder="Ej. Se liberaron los frentes sin observaciones y se entrego el reporte de control." maxLength={800} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">Tipo de evidencia
          <select name="type" className="h-11 rounded-md border bg-background px-3">
            <option value="FIELD_UPDATE">Avance de trabajo</option>
            <option value="DELIVERABLE">Entregable</option>
            <option value="PROBLEM_SOLVED">Problema resuelto</option>
            <option value="MILESTONE">Hito alcanzado</option>
            <option value="LEARNING">Aprendizaje tecnico</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">Quien puede verlo
          <select name="visibility" className="h-11 rounded-md border bg-background px-3" defaultValue="PRIVATE">
            <option value="PRIVATE">Solo yo</option>
            <option value="WORKSPACE">Empresa vinculada</option>
            <option value="COMMUNITY">Comunidad Terraqo</option>
            <option value="PUBLIC">Publico</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">Habilidades, separadas por coma
          <input name="skills" className="h-11 rounded-md border bg-background px-3" placeholder="Topografia, GNSS, AutoCAD" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">Fecha del trabajo
          <input name="occurredAt" type="date" className="h-11 rounded-md border bg-background px-3" />
        </label>
        <label className="grid gap-2 text-sm font-semibold md:col-span-2"><span className="flex items-center gap-2"><Link2 className="h-4 w-4" /> Evidencias externas, una URL por linea</span>
          <textarea name="evidenceUrls" className="min-h-20 rounded-md border bg-background p-3" placeholder="https://..." />
        </label>
        <label className="grid gap-2 text-sm font-semibold md:col-span-2">
          <span className="flex items-center gap-2"><ImagePlus className="h-4 w-4" /> Fotos desde tu dispositivo</span>
          <span className="rounded-md border border-dashed bg-muted/25 p-4 text-sm font-medium text-muted-foreground">
            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={selectPhotos} className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:font-bold file:text-primary-foreground" />
            <small className="mt-2 block">Hasta 6 fotos en JPG, PNG, WEBP o AVIF. Maximo 8 MB por archivo.</small>
          </span>
        </label>
        {photoPreviews.length ? <div className="grid grid-cols-2 gap-3 md:col-span-2 sm:grid-cols-3">
          {photoPreviews.map((preview, index) => <figure key={preview} className="group relative aspect-[4/3] overflow-hidden rounded-md border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={`Vista previa ${index + 1}`} className="h-full w-full object-cover" />
            <button type="button" onClick={() => removePhoto(index)} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-md bg-black/70 text-white" aria-label={`Quitar foto ${index + 1}`}><X className="h-4 w-4" /></button>
          </figure>)}
        </div> : null}
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-primary" /> Privada por defecto. Tu decides cuando compartirla.</p>
        <Button type="submit" disabled={submitting}>{submitting ? "Registrando..." : "Guardar en mi bitacora"}</Button>
      </div>
      {message ? <p role="status" className="mt-4 rounded-md border bg-muted/40 p-3 text-sm font-semibold">{message}</p> : null}
    </form>
  );
}
