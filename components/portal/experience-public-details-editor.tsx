"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/forms/submit-button";
import { AiWritingTextarea } from "@/components/portal/ai-writing-textarea";

type ExperiencePublicDetailsEditorProps = {
  experienceId: string;
  summary?: string | null;
  highlights?: string[];
  action: (formData: FormData) => Promise<void>;
};

export function ExperiencePublicDetailsEditor({ experienceId, summary, highlights = [], action }: ExperiencePublicDetailsEditorProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-bold text-primary underline-offset-4 hover:underline">
        {summary || highlights.length ? "Editar detalle publico" : "Agregar detalle publico"}
      </button>
    );
  }

  return (
    <form action={action} className="mt-3 grid gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <input type="hidden" name="experienceId" value={experienceId} />
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Detalle publico de esta experiencia</p>
      <AiWritingTextarea
        name="summary"
        purpose="experience"
        defaultValue={summary || ""}
        placeholder="Describe el trabajo, contexto, logros, responsabilidades e impacto. Esto se vera en la pagina de detalle publica."
        className="min-h-32"
      />
      <AiWritingTextarea
        name="highlights"
        purpose="highlights"
        defaultValue={highlights.join("\n")}
        placeholder="Puntos clave, uno por linea. Ej. Analisis de mercado, gestion de riesgos, reportes, ejecucion de operaciones."
        className="min-h-28"
      />
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <SubmitButton pendingText="Guardando...">Guardar detalle publico</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border px-3 py-2 text-sm font-semibold">
          Cancelar
        </button>
      </div>
    </form>
  );
}
