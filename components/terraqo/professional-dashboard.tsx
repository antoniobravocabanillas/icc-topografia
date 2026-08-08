import Link from "next/link";
import type { Prisma } from "@prisma/client";
import type { ElementType } from "react";
import {
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  ChevronRight,
  ExternalLink,
  FileText,
  MapPin,
  NotebookPen,
  ShieldCheck
} from "lucide-react";



import { ProfessionalPhotoUploader } from "@/components/portal/professional-photo-uploader";
import { ProfessionalDocumentUploader } from "@/components/portal/professional-document-uploader";
import { WorklogCard } from "@/components/terraqo/worklog-card";
import { FieldVerificationPanel } from "@/components/terraqo/field-verification-panel";
import { Button } from "@/components/ui/button";
import { terraqoDomains } from "@/lib/terraqo-domains";
import { formatExperienceDuration, monthsBetween } from "@/lib/terraqo/profile-summary";
import { worklogInclude } from "@/lib/terraqo/worklog";

export type ProfessionalDashboardProfile = Prisma.TerraqoProfessionalProfileGetPayload<{
  include: {
    user: { select: { name: true; email: true; image: true } };
    experiences: { include: { project: { select: { title: true; slug: true; location: true; images: { select: { url: true } } } } } };
    affiliations: true;
    applications: { include: { workspace: { select: { name: true } }; jobPost: { select: { title: true } } } };
    documents: { select: { id: true; type: true; fileName: true; contentType: true; size: true; reviewStatus: true; reviewNote: true; uploadedAt: true } };
    worklogs: { include: typeof worklogInclude };
  };
}>;

const statusCopy = {
  AVAILABLE: "Disponible",
  WORKING: "Trabajando actualmente",
  OPEN_TO_PROJECTS: "Abierto a proyectos",
  NOT_AVAILABLE: "No disponible"
} as const;

const applicationStatusCopy: Record<string, string> = {
  SUBMITTED: "Recibida",
  REVIEWING: "En revision",
  SHORTLISTED: "Preseleccionada",
  ACCEPTED: "Aceptada",
  REJECTED: "No seleccionada"
};

function completion(profile: ProfessionalDashboardProfile) {
  const values = [
    profile.user.name,
    profile.user.image,
    profile.headline,
    profile.bio,
    profile.city,
    profile.yearsExperience !== null,
    profile.professionalCategories.length,
    profile.specialties.length,
    profile.equipment.length || profile.software.length,
    profile.documents.some((document) => document.type === "CV"),
    profile.identityVerificationStatus === "VERIFIED"
  ];
  return Math.round((values.filter(Boolean).length / values.length) * 100);
}

function ProfileMetric({ icon: Icon, value, label, detail }: { icon: ElementType; value: number; label: string; detail: string }) {
  return (
    <div className="flex min-h-28 items-center gap-4 rounded-lg border bg-white p-5 shadow-[0_12px_32px_rgba(1,45,56,0.06)]">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
      <div><p className="font-display text-3xl font-bold text-[#071b28]">{value}</p><p className="text-sm font-semibold text-[#304752]">{label}</p><p className="text-xs text-muted-foreground">{detail}</p></div>
    </div>
  );
}

function ActivityRow({ icon: Icon, title, detail }: { icon: ElementType; title: string; detail: string }) {
  return (
    <div className="flex gap-3 border-b py-3 last:border-0">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
      <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#102733]">{title}</p><p className="mt-0.5 text-xs text-muted-foreground">{detail}</p></div>
    </div>
  );
}

export function ProfessionalDashboard({ profile, workspaceId }: { profile: ProfessionalDashboardProfile; workspaceId: string }) {
  const name = profile.user.name || profile.user.email;
  const percent = completion(profile);
  const verifiedExperiences = profile.experiences.filter((experience) => experience.verifiedByTerraqo).length;
  const hasCv = profile.documents.some((document) => document.type === "CV");
  const identityComplete = profile.identityVerificationStatus === "VERIFIED";
  const publicCvHref = profile.username ? `${terraqoDomains.public}/cv/${profile.username}` : null;
  const totalMonths = profile.experiences.reduce((sum, experience) => sum + monthsBetween(experience.startedAt, experience.currentlyWorking ? null : experience.endedAt), 0);

  return (
    <div className="min-w-0 space-y-6 py-6 lg:py-8">
          <section id="perfil" className="relative overflow-hidden rounded-lg bg-[#052f32] p-6 text-white shadow-[0_24px_70px_rgba(2,47,53,0.18)] lg:p-8">
            <div className="absolute inset-y-0 right-0 w-2/5 opacity-20 [background-image:repeating-radial-gradient(ellipse_at_center,rgba(100,232,219,0.4)_0_1px,transparent_1px_14px)]" />
            <div className="relative grid items-center gap-7 lg:grid-cols-[minmax(0,1fr)_190px]">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                <ProfessionalPhotoUploader name={name} image={profile.user.image} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3"><h1 className="font-display text-3xl font-bold lg:text-4xl">{name}</h1>{identityComplete ? <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-[#76ece1]"><BadgeCheck className="h-4 w-4" /> Perfil verificado</span> : null}</div>
                  <p className="mt-2 text-lg font-semibold text-[#62ddd2]">{profile.headline || profile.specialties[0] || "Profesional Terraqo"}</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-white/70"><span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-[#62ddd2]" />{profile.locationCity || profile.city || "Ubicacion por completar"}</span><span>|</span><span>{formatExperienceDuration(totalMonths)} de experiencia</span></div>
                  {profile.generatedSummary ? <p className="mt-4 max-w-3xl text-sm leading-6 text-white/70">{profile.generatedSummary}</p> : null}
                  <div className="mt-6 flex flex-wrap gap-3"><Button asChild className="bg-primary text-white hover:bg-primary/90"><Link href={`/portal/profesionales/${profile.id}`}>Ver perfil <ChevronRight className="ml-2 h-4 w-4" /></Link></Button><Button asChild variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10"><Link href="/portal/documentos">Completar perfil</Link></Button></div>
                </div>
              </div>
              <div className="justify-self-center text-center">
                <div className="grid h-28 w-28 place-items-center rounded-full" style={{ background: `conic-gradient(#19b7aa ${percent * 3.6}deg, rgba(255,255,255,0.13) 0deg)` }}><div className="grid h-[86px] w-[86px] place-items-center rounded-full bg-[#052f32] font-display text-2xl font-bold">{percent}%</div></div>
                <p className="mt-3 text-sm text-white/75">Perfil completo</p>
              </div>
            </div>
          </section>

          <FieldVerificationPanel endpoint={`/api/terraqo/field-verification?workspaceId=${workspaceId}`} compact />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ProfileMetric icon={BriefcaseBusiness} value={profile.experiences.length} label="Experiencias" detail="registradas" />
            <ProfileMetric icon={FileText} value={profile.applications.length} label="Postulaciones" detail="enviadas" />
            <ProfileMetric icon={ShieldCheck} value={verifiedExperiences} label="Validaciones" detail="aprobadas" />
            <ProfileMetric icon={NotebookPen} value={profile.worklogs.length} label="Evidencias" detail="en tu CV vivo" />
          </div>

          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <section id="experiencias" className="rounded-lg border bg-white p-6 shadow-[0_14px_36px_rgba(1,45,56,0.05)]">
                  <div className="flex items-center justify-between"><h2 className="font-display text-xl font-bold">Experiencia destacada</h2><Link href="/portal/experiencias" className="text-xs font-semibold text-primary">Ver todas</Link></div>
                  <div className="mt-4 divide-y">
                    {profile.experiences.slice(0, 3).map((experience) => (
                      <article key={experience.id} className="py-4 first:pt-0">
                        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-[#102733]">{experience.title}</p><p className="mt-1 text-xs text-muted-foreground">{experience.companyName || "Empresa por confirmar"} | {experience.role || "Rol profesional"}</p>{experience.project ? <p className="mt-2 text-xs font-semibold text-primary">Proyecto: {experience.project.title}</p> : null}</div>{experience.verifiedByTerraqo ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">Validado</span> : null}</div>
                      </article>
                    ))}
                    {!profile.experiences.length ? <p className="py-8 text-center text-sm text-muted-foreground">Registra tu primera experiencia desde una bitacora o proyecto.</p> : null}
                  </div>
                </section>

                <section id="actividad" className="scroll-mt-28 rounded-lg border bg-white p-6 shadow-[0_14px_36px_rgba(1,45,56,0.05)]">
                  <h2 className="font-display text-xl font-bold">Actividad reciente</h2>
                  <div className="mt-3">
                    {profile.applications.slice(0, 2).map((application) => <ActivityRow key={application.id} icon={BriefcaseBusiness} title={application.jobPost?.title || "Postulacion enviada"} detail={`${application.workspace.name} | ${applicationStatusCopy[application.status] ?? "Por revisar"}`} />)}
                    {profile.worklogs.slice(0, 2).map((worklog) => <ActivityRow key={worklog.id} icon={NotebookPen} title={worklog.title} detail="Evidencia agregada al CV vivo" />)}
                    {!profile.applications.length && !profile.worklogs.length ? <p className="py-8 text-center text-sm text-muted-foreground">Tu actividad aparecera aqui.</p> : null}
                  </div>
                </section>
              </div>

              {profile.worklogs.length ? <section><div className="mb-4 flex items-end justify-between"><div><p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">CV vivo</p><h2 className="mt-1 font-display text-2xl font-bold">Trabajo documentado</h2></div><Link href="/portal/bitacora" className="text-sm font-semibold text-primary">Ver bitacora</Link></div><div className="grid gap-5 lg:grid-cols-2">{profile.worklogs.map((worklog) => <WorklogCard key={worklog.id} worklog={worklog} viewerId={profile.userId} />)}</div></section> : null}

              <section id="postulaciones" className="rounded-lg border bg-white p-6"><h2 className="font-display text-xl font-bold">Postulaciones</h2><div className="mt-4 grid gap-3">{profile.applications.map((application) => <div key={application.id} className="flex flex-col justify-between gap-3 rounded-md border p-4 sm:flex-row sm:items-center"><div><p className="font-semibold">{application.jobPost?.title || "Bolsa de talento general"}</p><p className="text-sm text-muted-foreground">{application.workspace.name}</p></div><span className="w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{applicationStatusCopy[application.status] ?? "Por revisar"}</span></div>)}{!profile.applications.length ? <p className="text-sm text-muted-foreground">Aun no tienes postulaciones.</p> : null}</div></section>
            </div>

            <aside className="space-y-6">
              <section className="rounded-lg border bg-white p-6 shadow-[0_14px_36px_rgba(1,45,56,0.05)]"><div className="flex gap-4"><span className="grid h-12 w-12 place-items-center rounded-lg bg-primary/10 text-primary"><CalendarDays className="h-5 w-5" /></span><div><h2 className="font-display text-lg font-bold">Disponibilidad</h2><span className="mt-2 inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{statusCopy[profile.status]}</span></div></div><div className="mt-5 border-t pt-4 text-sm"><p className="font-semibold">Ubicacion</p><p className="mt-1 text-muted-foreground">{profile.city || "Por completar"}</p><p className="mt-4 font-semibold">Miembro desde</p><p className="mt-1 text-muted-foreground">{new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric" }).format(profile.createdAt)}</p></div></section>

              <section className="rounded-lg border bg-white p-6 shadow-[0_14px_36px_rgba(1,45,56,0.05)]"><div className="flex items-center justify-between"><h2 className="font-display text-lg font-bold">Documentos pendientes</h2><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">{Number(!hasCv) + Number(!identityComplete)} pendientes</span></div><div className="mt-4 divide-y">{!hasCv ? <Link href="/portal/documentos" className="flex items-center justify-between gap-3 py-3 text-sm"><span><b>CV profesional</b><small className="mt-1 block text-muted-foreground">Completa tus postulaciones</small></span><span className="font-semibold text-primary">Subir</span></Link> : null}{!identityComplete ? <Link href="/portal/documentos" className="flex items-center justify-between gap-3 py-3 text-sm"><span><b>Verificacion de identidad</b><small className="mt-1 block text-muted-foreground">DNI por delante y detras</small></span><span className="font-semibold text-primary">Revisar</span></Link> : null}{hasCv && identityComplete ? <p className="py-4 text-sm text-emerald-700">Tus documentos principales estan completos.</p> : null}</div></section>

              <section className="rounded-lg border bg-white p-6"><h2 className="font-display text-lg font-bold">Atajos rapidos</h2><div className="mt-4 divide-y">{[["/portal/oportunidades", "Explorar oportunidades"], ["/portal/postulaciones", "Mis postulaciones"], ["/portal/bitacora", "Actualizar CV vivo"], ["/portal/validaciones", "Ver validaciones"]].map(([href, label]) => <Link key={label} href={href} className="flex items-center justify-between py-3 text-sm font-semibold text-[#304752] hover:text-primary">{label}<ChevronRight className="h-4 w-4" /></Link>)}</div></section>

              <section className="rounded-lg border bg-white p-6">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">Configuracion</p>
                <h2 className="mt-2 font-display text-lg font-bold">Perfil, mensajes y pagos</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Administra tu usuario publico, permisos de mensajes, red de contactos y datos privados de cobro.
                </p>
                <Button asChild variant="outline" className="mt-4 w-full justify-between">
                  <Link href="/portal/configuracion">Abrir configuracion <ChevronRight className="h-4 w-4" /></Link>
                </Button>
                {publicCvHref ? (
                  <Link href={publicCvHref} target="_blank" className="mt-4 flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10">
                    {publicCvHref.replace(/^https?:\/\//, "")}
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                ) : null}
              </section>
            </aside>
          </div>

          <div id="documentos" className="scroll-mt-24"><ProfessionalDocumentUploader identityStatus={profile.identityVerificationStatus} identityNote={profile.identityVerificationNote} documents={profile.documents} /></div>
    </div>
  );
}
