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

type CompanyOption = {
  id: string;
  name: string;
  industry?: string | null;
  projects: Array<{ id: string; title: string; category?: string | null; location?: string | null }>;
};

type ProfileEntryFormsProps = {
  validators: ValidatorOption[];
  companies: CompanyOption[];
  createExperienceAction: (formData: FormData) => Promise<void>;
  createEducationAction: (formData: FormData) => Promise<void>;
};

export function ExperienceForm({ validators, companies, createExperienceAction }: Pick<ProfileEntryFormsProps, "validators" | "companies" | "createExperienceAction">) {
  const [current, setCurrent] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [projectId, setProjectId] = useState("");
  const manualCompany = companyId === "OTHER";
  const selectedCompany = companies.find((company) => company.id === companyId);
  const manualProject = manualCompany || projectId === "OTHER";
  return (
    <form action={createExperienceAction} className="grid gap-3">
      <label className="grid gap-1.5 text-sm font-semibold">
        Empresa o cliente
        <select name="workspaceId" value={companyId} onChange={(event) => { setCompanyId(event.target.value); setProjectId(""); }} required className="h-11 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Selecciona una empresa registrada</option>
          {companies.map((company) => <option key={company.id} value={company.id}>{company.name}{company.industry ? ` · ${company.industry}` : ""}</option>)}
          <option value="OTHER">La empresa no aparece en Terraqo</option>
        </select>
      </label>
      {manualCompany ? <Input name="companyName" placeholder="Escribe el nombre de la empresa o cliente" required autoFocus /> : null}
      <p className="-mt-1 text-xs text-muted-foreground">Selecciona la empresa si está registrada. Solo escríbela manualmente cuando no aparezca en la lista.</p>
      {!manualCompany && selectedCompany ? (
        <label className="grid gap-1.5 text-sm font-semibold">
          Proyecto
          <select name="projectId" value={projectId} onChange={(event) => setProjectId(event.target.value)} required className="h-11 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Selecciona un proyecto público de la empresa</option>
            {selectedCompany.projects.map((project) => <option key={project.id} value={project.id}>{project.title}{project.category ? ` · ${project.category}` : ""}{project.location ? ` · ${project.location}` : ""}</option>)}
            <option value="OTHER">El proyecto no aparece en la lista</option>
          </select>
        </label>
      ) : null}
      {manualProject ? <Input name="title" placeholder="Escribe el nombre del proyecto o trabajo" required /> : null}
      {selectedCompany && !selectedCompany.projects.length ? <p className="-mt-1 text-xs text-amber-700">Esta empresa todavía no tiene proyectos públicos. Selecciona “El proyecto no aparece” para registrarlo por nombre.</p> : null}
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
