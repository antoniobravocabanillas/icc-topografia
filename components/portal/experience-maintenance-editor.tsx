"use client";

import { useState } from "react";
import { CalendarClock, Paperclip } from "lucide-react";
import { SubmitButton } from "@/components/forms/submit-button";
import { LocationSelect } from "@/components/location/location-select";
import { Input } from "@/components/ui/input";

type Validator = { id: string; label: string; email: string };

type ExperienceMaintenanceEditorProps = {
  experience: {
    id: string;
    startedAt?: Date | null;
    endedAt?: Date | null;
    currentlyWorking: boolean;
    country?: string | null;
    locationSubdivisionCode?: string | null;
    locationCity?: string | null;
    visibility: string;
    evidence?: string[];
    validatorUserId?: string | null;
  };
  validators: Validator[];
  action: (formData: FormData) => Promise<void>;
};

function dateValue(value?: Date | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

export function ExperienceMaintenanceEditor({ experience, validators, action }: ExperienceMaintenanceEditorProps) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(experience.currentlyWorking);

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"><CalendarClock className="h-3.5 w-3.5" /> Actualizar experiencia y evidencias</button>;
  }

  return (
    <form action={action} className="mt-3 grid gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <input type="hidden" name="experienceId" value={experience.id} />
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Mantener experiencia</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">Inicio<Input name="startedAt" type="date" defaultValue={dateValue(experience.startedAt)} /></label>
        <label className="grid gap-1 text-sm font-semibold">Fin<Input name="endedAt" type="date" defaultValue={dateValue(experience.endedAt)} disabled={current} required={!current} /></label>
      </div>
      <label className="inline-flex items-center gap-2 text-sm font-semibold"><input name="currentlyWorking" type="checkbox" checked={current} onChange={(event) => setCurrent(event.target.checked)} className="h-4 w-4 accent-primary" />Actualmente trabajo aquí</label>
      <LocationSelect defaultCountry={experience.country || "PE"} defaultSubdivision={experience.locationSubdivisionCode || ""} defaultCity={experience.locationCity || ""} />
      <label className="grid gap-1 text-sm font-semibold">Visibilidad<select name="visibility" defaultValue={experience.visibility} className="h-11 rounded-md border bg-background px-3 text-sm"><option value="PRIVATE">Privada</option><option value="WORKSPACE">Mis workspaces</option><option value="COMMUNITY">Comunidad Terraqo</option><option value="PUBLIC">CV público</option></select></label>
      <label className="grid gap-1 text-sm font-semibold">Responsable para validación<select name="validatorUserId" defaultValue={experience.validatorUserId || ""} className="h-11 rounded-md border bg-background px-3 text-sm"><option value="">Selecciona un responsable disponible</option>{validators.map((validator) => <option key={validator.id} value={validator.id}>{validator.label} · {validator.email}</option>)}</select></label>
      <Input name="validatorFallback" placeholder="Si no aparece, escribe su correo o nombre" />
      <textarea name="evidence" defaultValue={(experience.evidence || []).join("\n")} placeholder="Enlaces o referencias, uno por línea" className="min-h-24 rounded-md border bg-background p-3 text-sm" />
      <label className="grid gap-2 rounded-lg border border-dashed border-primary/35 bg-white p-4 text-sm font-semibold"><span className="inline-flex items-center gap-2"><Paperclip className="h-4 w-4" /> Añadir fotos o documentos</span><input name="evidenceFiles" type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif,application/pdf" className="block w-full text-sm font-normal file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:font-bold file:text-white" /><span className="text-xs font-normal text-muted-foreground">Hasta 6 archivos nuevos de máximo 8 MB. Los respaldos existentes se conservan.</span></label>
      <p className="text-xs leading-5 text-amber-800">Si modificas fechas de una experiencia ya verificada, se solicitará una nueva revisión para preservar la integridad del CV.</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]"><SubmitButton pendingText="Actualizando...">Guardar cambios</SubmitButton><button type="button" onClick={() => setOpen(false)} className="rounded-md border bg-white px-3 py-2 text-sm font-semibold">Cancelar</button></div>
    </form>
  );
}
