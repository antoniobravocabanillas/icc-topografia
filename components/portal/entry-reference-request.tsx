"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ValidatorOption = {
  id: string;
  label: string;
  email: string;
};

type EntryReferenceRequestProps = {
  entryId: string;
  entryType: "experience" | "education";
  validators: ValidatorOption[];
  action: (formData: FormData) => Promise<void>;
};

export function EntryReferenceRequest({ entryId, entryType, validators, action }: EntryReferenceRequestProps) {
  const [open, setOpen] = useState(false);
  const isEducation = entryType === "education";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-primary/30 px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-primary hover:text-white"
      >
        Agregar referencia
      </button>
    );
  }

  return (
    <form action={action} className="mt-3 grid gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <input type="hidden" name={isEducation ? "educationId" : "experienceId"} value={entryId} />
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Referencia para validacion Terraqo</p>
      <select name="validatorUserId" defaultValue="" className="h-10 rounded-md border bg-background px-3 text-sm">
        <option value="">Responsable interno opcional</option>
        {validators.map((validator) => (
          <option key={validator.id} value={validator.id}>{validator.label} · {validator.email}</option>
        ))}
      </select>
      <Input
        name={isEducation ? "educationValidatorFallback" : "validatorFallback"}
        placeholder={isEducation ? "Correo o nombre del responsable academico" : "Correo o nombre del responsable o cliente"}
      />
      <Textarea
        name={isEducation ? "educationEvidence" : "evidence"}
        placeholder={isEducation ? "Certificados, constancias, enlaces o referencias, una por linea" : "Evidencias, enlaces o referencias, una por linea"}
        className="min-h-24"
      />
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <SubmitButton pendingText="Enviando...">Guardar y pedir validacion</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border px-3 py-2 text-sm font-semibold">
          Cancelar
        </button>
      </div>
    </form>
  );
}
