import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { resolveCareerFormConfig, type CareerDocumentRequirement, type CareerFieldConfig, type CareerFormConfig } from "@/lib/terraqo/career-form-config";
import { getSessionTerraqoWorkspace, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

const fieldTypeLabels: Record<string, string> = {
  text: "Texto",
  email: "Correo",
  phone: "Telefono",
  password: "Contrasena",
  number: "Numero",
  url: "Enlace",
  textarea: "Texto largo",
  select: "Selector",
  multiSelect: "Opciones multiples",
  file: "Archivo",
  checkbox: "Checkbox"
};

const recommendedDocuments: CareerDocumentRequirement[] = [
  { key: "cv", label: "CV profesional", required: true },
  { key: "dni", label: "DNI por ambos lados", required: true },
  { key: "antecedentesPenales", label: "Antecedentes penales" },
  { key: "antecedentesPoliciales", label: "Antecedentes policiales" },
  { key: "certiadulto", label: "Certiadulto" },
  { key: "sctr", label: "SCTR" },
  { key: "medicalExam", label: "Examen medico ocupacional" },
  { key: "bankCertificate", label: "Constancia bancaria" }
];

function textValue(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : fallback;
}

function mergeModuleConfig(current: unknown, careerForm: CareerFormConfig): Prisma.InputJsonValue {
  const base = current && typeof current === "object" && !Array.isArray(current) ? { ...(current as Record<string, unknown>) } : {};
  return { ...base, careerForm: careerForm as unknown as Prisma.InputJsonObject };
}

function workspaceConfigCarrier(workspace: { slug: string; name: string; brandName?: string | null }) {
  return { slug: workspace.slug, name: workspace.name, brandName: workspace.brandName || workspace.name };
}

async function saveCareerFormAction(formData: FormData) {
  "use server";

  const workspace = await getSessionTerraqoWorkspace();
  await requireWorkspaceModule("PROFESSIONAL_NETWORK", workspace.id);

  const workspaceModule = await prisma.terraqoWorkspaceModule.findUnique({
    where: { workspaceId_code: { workspaceId: workspace.id, code: "PROFESSIONAL_NETWORK" } },
    select: { config: true }
  });

  const current = resolveCareerFormConfig(workspaceConfigCarrier(workspace), workspaceModule?.config);
  const sections = current.sections.map((section) => ({
    ...section,
    description: textValue(formData, `section:${section.id}:description`, section.description || ""),
    fields: section.fields.map((field) => ({
      ...field,
      enabled: formData.has(`field:${field.key}:enabled`),
      required: formData.has(`field:${field.key}:required`),
      label: textValue(formData, `field:${field.key}:label`, field.label) || field.label,
      placeholder: textValue(formData, `field:${field.key}:placeholder`, field.placeholder || ""),
      helpText: textValue(formData, `field:${field.key}:helpText`, field.helpText || "")
    }))
  }));

  const documentMap = new Map<string, CareerDocumentRequirement>();
  [...recommendedDocuments, ...current.documentRequirements].forEach((document) => documentMap.set(document.key, document));
  const documentRequirements = Array.from(documentMap.values()).reduce<CareerDocumentRequirement[]>((items, document) => {
    if (!formData.has(`document:${document.key}:enabled`)) return items;
    items.push({
      ...document,
      label: textValue(formData, `document:${document.key}:label`, document.label) || document.label,
      description: textValue(formData, `document:${document.key}:description`, document.description || ""),
      required: formData.has(`document:${document.key}:required`)
    });
    return items;
  }, []);

  const nextConfig: CareerFormConfig = {
    ...current,
    version: `career-form-${Date.now()}`,
    headline: textValue(formData, "headline", current.headline) || current.headline,
    subheadline: textValue(formData, "subheadline", current.subheadline) || current.subheadline,
    intro: textValue(formData, "intro", current.intro) || current.intro,
    submitLabel: textValue(formData, "submitLabel", current.submitLabel) || current.submitLabel,
    privacyNote: textValue(formData, "privacyNote", current.privacyNote) || current.privacyNote,
    primaryColor: textValue(formData, "primaryColor", current.primaryColor || "#009688") || "#009688",
    sections,
    documentRequirements
  };

  await prisma.terraqoWorkspaceModule.update({
    where: { workspaceId_code: { workspaceId: workspace.id, code: "PROFESSIONAL_NETWORK" } },
    data: {
      config: mergeModuleConfig(workspaceModule?.config, nextConfig)
    }
  });

  revalidatePath("/admin/terraqo/red/formulario");
  revalidatePath("/admin/terraqo/red");
  redirect("/admin/terraqo/red/formulario?status=guardado");
}

function FieldEditor({ field }: { field: CareerFieldConfig }) {
  return (
    <div className="rounded-md border border-[#d8e0ec] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[#0e1a26]">{field.label}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#4374ba]">{fieldTypeLabels[field.type] || field.type}</p>
        </div>
        <div className="flex items-center gap-4 text-sm font-semibold text-[#2f4154]">
          <label className="inline-flex items-center gap-2">
            <input name={`field:${field.key}:enabled`} type="checkbox" defaultChecked={field.enabled !== false} />
            Visible
          </label>
          <label className="inline-flex items-center gap-2">
            <input name={`field:${field.key}:required`} type="checkbox" defaultChecked={Boolean(field.required)} />
            Obligatorio
          </label>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Input name={`field:${field.key}:label`} defaultValue={field.label} aria-label={`Etiqueta ${field.label}`} />
        <Input name={`field:${field.key}:placeholder`} defaultValue={field.placeholder || ""} placeholder="Placeholder visible" />
        <Textarea name={`field:${field.key}:helpText`} defaultValue={field.helpText || ""} placeholder="Texto de ayuda para el postulante" className="md:col-span-2" />
      </div>
    </div>
  );
}

export default async function CareerFormSettingsPage({ searchParams }: { searchParams?: Promise<{ status?: string }> }) {
  const params = await searchParams;
  const workspace = await getSessionTerraqoWorkspace();
  await requireWorkspaceModule("PROFESSIONAL_NETWORK", workspace.id);

  const workspaceModule = await prisma.terraqoWorkspaceModule.findUnique({
    where: { workspaceId_code: { workspaceId: workspace.id, code: "PROFESSIONAL_NETWORK" } },
    select: { config: true, active: true, updatedAt: true }
  });
  const formConfig = resolveCareerFormConfig(workspaceConfigCarrier(workspace), workspaceModule?.config);
  const documentMap = new Map<string, CareerDocumentRequirement>();
  [...recommendedDocuments, ...formConfig.documentRequirements].forEach((document) => documentMap.set(document.key, document));
  const documents = Array.from(documentMap.values());
  const enabledDocuments = new Set(formConfig.documentRequirements.map((document) => document.key));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4374ba]">Talento Terraqo</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#0e1a26]">Formulario publico por workspace</h1>
          <p className="mt-2 max-w-3xl text-[#35485b]">
            Personaliza los campos que vera el postulante en la pagina publica del cliente. Esta configuracion queda aislada para {workspace.name}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href="/admin/terraqo/red">Volver a profesionales</Link></Button>
          <Button asChild variant="outline"><Link href="/trabaja-con-nosotros" target="_blank">Ver formulario publico</Link></Button>
        </div>
      </div>

      {params?.status === "guardado" ? (
        <div className="rounded-md border border-[#8edbd4] bg-[#e8faf8] px-4 py-3 text-sm font-semibold text-[#4374ba]">
          Configuracion guardada. La web del workspace consumira estos campos automaticamente.
        </div>
      ) : null}

      <form action={saveCareerFormAction} className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Texto principal</CardTitle>
                <CardDescription>Define el lenguaje comercial del formulario publico.</CardDescription>
              </div>
              <Badge variant={workspaceModule?.active ? "default" : "secondary"}>{workspaceModule?.active ? "Modulo activo" : "Modulo inactivo"}</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-[#0e1a26]">Titulo</span>
              <Input name="headline" defaultValue={formConfig.headline} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-[#0e1a26]">Subtitulo</span>
              <Input name="subheadline" defaultValue={formConfig.subheadline} />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-[#0e1a26]">Introduccion</span>
              <Textarea name="intro" defaultValue={formConfig.intro} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-[#0e1a26]">Texto del boton</span>
              <Input name="submitLabel" defaultValue={formConfig.submitLabel} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-[#0e1a26]">Color principal</span>
              <Input name="primaryColor" defaultValue={formConfig.primaryColor || "#009688"} />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-[#0e1a26]">Nota de privacidad</span>
              <Textarea name="privacyNote" defaultValue={formConfig.privacyNote} />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Campos del formulario</CardTitle>
            <CardDescription>Activa solo lo que necesita este workspace. Las listas de equipos y software siguen saliendo de las taxonomias Terraqo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {formConfig.sections.map((section) => (
              <section key={section.id} className="space-y-3">
                <div className="rounded-md border border-[#d7e7ea] bg-[#f3f3f3] p-4">
                  <p className="font-semibold text-[#0e1a26]">{section.title}</p>
                  <Input className="mt-3" name={`section:${section.id}:description`} defaultValue={section.description || ""} placeholder="Descripcion de la seccion" />
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {section.fields.map((field) => <FieldEditor key={field.key} field={field} />)}
                </div>
              </section>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documentos solicitados</CardTitle>
            <CardDescription>Estos documentos apareceran como requerimientos del perfil profesional del postulante.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {documents.map((document) => (
              <div key={document.key} className="rounded-md border border-[#d8e0ec] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-[#0e1a26]">{document.label}</p>
                  <div className="flex items-center gap-4 text-sm font-semibold text-[#2f4154]">
                    <label className="inline-flex items-center gap-2">
                      <input name={`document:${document.key}:enabled`} type="checkbox" defaultChecked={enabledDocuments.has(document.key)} />
                      Pedir
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input name={`document:${document.key}:required`} type="checkbox" defaultChecked={Boolean(document.required)} />
                      Obligatorio
                    </label>
                  </div>
                </div>
                <div className="mt-4 grid gap-3">
                  <Input name={`document:${document.key}:label`} defaultValue={document.label} />
                  <Input name={`document:${document.key}:description`} defaultValue={document.description || ""} placeholder="Descripcion o condicion" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="sticky bottom-4 z-10 flex justify-end rounded-md border border-[#d8e0ec] bg-white/92 p-3 shadow-xl backdrop-blur">
          <Button type="submit" size="lg">Guardar configuracion del formulario</Button>
        </div>
      </form>
    </div>
  );
}
