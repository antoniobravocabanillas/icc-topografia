"use client";

import { useState } from "react";
import { LocationSelect } from "@/components/location/location-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ValidatorOption = {
  id: string;
  label: string;
  email: string;
};

type ProfileEntryFormsProps = {
  validators: ValidatorOption[];
  createExperienceAction: (formData: FormData) => Promise<void>;
  createEducationAction: (formData: FormData) => Promise<void>;
};

export function ExperienceForm({ validators, createExperienceAction }: Pick<ProfileEntryFormsProps, "validators" | "createExperienceAction">) {
  const [current, setCurrent] = useState(false);
  return (
    <form action={createExperienceAction} className="grid gap-3">
      <Input name="title" placeholder="Ej. Control altimetrico en edificio multifamiliar" required />
      <Input name="companyName" placeholder="Empresa o cliente" required />
      <Input name="role" placeholder="Rol desempenado" />
      <LocationSelect countryName="country" subdivisionName="subdivision" cityName="city" required />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">Inicio<Input name="startedAt" type="date" /></label>
        <label className="grid gap-1 text-sm font-semibold">Fin<Input name="endedAt" type="date" disabled={current} /></label>
      </div>
      <label className="inline-flex items-center gap-2 text-sm font-semibold">
        <input name="currentlyWorking" type="checkbox" checked={current} onChange={(event) => setCurrent(event.target.checked)} className="h-4 w-4 rounded border-input accent-primary" />
        Actualmente trabajo aqui
      </label>
      <VisibilitySelect />
      <ValidatorSelect validators={validators} />
      <Input name="validatorFallback" placeholder="Si no aparece en la lista, correo o nombre del responsable" />
      <Textarea name="summary" placeholder="Detalle destacado visible en la pagina publica de esta experiencia. Ej. alcance, logros, decisiones, responsabilidades e impacto." className="min-h-28" />
      <Textarea name="highlights" placeholder="Puntos clave, uno por linea. Ej. Analisis de mercado, gestion de riesgos, reportes, ejecucion de operaciones." />
      <Textarea name="evidence" placeholder="Evidencias, enlaces o referencias, una por linea" />
      <SubmitButton pendingText="Registrando...">Guardar experiencia</SubmitButton>
    </form>
  );
}

export function EducationForm({ validators, createEducationAction }: Pick<ProfileEntryFormsProps, "validators" | "createEducationAction">) {
  const [current, setCurrent] = useState(false);
  return (
    <form action={createEducationAction} className="grid gap-3">
      <Input name="institution" placeholder="Institucion educativa" required />
      <Input name="degree" placeholder="Grado, titulo o certificacion" required />
      <Input name="field" placeholder="Especialidad o area de estudio" />
      <LocationSelect countryName="educationCountry" subdivisionName="educationSubdivision" cityName="educationCity" required={false} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">Inicio<Input name="educationStartedAt" type="date" /></label>
        <label className="grid gap-1 text-sm font-semibold">Fin<Input name="educationEndedAt" type="date" disabled={current} /></label>
      </div>
      <label className="inline-flex items-center gap-2 text-sm font-semibold">
        <input name="currentlyStudying" type="checkbox" checked={current} onChange={(event) => setCurrent(event.target.checked)} className="h-4 w-4 rounded border-input accent-primary" />
        Actualmente estudio aqui
      </label>
      <VisibilitySelect />
      <ValidatorSelect validators={validators} />
      <Input name="educationValidatorFallback" placeholder="Correo o nombre del responsable academico" />
      <Textarea name="educationEvidence" placeholder="Certificados, enlaces, constancias o referencias, una por linea" />
      <SubmitButton pendingText="Guardando...">Guardar educacion</SubmitButton>
    </form>
  );
}

function VisibilitySelect() {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      Visibilidad en CV vivo
      <select name="visibility" defaultValue="PRIVATE" className="h-11 rounded-md border bg-background px-3 text-sm">
        <option value="PRIVATE">Privada: solo yo y Terraqo</option>
        <option value="WORKSPACE">Visible para mis workspaces</option>
        <option value="COMMUNITY">Visible en comunidad Terraqo</option>
        <option value="PUBLIC">Publica en mi CV compartible</option>
      </select>
    </label>
  );
}

function ValidatorSelect({ validators }: { validators: ValidatorOption[] }) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      Solicitar verificacion a un responsable
      <select name="validatorUserId" defaultValue="" className="h-11 rounded-md border bg-background px-3 text-sm">
        <option value="">Selecciona un perfil autorizado</option>
        {validators.map((validator) => (
          <option key={validator.id} value={validator.id}>{validator.label} · {validator.email}</option>
        ))}
      </select>
    </label>
  );
}
