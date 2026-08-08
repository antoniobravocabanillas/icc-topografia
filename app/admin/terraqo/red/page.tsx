import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProfessionalDocumentPreview } from "@/components/terraqo/professional-document-preview";
import { LinkProfessionalProjectForm } from "@/components/admin/terraqo/link-professional-project-form";
import { UserAvatar } from "@/components/terraqo/user-avatar";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/server/api";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getSessionTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";
import { professionalCategories } from "@/lib/terraqo/professional-categories";

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

const documentTypeLabels: Record<string, string> = {
  CV: "CV",
  DNI_FRONT: "DNI frontal",
  DNI_BACK: "DNI posterior",
  CERTIFICATE: "Certificado",
  PROFESSIONAL_LICENSE: "Colegiatura / licencia",
  CRIMINAL_RECORD: "Antecedentes",
  MEDICAL_EXAM: "Examen medico",
  BANK_CERTIFICATE: "Constancia bancaria",
  OTHER: "Otro documento",
};

const attendanceTypeLabels: Record<string, string> = {
  CHECK_IN: "Entrada",
  CHECK_OUT: "Salida"
};

const attendanceStatusLabels: Record<string, string> = {
  ACCEPTED: "Aceptada",
  OUTSIDE_GEOFENCE: "Fuera del area del proyecto",
  LOCATION_UNAVAILABLE: "Ubicacion no disponible",
  REJECTED: "Rechazada"
};

const profileStatusLabels: Record<string, string> = {
  AVAILABLE: "Disponible",
  WORKING: "Trabajando",
  OPEN_TO_PROJECTS: "Disponible para proyectos",
  NOT_AVAILABLE: "No disponible"
};

const identityStatusLabels: Record<string, string> = {
  PENDING_DOCUMENTS: "Documentos pendientes",
  UNDER_REVIEW: "En revision",
  VERIFIED: "Verificada",
  REJECTED: "Rechazada"
};

const evidenceStatusLabels: Record<string, string> = {
  DECLARED: "Declarada",
  LINKED: "Vinculada",
  CONFIRMED: "Confirmada por workspace",
  VERIFIED: "Verificada por Terraqo"
};

const jobStatusLabels: Record<string, string> = {
  OPEN: "Abierta",
  PAUSED: "Pausada",
  CLOSED: "Cerrada",
  FILLED: "Cubierta"
};

async function createJobPostAction(formData: FormData) {
  "use server";

  await requireAdminPage(["ADMIN", "SUPER_ADMIN"]);
  const workspaceId = await getSessionTerraqoWorkspaceId();
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
      professionalCategories: listValue(formData, "professionalCategories"),
      visibility: "COMMUNITY",
      status: "OPEN"
    }
  });

  revalidatePath("/admin/terraqo/red");
}

async function updateApplicationStatusAction(formData: FormData) {
  "use server";

  await requireAdminPage(["ADMIN", "SUPER_ADMIN"]);
  const workspaceId = await getSessionTerraqoWorkspaceId();
  const applicationId = textValue(formData, "applicationId");
  const status = textValue(formData, "status");
  const allowedStatuses = ["SUBMITTED", "REVIEWING", "SHORTLISTED", "ACCEPTED", "REJECTED"] as const;
  if (!applicationId || !status || !allowedStatuses.includes(status as (typeof allowedStatuses)[number])) return;

  await prisma.terraqoProjectApplication.updateMany({
    where: { id: applicationId, workspaceId },
    data: { status: status as (typeof allowedStatuses)[number] }
  });

  revalidatePath("/admin/terraqo/red");
  redirect("/admin/terraqo/red?status=postulacion-guardada");
}

async function reviewIdentityAction(formData: FormData) {
  "use server";

  const session = await requireAdminPage(["ADMIN", "SUPER_ADMIN"]);
  const workspaceId = await getSessionTerraqoWorkspaceId();
  const professionalProfileId = textValue(formData, "professionalProfileId");
  const decision = textValue(formData, "decision");
  const reviewNote = textValue(formData, "reviewNote");
  if (!workspaceId || !professionalProfileId || !["VERIFIED", "REJECTED"].includes(decision || "")) return;

  const profile = await prisma.terraqoProfessionalProfile.findFirst({
    where: {
      id: professionalProfileId,
      applications: { some: { workspaceId } }
    },
    select: {
      id: true,
      documents: {
        where: {
          workspaceId,
          type: { in: ["DNI_FRONT", "DNI_BACK"] },
          reviewStatus: "SUBMITTED"
        },
        orderBy: { uploadedAt: "desc" }
      }
    }
  });
  if (!profile) return;

  const hasFront = profile.documents.some((document) => document.type === "DNI_FRONT");
  const hasBack = profile.documents.some((document) => document.type === "DNI_BACK");
  if (decision === "VERIFIED" && (!hasFront || !hasBack)) return;

  const reviewedAt = new Date();
  await prisma.$transaction([
    prisma.terraqoProfessionalDocument.updateMany({
      where: {
        professionalProfileId: profile.id,
        workspaceId,
        type: { in: ["DNI_FRONT", "DNI_BACK"] },
        reviewStatus: "SUBMITTED"
      },
      data: {
        reviewStatus: decision === "VERIFIED" ? "VERIFIED" : "REJECTED",
        reviewNote,
        reviewedAt,
        reviewedByUserId: session.user.id
      }
    }),
    prisma.terraqoProfessionalProfile.update({
      where: { id: profile.id },
      data: {
        identityVerificationStatus: decision === "VERIFIED" ? "VERIFIED" : "REJECTED",
        identityVerifiedAt: decision === "VERIFIED" ? reviewedAt : null,
        identityVerificationNote: reviewNote || null
      }
    })
  ]);

  revalidatePath("/admin/terraqo/red");
  redirect("/admin/terraqo/red?status=experiencia-vinculada");
}

async function linkProfessionalProjectAction(formData: FormData) {
  "use server";

  await requireAdminPage(["ADMIN", "SUPER_ADMIN"]);
  const workspaceId = await getSessionTerraqoWorkspaceId();
  await requireWorkspaceModule("LIVE_CV", workspaceId);

  const professionalProfileId = textValue(formData, "professionalProfileId");
  const selectedProjectIds = formData.getAll("projectIds").filter((value): value is string => typeof value === "string" && Boolean(value));
  const linkAllProjects = formData.get("allProjects") === "on";
  const title = textValue(formData, "title");
  if (!professionalProfileId || !title) return;

  const [profile, projects] = await Promise.all([
    prisma.terraqoProfessionalProfile.findFirst({
      where: {
        id: professionalProfileId,
        user: { terraqoMemberships: { some: { workspaceId, active: true } } }
      },
      select: { id: true }
    }),
    prisma.project.findMany({
      where: {
        terraqoWorkspaceId: workspaceId,
        deletedAt: null,
        ...(linkAllProjects ? {} : { id: { in: selectedProjectIds } })
      },
      select: { id: true, title: true, clientName: true, location: true }
    })
  ]);
  if (!profile || !projects.length) return;

  await prisma.$transaction([
    ...projects.map((project) =>
      prisma.terraqoProfessionalExperience.create({
        data: {
          professionalProfileId: profile.id,
          projectId: project.id,
          title,
          companyName: linkAllProjects ? project.clientName : textValue(formData, "companyName") || project.clientName,
          role: textValue(formData, "role"),
          location: linkAllProjects ? project.location : textValue(formData, "location") || project.location,
          verifiedByTerraqo: true,
          verificationNote: `Experiencia vinculada al proyecto ${project.title} por el workspace.`,
          visibility: "WORKSPACE"
        }
      })
    ),
    prisma.terraqoProfessionalProfile.update({
      where: { id: profile.id },
      data: { liveCvEnabled: true }
    })
  ]);

  revalidatePath("/admin/terraqo/red");
  redirect("/admin/terraqo/red?status=experiencia-vinculada");
}

async function reviewWorklogAction(formData: FormData) {
  "use server";

  const session = await requireAdminPage(["ADMIN", "SUPER_ADMIN"]);
  const workspaceId = await getSessionTerraqoWorkspaceId();
  const worklogId = textValue(formData, "worklogId");
  const evidenceStatus = textValue(formData, "evidenceStatus");
  if (!workspaceId || !worklogId || !["LINKED", "CONFIRMED", "VERIFIED"].includes(evidenceStatus || "")) return;
  if (evidenceStatus === "VERIFIED" && session.user.role !== "SUPER_ADMIN") return;

  await prisma.terraqoWorklogEntry.updateMany({
    where: { id: worklogId, workspaceId, deletedAt: null },
    data: { evidenceStatus: evidenceStatus as "LINKED" | "CONFIRMED" | "VERIFIED" }
  });

  revalidatePath("/admin/terraqo/red");
  revalidatePath("/portal/commons");
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TerraqoNetworkPageProps = {
  searchParams: Promise<{ status?: string }>;
};

const adminStatusMessages: Record<string, string> = {
  "postulacion-guardada": "Estado de postulacion guardado correctamente.",
  "experiencia-vinculada": "Profesional vinculado al proyecto. Ya puede registrar evidencia y asistencia asociada."
};

export default async function TerraqoNetworkPage({ searchParams }: TerraqoNetworkPageProps) {
  const params = await searchParams;
  await requireAdminPage(["ADMIN", "SUPER_ADMIN"]);
  const workspaceId = await getSessionTerraqoWorkspaceId();
  if (!workspaceId) throw new Error("Workspace Terraqo no configurado.");
  await requireWorkspaceModule("PROFESSIONAL_NETWORK", workspaceId);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const [workspace, profiles, jobs, projects, applications, worklogs, attendanceEvents] = await Promise.all([
    prisma.terraqoWorkspace.findUnique({
      where: { id: workspaceId },
      include: { subscriptions: { orderBy: { createdAt: "desc" }, take: 1 } }
    }),
    prisma.terraqoProfessionalProfile.findMany({
      where: { user: { terraqoMemberships: { some: { workspaceId, active: true } } } },
      include: {
        user: true,
        affiliations: { where: { workspaceId }, orderBy: { updatedAt: "desc" }, take: 2 },
        experiences: { include: { project: true }, orderBy: { startedAt: "desc" }, take: 3 },
        applications: { where: { workspaceId }, include: { jobPost: true }, orderBy: { createdAt: "desc" }, take: 3 },
        documents: {
          where: {
            workspaceId,
            reviewStatus: { in: ["SUBMITTED", "VERIFIED"] }
          },
          orderBy: { uploadedAt: "desc" }
        }
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
      select: { id: true, title: true, clientName: true, location: true },
      take: 80
    }),
    prisma.terraqoProjectApplication.findMany({
      where: { workspaceId },
      include: {
        user: { select: { name: true, email: true } },
        professionalProfile: { select: { headline: true, city: true, professionalCategories: true } },
        jobPost: { select: { title: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.terraqoWorklogEntry.findMany({
      where: { workspaceId, deletedAt: null },
      include: {
        author: { select: { name: true, email: true } },
        project: { select: { title: true } }
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 60
    }),
    prisma.terraqoAttendanceEvent.findMany({
      where: { workspaceId },
      include: {
        user: { select: { name: true, email: true, image: true } },
        professionalProfile: { select: { id: true, headline: true, username: true } },
        project: { select: { title: true, location: true } }
      },
      orderBy: [{ capturedAt: "desc" }, { createdAt: "desc" }],
      take: 80
    })
  ]);

  const available = profiles.filter((profile) => ["AVAILABLE", "OPEN_TO_PROJECTS"].includes(profile.status)).length;
  const verifiedExperiences = profiles.reduce((total, profile) => total + profile.experiences.filter((item) => item.verifiedByTerraqo).length, 0);
  const attendanceToday = attendanceEvents.filter((event) => event.capturedAt >= startOfToday);
  const acceptedAttendanceToday = attendanceToday.filter((event) => event.status === "ACCEPTED").length;
  const rejectedAttendanceToday = attendanceToday.filter((event) => event.status === "REJECTED").length;
  const uniqueProfessionalsToday = new Set(attendanceToday.map((event) => event.userId)).size;

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

      {params.status && adminStatusMessages[params.status] ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {adminStatusMessages[params.status]}
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-4">
        <Metric title={profiles.length} label="Profesionales registrados" />
        <Metric title={available} label="Disponibles o abiertos" />
        <Metric title={jobs.length} label="Convocatorias activas" />
        <Metric title={verifiedExperiences} label="Experiencias validadas" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Control de entrada y salida</CardTitle>
          <CardDescription>
            Registro operativo capturado con hora del servidor, ubicacion del dispositivo y validacion disponible en el telefono del profesional.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Metric title={uniqueProfessionalsToday} label="Profesionales con marca hoy" />
            <Metric title={acceptedAttendanceToday} label="Marcas aceptadas hoy" />
            <Metric title={rejectedAttendanceToday} label="Intentos fuera de zona o rechazados" />
          </div>
          <div className="grid gap-3">
            {attendanceEvents.slice(0, 8).map((event) => (
              <div key={event.id} className="grid gap-3 rounded-md border p-4 lg:grid-cols-[1fr_180px_180px] lg:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar name={event.user.name || event.user.email} image={event.user.image} />
                  <div className="min-w-0">
                    {event.professionalProfileId ? (
                      <Link href={`/admin/terraqo/red/profesionales/${event.professionalProfileId}`} className="font-semibold hover:text-primary">
                        {event.user.name || event.user.email || "Profesional"}
                      </Link>
                    ) : (
                      <p className="font-semibold">{event.user.name || event.user.email || "Profesional"}</p>
                    )}
                    <p className="truncate text-sm text-muted-foreground">{event.project?.title || "Sin proyecto"} | {event.project?.location || "Ubicacion por revisar"}</p>
                  </div>
                </div>
                <div>
                  <Badge variant={event.status === "ACCEPTED" ? "default" : "outline"}>
                    {attendanceTypeLabels[event.type] ?? event.type} - {attendanceStatusLabels[event.status] ?? "Por revisar"}
                  </Badge>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {event.distanceMeters !== null ? `${Math.round(Number(event.distanceMeters))} m del punto` : "Sin distancia calculada"}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">{new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(event.capturedAt)}</p>
              </div>
            ))}
            {!attendanceEvents.length ? <p className="text-sm text-muted-foreground">Aun no hay registros de entrada o salida en este workspace.</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vincular experiencia a un proyecto</CardTitle>
          <CardDescription>
            Una experiencia validada alimenta el CV vivo del profesional y conserva el proyecto que la respalda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LinkProfessionalProjectForm
            action={linkProfessionalProjectAction}
            profiles={profiles.map((profile) => ({ id: profile.id, label: profile.user.name || profile.user.email || "Profesional" }))}
            projects={projects}
          />
        </CardContent>
      </Card>

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
              <Textarea
                name="professionalCategories"
                placeholder={`Categorias profesionales, una por linea. Ej. ${professionalCategories.slice(0, 3).join(", ")}`}
              />
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
                    <Badge>{jobStatusLabels[job.status] ?? job.status}</Badge>
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
          <CardTitle>Bitacoras y evidencia del workspace</CardTitle>
          <CardDescription>
            Confirma solo evidencia producida dentro de {workspace?.name}. La verificacion Terraqo queda reservada para una revision independiente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {worklogs.map((worklog) => (
            <div key={worklog.id} className="grid gap-4 rounded-md border p-4 lg:grid-cols-[1fr_220px] lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{worklog.title}</p>
                  <Badge variant="outline">{evidenceStatusLabels[worklog.evidenceStatus] ?? worklog.evidenceStatus}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{worklog.summary}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {worklog.author.name || worklog.author.email || "Profesional"} | {worklog.project?.title || "Sin proyecto vinculado"}
                </p>
              </div>
              <form action={reviewWorklogAction} className="flex gap-2">
                <input type="hidden" name="worklogId" value={worklog.id} />
                <select name="evidenceStatus" defaultValue={worklog.evidenceStatus} className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm">
                  <option value="LINKED">Vinculada</option>
                  <option value="CONFIRMED">Confirmada por ICC</option>
                  {worklog.evidenceStatus === "VERIFIED" ? <option value="VERIFIED">Verificada por Terraqo</option> : null}
                </select>
                <Button type="submit" variant="outline">Guardar</Button>
              </form>
            </div>
          ))}
          {!worklogs.length ? <p className="text-sm text-muted-foreground">Aun no hay bitacoras vinculadas a este workspace.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Postulaciones recibidas</CardTitle>
          <CardDescription>Seguimiento privado de candidatos del workspace, incluida la bolsa de talento general.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {applications.map((application) => (
            <div key={application.id} className="grid gap-4 rounded-md border p-4 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center">
              <div>
                <p className="font-semibold">{application.user?.name || application.user?.email || "Profesional"}</p>
                <p className="text-sm text-muted-foreground">{application.user?.email}</p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-primary">
                  {application.professionalCategory || application.professionalProfile?.professionalCategories[0] || "Categoria por revisar"}
                </p>
              </div>
              <div>
                <p className="font-medium">{application.jobPost?.title || "Bolsa de talento general"}</p>
                <p className="text-sm text-muted-foreground">
                  {application.professionalProfile?.headline || "Perfil por completar"} | {application.professionalProfile?.city || "Ciudad por confirmar"}
                </p>
              </div>
              <form action={updateApplicationStatusAction} className="flex gap-2">
                <input type="hidden" name="applicationId" value={application.id} />
                <select name="status" defaultValue={application.status} className="h-10 rounded-md border bg-background px-3 text-sm">
                  <option value="SUBMITTED">Recibida</option>
                  <option value="REVIEWING">En revision</option>
                  <option value="SHORTLISTED">Preseleccionada</option>
                  <option value="ACCEPTED">Aceptada</option>
                  <option value="REJECTED">No seleccionada</option>
                </select>
                <Button type="submit" variant="outline">Guardar</Button>
              </form>
            </div>
          ))}
          {!applications.length ? <p className="text-sm text-muted-foreground">Aun no hay postulaciones para este workspace.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profesionales</CardTitle>
          <CardDescription>
            La experiencia validada alimenta el CV vivo. La visibilidad se controla por plan y permisos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[1360px] text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-3">Perfil</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Especialidad</th>
                  <th className="p-3">Herramientas</th>
                  <th className="p-3">Identidad</th>
                  <th className="p-3">CV vivo</th>
                  <th className="p-3">Expediente privado</th>
                  <th className="p-3">Postulaciones</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr key={profile.id} className="border-t align-top">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <UserAvatar name={profile.user.name || profile.user.email} image={profile.user.image} />
                        <div>
                          <Link href={`/admin/terraqo/red/profesionales/${profile.id}`} className="font-semibold hover:text-primary">{profile.user.name || profile.user.email}</Link>
                          <div className="mt-1 text-xs text-muted-foreground">{profile.user.email}</div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">{profile.city || "Ciudad por definir"} | {profile.yearsExperience ?? 0} años</div>
                      <Button asChild variant="outline" size="sm" className="mt-3">
                        <Link href={`/admin/terraqo/red/profesionales/${profile.id}`}>Ver perfil completo</Link>
                      </Button>
                    </td>
                    <td className="p-3"><Badge variant="outline">{profileStatusLabels[profile.status] ?? profile.status}</Badge></td>
                    <td className="p-3">{profile.specialties.slice(0, 3).join(", ") || "Sin especialidad"}</td>
                    <td className="p-3">{[...profile.equipment, ...profile.software].slice(0, 4).join(", ") || "Por completar"}</td>
                    <td className="p-3">
                      <div className="space-y-2">
                        <Badge variant={profile.identityVerificationStatus === "VERIFIED" ? "default" : "outline"}>
                          {identityStatusLabels[profile.identityVerificationStatus] ?? profile.identityVerificationStatus}
                        </Badge>
                        <div className="flex flex-wrap gap-2">
                          {profile.documents.filter((document) => ["DNI_FRONT", "DNI_BACK"].includes(document.type)).slice(0, 2).map((document) => (
                            <ProfessionalDocumentPreview
                              key={document.id}
                              href={`/api/terraqo/professional-documents/${document.id}`}
                              title={document.type === "DNI_FRONT" ? "Ver frente" : "Ver reverso"}
                              fileName={document.fileName}
                              contentType={document.contentType}
                            />
                          ))}
                        </div>
                        {profile.identityVerificationStatus === "UNDER_REVIEW" ? (
                          <form action={reviewIdentityAction} className="grid min-w-[240px] gap-2">
                            <input type="hidden" name="professionalProfileId" value={profile.id} />
                            <Input name="reviewNote" placeholder="Observacion opcional" className="h-9" />
                            <div className="flex gap-2">
                              <Button name="decision" value="VERIFIED" type="submit" size="sm">Verificar</Button>
                              <Button name="decision" value="REJECTED" type="submit" size="sm" variant="outline">Rechazar</Button>
                            </div>
                          </form>
                        ) : null}
                      </div>
                    </td>
                    <td className="p-3">
                      <div>{profile.liveCvEnabled ? "Activado" : "No activado"}</div>
                      <div className="text-xs text-muted-foreground">{profile.experiences.length} experiencias recientes</div>
                      {profile.documents.find((document) => document.type === "CV") ? (
                        (() => {
                          const cv = profile.documents.find((document) => document.type === "CV")!;
                          return <div className="mt-2"><ProfessionalDocumentPreview href={`/api/terraqo/professional-documents/${cv.id}`} title="Previsualizar CV" fileName={cv.fileName} contentType={cv.contentType} /></div>;
                        })()
                      ) : null}
                    </td>
                    <td className="p-3">
                      <div className="flex max-w-[280px] flex-wrap gap-2">
                        {profile.documents.filter((document) => !["CV", "DNI_FRONT", "DNI_BACK"].includes(document.type)).map((document) => (
                          <ProfessionalDocumentPreview
                            key={document.id}
                            href={`/api/terraqo/professional-documents/${document.id}`}
                            title={documentTypeLabels[document.type] || "Documento"}
                            fileName={document.fileName}
                            contentType={document.contentType}
                          />
                        ))}
                        {!profile.documents.some((document) => !["CV", "DNI_FRONT", "DNI_BACK"].includes(document.type)) ? <span className="text-xs text-muted-foreground">Sin documentos complementarios</span> : null}
                      </div>
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
