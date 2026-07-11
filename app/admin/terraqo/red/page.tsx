import { revalidatePath } from "next/cache";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/server/api";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getDefaultTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function listValue(formData: FormData, key: string) {
  return (textValue(formData, key) || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function createJobPostAction(formData: FormData) {
  "use server";

  await requireAdminPage(["ADMIN", "SUPER_ADMIN"]);
  const workspaceId = await getDefaultTerraqoWorkspaceId();
  if (!workspaceId) throw new Error("Workspace Terraqo no configurado.");
  await requireWorkspaceModule("JOB_MARKETPLACE", workspaceId);

  const title = textValue(formData, "title") || "";
  const summary = textValue(formData, "summary") || "";
  const description = textValue(formData, "description") || "";
  if (!title || !summary || !description) return;

  await prisma.terraqoJobPost.create({
    data: {
      workspaceId,
      projectId: textValue(formData, "projectId"),
      title,
      slug: `${slugify(title)}-${String(Date.now()).slice(-6)}`,
      summary,
      description,
      location: textValue(formData, "location"),
      modality: textValue(formData, "modality"),
      budgetRange: textValue(formData, "budgetRange"),
      requiredSkills: listValue(formData, "requiredSkills"),
      requiredTools: listValue(formData, "requiredTools"),
      visibility: "COMMUNITY",
      status: "OPEN"
    }
  });

  revalidatePath("/admin/terraqo/red");
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TerraqoNetworkPage() {
  await requireAdminPage(["ADMIN", "SUPER_ADMIN"]);
  const workspaceId = await getDefaultTerraqoWorkspaceId();
  if (!workspaceId) throw new Error("Workspace Terraqo no configurado.");
  await requireWorkspaceModule("PROFESSIONAL_NETWORK", workspaceId);

  const [workspace, profiles, jobs, projects] = await Promise.all([
    prisma.terraqoWorkspace.findUnique({
      where: { id: workspaceId },
      include: { subscriptions: { orderBy: { createdAt: "desc" }, take: 1 } }
    }),
    prisma.terraqoProfessionalProfile.findMany({
      include: {
        user: true,
        experiences: { include: { project: true }, orderBy: { startedAt: "desc" }, take: 3 },
        applications: { include: { jobPost: true }, orderBy: { createdAt: "desc" }, take: 3 }
      },
      orderBy: { updatedAt: "desc" },
      take: 80
    }),
    prisma.terraqoJobPost.findMany({
      where: { workspaceId, deletedAt: null },
      include: { project: true, _count: { select: { applications: true } } },
      orderBy: { createdAt: "desc" },
      take: 80
    }),
    prisma.project.findMany({
      where: { terraqoWorkspaceId: workspaceId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true },
      take: 80
    })
  ]);

  const available = profiles.filter((profile) => ["AVAILABLE", "OPEN_TO_PROJECTS"].includes(profile.status)).length;
  const verifiedExperiences = profiles.reduce((total, profile) => total + profile.experiences.filter((item) => item.verifiedByTerraqo).length, 0);

  return (
    <section className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase text-primary">Terraqo red profesional</p>
          <h1 className="font-display text-3xl font-bold">Perfiles, CV vivo y convocatorias</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Gestiona el talento disponible para {workspace?.name}. Terraqo puede operar esta red para cualquier rubro:
            profesionales, postulaciones privadas, experiencia validada por proyectos y convocatorias activables por plan.
          </p>
        </div>
        <Badge variant="secondary">{workspace?.subscriptions[0]?.tier ?? "Sin plan"}</Badge>
      </div>

      <div className="grid gap-5 md:grid-cols-4">
        <Metric title={profiles.length} label="Profesionales registrados" />
        <Metric title={available} label="Disponibles o abiertos" />
        <Metric title={jobs.length} label="Convocatorias activas" />
        <Metric title={verifiedExperiences} label="Experiencias validadas" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Nueva convocatoria</CardTitle>
            <CardDescription>
              Publica una necesidad privada o comunitaria para captar perfiles desde Terraqo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createJobPostAction} className="grid gap-3">
              <Input name="title" placeholder="Ej. Especialista para control de obra" required />
              <Input name="summary" placeholder="Resumen visible para profesionales" required />
              <select name="projectId" className="h-11 rounded-md border bg-background px-3 text-sm">
                <option value="">Sin proyecto vinculado</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.title}</option>
                ))}
              </select>
              <div className="grid gap-3 md:grid-cols-2">
                <Input name="location" placeholder="Ubicacion" />
                <Input name="modality" placeholder="Modalidad" />
              </div>
              <Input name="budgetRange" placeholder="Rango referencial" />
              <Textarea name="description" placeholder="Alcance, responsabilidades y contexto" required />
              <Textarea name="requiredSkills" placeholder="Habilidades requeridas, una por linea" />
              <Textarea name="requiredTools" placeholder="Equipos o software, uno por linea" />
              <Button type="submit">Crear convocatoria</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Convocatorias</CardTitle>
            <CardDescription>Necesidades publicadas dentro del workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {jobs.map((job) => (
              <div key={job.id} className="rounded-md border p-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div>
                    <p className="font-semibold">{job.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{job.summary}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {job.project?.title ?? "Sin proyecto"} | {job.location ?? "Ubicacion por definir"} | {job.modality ?? "Modalidad por definir"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{job.status}</Badge>
                    <Badge variant="outline">{job._count.applications} postulaciones</Badge>
                  </div>
                </div>
              </div>
            ))}
            {!jobs.length ? <p className="text-sm text-muted-foreground">Aun no hay convocatorias registradas.</p> : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profesionales</CardTitle>
          <CardDescription>
            La experiencia validada alimenta el CV vivo. La visibilidad se controla por plan y permisos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-3">Perfil</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Especialidad</th>
                  <th className="p-3">Herramientas</th>
                  <th className="p-3">CV vivo</th>
                  <th className="p-3">Postulaciones</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr key={profile.id} className="border-t align-top">
                    <td className="p-3">
                      <div className="font-semibold">{profile.user.name || profile.user.email}</div>
                      <div className="text-xs text-muted-foreground">{profile.city || "Ciudad por definir"} | {profile.yearsExperience ?? 0} anos</div>
                    </td>
                    <td className="p-3"><Badge variant="outline">{profile.status}</Badge></td>
                    <td className="p-3">{profile.specialties.slice(0, 3).join(", ") || "Sin especialidad"}</td>
                    <td className="p-3">{[...profile.equipment, ...profile.software].slice(0, 4).join(", ") || "Por completar"}</td>
                    <td className="p-3">
                      <div>{profile.liveCvEnabled ? "Activado" : "No activado"}</div>
                      <div className="text-xs text-muted-foreground">{profile.experiences.length} experiencias recientes</div>
                    </td>
                    <td className="p-3">{profile.applications.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function Metric({ title, label }: { title: number; label: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-3xl">{title}</CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
    </Card>
  );
}
