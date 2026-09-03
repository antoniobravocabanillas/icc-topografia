"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  ImagePlus,
  Link2,
  NotebookPen,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiWritingTextarea } from "@/components/portal/ai-writing-textarea";

type WorkspaceOption = {
  id: string;
  name: string;
  projects: Array<{ id: string; title: string }>;
};

type PreviousWorklogOption = {
  id: string;
  title: string;
  occurredAt: string;
  workspaceId: string | null;
  projectId: string | null;
  hasNext: boolean;
};

export function WorklogComposer({
  workspaces,
  previousWorklogs,
}: {
  workspaces: WorkspaceOption[];
  previousWorklogs: PreviousWorklogOption[];
}) {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id || "");
  const [projectId, setProjectId] = useState("");
  const [previousWorklogId, setPreviousWorklogId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const projects = useMemo(
    () => workspaces.find((item) => item.id === workspaceId)?.projects || [],
    [workspaceId, workspaces],
  );
  const continuationOptions = useMemo(
    () =>
      previousWorklogs.filter(
        (item) =>
          item.workspaceId === workspaceId &&
          (item.projectId || "") === projectId &&
          !item.hasNext,
      ),
    [previousWorklogs, workspaceId, projectId],
  );

  useEffect(() => {
    const previews = photoFiles.map((file) => URL.createObjectURL(file));
    setPhotoPreviews(previews);
    return () => previews.forEach((preview) => URL.revokeObjectURL(preview));
  }, [photoFiles]);

  function selectPhotos(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    if (selected.length > 6)
      setMessage("Puedes adjuntar hasta 6 fotos por bitacora.");
    setPhotoFiles(selected.slice(0, 6));
  }

  function removePhoto(index: number) {
    setPhotoFiles((current) =>
      current.filter((_, photoIndex) => photoIndex !== index),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    setMessage("");

    const evidenceLinks = String(data.get("evidenceUrls") || "")
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!photoFiles.length && !evidenceLinks.length) {
      setMessage(
        "Agrega al menos una foto o un enlace de evidencia para documentar trabajo verificable.",
      );
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch("/api/terraqo/worklog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: String(data.get("workspaceId") || "") || undefined,
          projectId: String(data.get("projectId") || "") || undefined,
          previousWorklogId:
            String(data.get("previousWorklogId") || "") || undefined,
          title: String(data.get("title") || ""),
          summary: String(data.get("summary") || ""),
          outcome: String(data.get("outcome") || "") || undefined,
          type: String(data.get("type") || "FIELD_UPDATE"),
          visibility: String(data.get("visibility") || "PRIVATE"),
          skills: String(data.get("skills") || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          evidenceUrls: evidenceLinks,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          payload?.error?.message || "No pudimos registrar la bitacora.",
        );

      if (photoFiles.length) {
        const evidenceData = new FormData();
        photoFiles.forEach((file) => evidenceData.append("photos", file));
        const uploadResponse = await fetch(
          `/api/terraqo/worklog/${payload.data.id}/evidence`,
          {
            method: "POST",
            body: evidenceData,
          },
        );
        const uploadPayload = await uploadResponse.json().catch(() => ({}));
        if (!uploadResponse.ok) {
          throw new Error(
            uploadPayload?.error?.message ||
              "La bitacora se guardo, pero no pudimos adjuntar las fotos.",
          );
        }
      }

      form.reset();
      setWorkspaceId(workspaces[0]?.id || "");
      setProjectId("");
      setPreviousWorklogId("");
      setPhotoFiles([]);
      setMessage(
        "Bitacora registrada. Tu trabajo ya suma evidencia a tu perfil.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No pudimos registrar la bitacora.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="min-w-0 rounded-2xl border bg-white p-4 shadow-technical sm:rounded-lg sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
          <NotebookPen className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Nueva evidencia
          </p>
          <h2 className="font-display text-2xl font-bold">
            Documenta lo que resolviste
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Una entrada breve, concreta y vinculada al trabajo real.
          </p>
        </div>
      </div>

      <div className="mt-5 grid min-w-0 gap-4 sm:mt-6 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">
          Workspace
          <select
            name="workspaceId"
            value={workspaceId}
            onChange={(event) => {
              setWorkspaceId(event.target.value);
              setProjectId("");
              setPreviousWorklogId("");
            }}
            className="h-12 min-w-0 rounded-xl border bg-background px-3 text-base sm:h-11 sm:rounded-md sm:text-sm"
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Proyecto vinculado
          <select
            name="projectId"
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value);
              setPreviousWorklogId("");
            }}
            className="h-12 min-w-0 rounded-xl border bg-background px-3 text-base sm:h-11 sm:rounded-md sm:text-sm"
          >
            <option value="">Sin proyecto vinculado</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold md:col-span-2">
          Continuidad del trabajo
          <select
            name="previousWorklogId"
            value={previousWorklogId}
            onChange={(event) => setPreviousWorklogId(event.target.value)}
            className="h-12 min-w-0 rounded-xl border bg-background px-3 text-base sm:h-11 sm:rounded-md sm:text-sm"
          >
            <option value="">Es un trabajo nuevo</option>
            {continuationOptions.map((item) => (
              <option key={item.id} value={item.id}>
                Continúa: {item.title} ·{" "}
                {new Intl.DateTimeFormat("es-PE", {
                  dateStyle: "medium",
                }).format(new Date(item.occurredAt))}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-muted-foreground">
            Enlaza avances del mismo workspace y proyecto para construir una
            secuencia navegable.
          </span>
        </label>
        <label className="grid gap-2 text-sm font-semibold md:col-span-2">
          Titulo
          <input
            name="title"
            className="h-12 min-w-0 rounded-xl border bg-background px-3 text-base sm:h-11 sm:rounded-md sm:text-sm"
            placeholder="Ej. Control de ejes completado en torre B"
            required
            minLength={4}
            maxLength={180}
          />
        </label>
        <div className="grid gap-2 text-sm font-semibold md:col-span-2">
          <span>Qué hiciste y qué problema resolviste</span>
          <AiWritingTextarea
            name="summary"
            purpose="worklog"
            className="min-h-32"
            placeholder="Describe el trabajo, la decisión técnica y el contexto necesario para entenderlo."
            required
            minLength={20}
            maxLength={2400}
          />
        </div>
        <div className="grid gap-2 text-sm font-semibold md:col-span-2">
          <span>Resultado observable</span>
          <AiWritingTextarea
            name="outcome"
            purpose="worklog"
            className="min-h-20"
            placeholder="Ej. Se liberaron los frentes sin observaciones y se entregó el reporte de control."
            required
            minLength={10}
            maxLength={800}
          />
        </div>
        <label className="grid gap-2 text-sm font-semibold">
          Tipo de evidencia
          <select
            name="type"
            className="h-12 min-w-0 rounded-xl border bg-background px-3 text-base sm:h-11 sm:rounded-md sm:text-sm"
          >
            <option value="FIELD_UPDATE">Avance de trabajo</option>
            <option value="DELIVERABLE">Entregable</option>
            <option value="PROBLEM_SOLVED">Problema resuelto</option>
            <option value="MILESTONE">Hito alcanzado</option>
            <option value="LEARNING">Aprendizaje tecnico</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Quien puede verlo
          <select
            name="visibility"
            className="h-12 min-w-0 rounded-xl border bg-background px-3 text-base sm:h-11 sm:rounded-md sm:text-sm"
            defaultValue="PRIVATE"
          >
            <option value="PRIVATE">Solo yo</option>
            <option value="WORKSPACE">Empresa vinculada</option>
            <option value="COMMUNITY">Comunidad Terraqo</option>
            <option value="PUBLIC">Publico</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Habilidades, separadas por coma
          <input
            name="skills"
            className="h-12 min-w-0 rounded-xl border bg-background px-3 text-base sm:h-11 sm:rounded-md sm:text-sm"
            placeholder="Topografia, GNSS, AutoCAD"
          />
        </label>
        <div className="flex min-h-11 items-center gap-3 rounded-md border bg-[#f2f8f7] px-3 text-sm text-[#35485b]">
          <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
          <span>
            <b>Fecha y hora automáticas.</b> Se registran al guardar y no podrán
            modificarse.
          </span>
        </div>
        <label className="grid gap-2 text-sm font-semibold md:col-span-2">
          <span className="flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Evidencias externas, una URL por linea
          </span>
          <textarea
            name="evidenceUrls"
            className="min-h-24 min-w-0 rounded-xl border bg-background p-3 text-base sm:rounded-md sm:text-sm"
            placeholder="https://..."
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold md:col-span-2">
          <span className="flex items-center gap-2">
            <ImagePlus className="h-4 w-4" /> Fotos desde tu dispositivo
          </span>
          <span className="rounded-md border border-dashed bg-muted/25 p-4 text-sm font-medium text-muted-foreground">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              multiple
              onChange={selectPhotos}
              className="block w-full min-w-0 text-sm file:mb-2 file:mr-4 file:min-h-11 file:w-full file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2 file:font-bold file:text-primary-foreground sm:file:mb-0 sm:file:w-auto sm:file:rounded-md"
            />
            <small className="mt-2 block">
              Hasta 6 fotos en JPG, PNG, WEBP o AVIF. Maximo 8 MB por archivo.
            </small>
          </span>
        </label>
        {photoPreviews.length ? (
          <div className="grid grid-cols-2 gap-3 md:col-span-2 sm:grid-cols-3">
            {photoPreviews.map((preview, index) => (
              <figure
                key={preview}
                className="group relative aspect-[4/3] overflow-hidden rounded-md border bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt={`Vista previa ${index + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(index)}
                  className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-md bg-black/70 text-white"
                  aria-label={`Quitar foto ${index + 1}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </figure>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-5 rounded-xl border border-[#cbd7e6] bg-[#f7fafc] p-4">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#4374ba]">
          Cómo aumenta tu confianza
        </p>
        <div className="mt-3 grid gap-2 text-xs text-[#52657a] sm:grid-cols-3">
          <span>1. Describe trabajo y resultado</span>
          <span>2. Adjunta evidencia real</span>
          <span>3. Solicita validación responsable</span>
        </div>
        <p className="mt-3 text-xs leading-5 text-[#607083]">
          Los TQ permanecen 7 días en espera. Duplicados, evidencia falsa o
          validaciones coordinadas no generan reputación.
        </p>
      </div>

      <div className="sticky bottom-[4.8rem] z-20 -mx-4 mt-5 flex flex-col gap-3 border-t bg-white/95 px-4 py-4 backdrop-blur-xl sm:static sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-5">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-primary" /> Privada por defecto.
          Tu decides cuando compartirla.
        </p>
        <Button
          type="submit"
          disabled={submitting}
          className="min-h-12 w-full rounded-xl text-base sm:min-h-10 sm:w-auto sm:rounded-md sm:text-sm"
        >
          {submitting ? "Registrando..." : "Guardar en mi bitacora"}
        </Button>
      </div>
      {message ? (
        <p
          role="status"
          className="mt-4 rounded-md border bg-muted/40 p-3 text-sm font-semibold"
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
