"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ProfileOption = {
  id: string;
  label: string;
};

type ProjectOption = {
  id: string;
  title: string;
  clientName: string | null;
  location: string | null;
};

type LinkProfessionalProjectFormProps = {
  action: (formData: FormData) => Promise<void>;
  profiles: ProfileOption[];
  projects: ProjectOption[];
};

export function LinkProfessionalProjectForm({ action, profiles, projects }: LinkProfessionalProjectFormProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allProjects, setAllProjects] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [location, setLocation] = useState("");
  function syncFromProjects(nextSelectedIds: string[], nextAllProjects = allProjects) {
    if (nextAllProjects) {
      setCompanyName("Varios clientes");
      setLocation("Varios frentes");
      return;
    }
    const firstProject = projects.find((project) => nextSelectedIds.includes(project.id));
    setCompanyName(firstProject?.clientName || "");
    setLocation(firstProject?.location || "");
  }

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <select name="professionalProfileId" className="h-11 rounded-md border bg-background px-3 text-sm" required>
          <option value="">Seleccionar profesional</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>{profile.label}</option>
          ))}
        </select>
        <label className="flex min-h-11 items-center gap-3 rounded-md border bg-background px-3 text-sm font-semibold">
          <input
            type="checkbox"
            name="allProjects"
            checked={allProjects}
            onChange={(event) => {
              setAllProjects(event.target.checked);
              if (event.target.checked) setSelectedIds([]);
              syncFromProjects([], event.target.checked);
            }}
          />
          Vincular a todos los proyectos del workspace
        </label>
        <Input name="title" placeholder="Experiencia que aparecera en el CV" required />
      </div>

      {!allProjects ? (
        <div className="rounded-lg border bg-muted/20 p-4">
          <p className="text-sm font-semibold">Proyectos vinculados</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Selecciona uno o varios proyectos. Al elegirlos, Terraqo usa el cliente y ubicacion del proyecto como respaldo de la experiencia.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <label key={project.id} className={`flex cursor-pointer gap-3 rounded-md border p-3 text-sm transition ${selectedIds.includes(project.id) ? "border-primary bg-primary/10" : "bg-background hover:border-primary/50"}`}>
                <input
                  type="checkbox"
                  name="projectIds"
                  value={project.id}
                  checked={selectedIds.includes(project.id)}
                  onChange={(event) => {
                    const next = event.target.checked ? [...selectedIds, project.id] : selectedIds.filter((id) => id !== project.id);
                    setSelectedIds(next);
                    syncFromProjects(next);
                  }}
                />
                <span>
                  <b className="block">{project.title}</b>
                  <small className="mt-1 block text-muted-foreground">{project.clientName || "Cliente por definir"} | {project.location || "Ubicacion por definir"}</small>
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        <Input name="role" placeholder="Rol desempenado" />
        <Input name="companyName" placeholder="Empresa o cliente" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
        <Input name="location" placeholder="Ubicacion" value={location} onChange={(event) => setLocation(event.target.value)} />
      </div>
      <Button type="submit">Validar y vincular al CV vivo</Button>
    </form>
  );
}
