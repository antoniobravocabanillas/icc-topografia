import Link from "next/link";
import { Prisma } from "@prisma/client";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { FormSubmitButton } from "@/components/admin/form-submit-button";
import { ProjectImageUploader } from "@/components/admin/project-image-uploader";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { projectStatusOptions } from "@/lib/project-status";
import { createProjectAction, createProjectProgressAction, deleteProjectAction, updateProjectAction } from "@/lib/server/admin-actions";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getSessionTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const projectStatusMessages: Record<string, string> = {
  created: "Proyecto creado correctamente.",
  updated: "Cambios del proyecto guardados correctamente.",
  deleted: "Proyecto eliminado correctamente.",
  error: "No se pudo completar la accion."
};

type AdminProjectsPageProps = {
  searchParams?: Promise<{
    projectStatus?: string;
    item?: string;
  }>;
};

type ProjectWithAdminDetails = Prisma.ProjectGetPayload<{
  include: {
    images: true;
    progress: {
      include: {
        staffProfile: true;
      };
    };
  };
}>;

export default async function AdminProjectsPage({ searchParams }: AdminProjectsPageProps) {
  await requireAdminPage(["EDITOR", "ADMIN", "SUPER_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT"]);
  const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
  await requireWorkspaceModule("PROJECTS", terraqoWorkspaceId);
  const resolvedSearchParams = await searchParams;
  const projectStatus = resolvedSearchParams?.projectStatus;
  const projectStatusMessage = projectStatus ? projectStatusMessages[projectStatus] : null;
  let projects: ProjectWithAdminDetails[];
  try {
    projects = await prisma.project.findMany({
      where: { terraqoWorkspaceId },
      include: {
        images: { orderBy: { position: "asc" } },
        progress: { include: { staffProfile: true }, orderBy: { createdAt: "desc" }, take: 5 }
      },
      orderBy: { updatedAt: "desc" },
      take: 100
    });
  } catch (error) {
    console.error("Admin projects load failed", error);
    return (
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase text-primary">Operacion tecnica</p>
          <h1 className="font-display text-3xl font-bold">Proyectos y casos</h1>
        </div>
        <Card>
          <CardContent className="p-8">
            <p className="font-semibold">No se pudieron cargar los proyectos administrativos.</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              La pagina ya no se cae completa. Verifica que Netlify apunte a la base ICC con `schema=icc` y que la estructura Prisma este aplicada.
            </p>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase text-primary">Operacion tecnica</p>
        <h1 className="font-display text-3xl font-bold">Proyectos y casos</h1>
        <p className="mt-2 text-muted-foreground">Administra trabajos topograficos, evidencia de campo, planos, reportes y estado de entrega.</p>
      </div>

      {projectStatusMessage ? (
        <div className={projectStatus === "error" ? "flex items-start gap-3 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-950" : "flex items-start gap-3 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950"}>
          <CheckCircle2 className={projectStatus === "error" ? "mt-0.5 h-5 w-5 shrink-0 text-red-600" : "mt-0.5 h-5 w-5 shrink-0 text-emerald-600"} />
          <div>
            <p className="font-semibold">{projectStatusMessage}</p>
            {resolvedSearchParams?.item ? <p className={projectStatus === "error" ? "mt-1 text-red-800" : "mt-1 text-emerald-800"}>{resolvedSearchParams.item}</p> : null}
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Nuevo proyecto</CardTitle>
          <CardDescription>Registra el alcance topografico, rubro, estado de campo/gabinete y evidencia para clientes.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectForm action={createProjectAction} submitLabel="Crear proyecto" />
        </CardContent>
      </Card>

      <div className="grid gap-5">
        {projects.map((project) => (
          <Card key={project.id}>
            <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle>{project.title}</CardTitle>
                <CardDescription>{project.location || "Sin ubicacion"} | {project.clientName || "Cliente no indicado"}</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={project.status} />
                {project.isPublic ? <StatusBadge status="PUBLISHED" /> : null}
                <Button asChild variant="outline" size="sm">
                  <Link href={`/proyectos/${project.slug}`} target="_blank">
                    Ver publico <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ProjectForm
                action={updateProjectAction.bind(null, project.id)}
                submitLabel="Guardar cambios"
                defaults={{
                  title: project.title,
                  slug: project.slug,
                  clientName: project.clientName || "",
                  location: project.location || "",
                  latitude: project.latitude?.toString() || "",
                  longitude: project.longitude?.toString() || "",
                  geofenceRadiusMeters: project.geofenceRadiusMeters.toString(),
                  category: project.category || "",
                  servicesApplied: project.servicesApplied.join("\n"),
                  summary: project.summary,
                  description: project.description,
                  challenge: project.challenge || "",
                  solution: project.solution || "",
                  results: project.results || "",
                  status: project.status,
                  isPublic: project.isPublic,
                  isFeatured: project.isFeatured,
                  images: project.images.map((image) => image.url).join("\n")
                }}
              />
              <form action={deleteProjectAction.bind(null, project.id)}>
                <Button type="submit" variant="destructive">Eliminar proyecto</Button>
              </form>
              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="font-semibold">Avances tecnicos</p>
                <div className="mt-3 grid gap-2">
                  {project.progress.map((entry) => (
                    <div key={entry.id} className="rounded-md bg-background p-3 text-sm">
                      <p className="font-semibold">{entry.title}</p>
                      <p className="mt-1 text-muted-foreground">{entry.body}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{entry.staffProfile?.displayName || "Equipo ICC"} | {entry.milestone || "Avance"}</p>
                    </div>
                  ))}
                  {!project.progress.length ? <p className="text-sm text-muted-foreground">Sin avances registrados.</p> : null}
                </div>
                <form action={createProjectProgressAction.bind(null, project.id)} className="mt-4 grid gap-3 md:grid-cols-2">
                  <Input name="title" placeholder="Titulo del avance" required />
                  <Input name="milestone" placeholder="Hito / etapa" />
                  <Textarea name="body" placeholder="Detalle tecnico del avance" required />
                  <Textarea name="files" placeholder="URLs de entregables o fotos, una por linea" />
                  <Button type="submit" className="md:col-span-2">Registrar avance</Button>
                </form>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function ProjectForm({
  action,
  submitLabel,
  defaults
}: {
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
  defaults?: {
    title: string;
    slug: string;
    clientName: string;
    location: string;
    latitude: string;
    longitude: string;
    geofenceRadiusMeters: string;
    category: string;
    servicesApplied: string;
    summary: string;
    description: string;
    challenge: string;
    solution: string;
    results: string;
    status: string;
    isPublic: boolean;
    isFeatured: boolean;
    images: string;
  };
}) {
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <Input name="title" placeholder="Titulo" defaultValue={defaults?.title} required />
      <Input name="slug" placeholder="slug-url" defaultValue={defaults?.slug} />
      <Input name="clientName" placeholder="Cliente" defaultValue={defaults?.clientName} />
      <Input name="location" placeholder="Ubicacion" defaultValue={defaults?.location} />
      <div className="grid gap-3 rounded-md border bg-muted/20 p-4 md:col-span-2 md:grid-cols-3">
        <div className="md:col-span-3">
          <p className="font-semibold">Ubicacion para control de asistencia</p>
          <p className="mt-1 text-sm text-muted-foreground">Coordenadas del puesto laboral. Solo las personas asignadas a este proyecto podran registrar entrada y salida dentro del radio indicado.</p>
        </div>
        <Input name="latitude" type="number" step="any" min="-90" max="90" placeholder="Latitud, ej. -12.0464" defaultValue={defaults?.latitude} />
        <Input name="longitude" type="number" step="any" min="-180" max="180" placeholder="Longitud, ej. -77.0428" defaultValue={defaults?.longitude} />
        <Input name="geofenceRadiusMeters" type="number" min="25" max="5000" step="1" placeholder="Radio en metros" defaultValue={defaults?.geofenceRadiusMeters || "250"} />
      </div>
      <Input name="category" placeholder="Rubro: habilitacion urbana, edificacion, vial, saneamiento..." defaultValue={defaults?.category} />
      <select name="status" defaultValue={defaults?.status || "PLANNING"} className="h-11 rounded-md border bg-background px-3 text-sm">
        {projectStatusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
      </select>
      <Textarea name="servicesApplied" placeholder="Servicios: levantamiento topografico, replanteo, nivelacion, georreferenciacion..." defaultValue={defaults?.servicesApplied} />
      <Textarea name="summary" placeholder="Descripcion corta" defaultValue={defaults?.summary} required />
      <Textarea name="description" placeholder="Descripcion completa" defaultValue={defaults?.description} required />
      <Textarea name="challenge" placeholder="Condicion de campo / reto tecnico" defaultValue={defaults?.challenge} />
      <Textarea name="solution" placeholder="Metodologia aplicada: control, levantamiento, replanteo, gabinete..." defaultValue={defaults?.solution} />
      <Textarea name="results" placeholder="Entregables: plano topografico, reporte QA/QC, puntos de control, metrados..." defaultValue={defaults?.results} />
      <ProjectImageUploader initialImages={defaults?.images ? defaults.images.split(/\r?\n/).filter(Boolean) : []} />
      <div className="grid content-start gap-3">
        <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-3 text-sm">
          <input type="checkbox" name="isPublic" defaultChecked={defaults?.isPublic ?? true} />
          Visible en web
        </label>
        <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-3 text-sm">
          <input type="checkbox" name="isFeatured" defaultChecked={defaults?.isFeatured ?? false} />
          Destacado
        </label>
      </div>
      <FormSubmitButton idleLabel={submitLabel} pendingLabel="Guardando..." className="md:col-span-2" />
    </form>
  );
}
