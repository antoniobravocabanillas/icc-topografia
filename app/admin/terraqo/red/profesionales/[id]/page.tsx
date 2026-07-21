import Link from "next/link";
import { notFound } from "next/navigation";
import type { ElementType } from "react";
import { BadgeCheck, BriefcaseBusiness, CalendarClock, FileText, NotebookPen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfessionalDocumentPreview } from "@/components/terraqo/professional-document-preview";
import { UserAvatar } from "@/components/terraqo/user-avatar";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { attendanceStatusLabels, attendanceTypeLabels, evidenceStatusLabels, identityStatusLabels, professionalStatusLabels } from "@/lib/terraqo/labels";
import { getSessionTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

type AdminProfessionalPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminProfessionalPage({ params }: AdminProfessionalPageProps) {
  const { id } = await params;
  await requireAdminPage(["ADMIN", "SUPER_ADMIN"]);
  const workspaceId = await getSessionTerraqoWorkspaceId();
  if (!workspaceId) throw new Error("Workspace Terraqo no configurado.");
  await requireWorkspaceModule("PROFESSIONAL_NETWORK", workspaceId);

  const profile = await prisma.terraqoProfessionalProfile.findFirst({
    where: {
      id,
      user: { terraqoMemberships: { some: { workspaceId, active: true } } }
    },
    include: {
      user: { select: { name: true, email: true, image: true } },
      affiliations: { where: { workspaceId }, orderBy: [{ current: "desc" }, { updatedAt: "desc" }] },
      applications: { where: { workspaceId }, include: { jobPost: { select: { title: true, project: { select: { title: true } } } } }, orderBy: { createdAt: "desc" } },
      experiences: { where: { OR: [{ project: { terraqoWorkspaceId: workspaceId } }, { projectId: null }] }, include: { project: { select: { title: true, location: true } } }, orderBy: { createdAt: "desc" } },
      documents: { where: { workspaceId }, orderBy: { uploadedAt: "desc" } },
      worklogs: { where: { workspaceId, deletedAt: null }, include: { project: { select: { title: true } } }, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], take: 20 },
      attendanceEvents: { where: { workspaceId }, include: { project: { select: { title: true, location: true } } }, orderBy: [{ capturedAt: "desc" }, { createdAt: "desc" }], take: 30 }
    }
  });
  if (!profile) notFound();

  const name = profile.user.name || profile.user.email || "Profesional Terraqo";

  return (
    <section className="space-y-7">
      <div className="flex items-center justify-between gap-4">
        <Button asChild variant="outline"><Link href="/admin/terraqo/red">Volver a profesionales</Link></Button>
        {profile.username ? <Button asChild variant="outline"><Link href={`/cv/${profile.username}`} target="_blank">Ver CV publico</Link></Button> : null}
      </div>

      <Card className="overflow-hidden">
        <CardContent className="grid gap-7 bg-[#05363a] p-7 text-white lg:grid-cols-[1fr_280px] lg:items-center">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <UserAvatar name={name} image={profile.user.image} size="xl" className="border-white/70 bg-white/15 text-white" />
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-4xl font-bold">{name}</h1>
                <Badge className="bg-white/12 text-white hover:bg-white/12">{professionalStatusLabels[profile.status] ?? "Por revisar"}</Badge>
              </div>
              <p className="mt-2 text-lg font-semibold text-[#73e9df]">{profile.headline || profile.specialties[0] || "Perfil profesional"}</p>
              <p className="mt-2 text-white/70">{profile.city || "Ciudad por confirmar"} | {profile.yearsExperience ?? 0} anos de experiencia</p>
              <p className="mt-4 text-sm text-white/70">{profile.bio || "El profesional aun no completo su presentacion."}</p>
            </div>
          </div>
          <div className="rounded-lg border border-white/15 bg-white/8 p-5">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#73e9df]">Expediente</p>
            <p className="mt-3 font-display text-3xl font-bold">{identityStatusLabels[profile.identityVerificationStatus] ?? "Por revisar"}</p>
            <p className="mt-2 text-sm text-white/68">CV vivo: {profile.liveCvEnabled ? "activo" : "pendiente"}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 md:grid-cols-4">
        <Metric icon={BriefcaseBusiness} value={profile.experiences.length} label="Proyectos / experiencias" />
        <Metric icon={FileText} value={profile.applications.length} label="Postulaciones" />
        <Metric icon={NotebookPen} value={profile.worklogs.length} label="Bitacoras" />
        <Metric icon={CalendarClock} value={profile.attendanceEvents.length} label="Marcas de asistencia" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Proyectos y experiencia vinculada</CardTitle>
              <CardDescription>Puede participar en mas de un proyecto dentro del workspace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.experiences.map((experience) => (
                <article key={experience.id} className="rounded-md border p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{experience.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{experience.role || "Rol por confirmar"} | {experience.project?.title || "Sin proyecto publico"}</p>
                    </div>
                    {experience.verifiedByTerraqo ? <Badge><BadgeCheck className="mr-1 h-4 w-4" /> Validada</Badge> : <Badge variant="outline">Workspace</Badge>}
                  </div>
                </article>
              ))}
              {!profile.experiences.length ? <p className="text-sm text-muted-foreground">No hay experiencias vinculadas todavia.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bitacora del workspace</CardTitle>
              <CardDescription>Linea de tiempo de evidencia cargada por el profesional.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.worklogs.map((worklog) => (
                <article key={worklog.id} className="rounded-md border p-4">
                  <p className="font-mono text-xs uppercase tracking-[0.14em] text-primary">{new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(worklog.occurredAt)}</p>
                  <h2 className="mt-2 font-semibold">{worklog.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{worklog.summary}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{worklog.project?.title || "Sin proyecto"} | {evidenceStatusLabels[worklog.evidenceStatus] ?? "Por revisar"}</p>
                </article>
              ))}
              {!profile.worklogs.length ? <p className="text-sm text-muted-foreground">Aun no hay bitacoras en este workspace.</p> : null}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Asistencia reciente</CardTitle>
              <CardDescription>Entrada y salida con estado, distancia y fecha.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.attendanceEvents.map((event) => (
                <div key={event.id} className="rounded-md border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant={event.status === "ACCEPTED" ? "default" : "outline"}>{attendanceTypeLabels[event.type] ?? "Registro"}</Badge>
                    <span className="text-xs text-muted-foreground">{attendanceStatusLabels[event.status] ?? "Por revisar"}</span>
                  </div>
                  <p className="mt-2 font-semibold">{event.project?.title || "Sin proyecto asignado"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(event.capturedAt)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{event.distanceMeters !== null ? `${Math.round(Number(event.distanceMeters))} m del punto de trabajo` : "Sin geocerca calculada"}</p>
                </div>
              ))}
              {!profile.attendanceEvents.length ? <p className="text-sm text-muted-foreground">Sin marcas registradas.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documentos y datos</CardTitle>
              <CardDescription>Solo visible para el workspace vinculado.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {profile.documents.map((document) => (
                <ProfessionalDocumentPreview key={document.id} href={`/api/terraqo/professional-documents/${document.id}`} title={document.fileName} fileName={document.fileName} contentType={document.contentType} />
              ))}
              {!profile.documents.length ? <p className="text-sm text-muted-foreground">No hay documentos cargados para este workspace.</p> : null}
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}

function Metric({ icon: Icon, value, label }: { icon: ElementType; value: number; label: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <span className="grid h-12 w-12 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
        <div>
          <p className="font-display text-3xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
