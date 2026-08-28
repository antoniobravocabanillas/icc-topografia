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
  PlusCircle,
  ShieldCheck
} from "lucide-react";



import { ProfessionalPhotoUploader } from "@/components/portal/professional-photo-uploader";
import { ProfessionalDocumentUploader } from "@/components/portal/professional-document-uploader";
import { WorklogCard } from "@/components/terraqo/worklog-card";
import { FieldVerificationPanel } from "@/components/terraqo/field-verification-panel";
import { Button } from "@/components/ui/button";
import { updateProfessionalAvailabilityAction } from "@/lib/server/professional-actions";
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
      <div><p className="font-display text-3xl font-bold text-[#0e1a26]">{value}</p><p className="text-sm font-semibold text-[#2f4154]">{label}</p><p className="text-xs text-muted-foreground">{detail}</p></div>
    </div>
  );
}

function ActivityRow({ icon: Icon, title, detail }: { icon: ElementType; title: string; detail: string }) {
  return (
    <div className="flex gap-3 border-b py-3 last:border-0">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
      <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#0e1a26]">{title}</p><p className="mt-0.5 text-xs text-muted-foreground">{detail}</p></div>
    </div>
  );
}

type CommunityUpdates = {
  posts: Array<{ id: string; title: string; body: string; date: Date; author: string; context: string }>;
  worklogs: Array<{ id: string; title: string; body: string; date: Date; author: string; context: string }>;
};

export function ProfessionalDashboard({ profile, workspaceId, communityUpdates }: { profile: ProfessionalDashboardProfile; workspaceId?: string | null; communityUpdates?: CommunityUpdates }) {
  const name = profile.user.name || profile.user.email;
  const percent = completion(profile);
  const verifiedExperiences = profile.experiences.filter((experience) => experience.verifiedByTerraqo).length;
  const hasCv = profile.documents.some((document) => document.type === "CV");
  const identityComplete = profile.identityVerificationStatus === "VERIFIED";
  const publicCvHref = profile.username ? `${terraqoDomains.public}/cv/${profile.username}` : null;
  const totalMonths = profile.experiences.reduce((sum, experience) => sum + monthsBetween(experience.startedAt, experience.currentlyWorking ? null : experience.endedAt), 0);
  const validatedWorklogs = profile.worklogs.filter((worklog) => worklog.validations.some((validation) => validation.status === "APPROVED")).length;
  const cvMomentum = Math.min(100, profile.experiences.length * 10 + profile.worklogs.length * 6 + verifiedExperiences * 12 + validatedWorklogs * 8 + (identityComplete ? 15 : 0));
  const updates = [...(communityUpdates?.posts || []).map((item) => ({ ...item, kind: "Conversación" })), ...(communityUpdates?.worklogs || []).map((item) => ({ ...item, kind: "Evidencia" }))].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5);

  return (
    <div className="min-w-0 space-y-6 py-6 lg:py-8">
          <section id="perfil" className="relative overflow-hidden rounded-lg bg-[#0e1a26] p-6 text-white shadow-[0_24px_70px_rgba(2,47,53,0.18)] lg:p-8">
            <div className="absolute inset-y-0 right-0 w-2/5 opacity-20 [background-image:repeating-radial-gradient(ellipse_at_center,rgba(100,232,219,0.4)_0_1px,transparent_1px_14px)]" />
            <div className="relative grid items-center gap-7 lg:grid-cols-[minmax(0,1fr)_190px]">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                <ProfessionalPhotoUploader name={name} image={profile.user.image} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3"><h1 className="font-display text-3xl font-bold lg:text-4xl">{name}</h1>{identityComplete ? <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-[#25c0d5]"><BadgeCheck className="h-4 w-4" /> Perfil verificado</span> : null}</div>
                  <p className="mt-2 text-lg font-semibold text-[#25c0d5]">{profile.headline || profile.specialties[0] || "Profesional Terraqo"}</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-white/70"><span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-[#25c0d5]" />{profile.locationCity || profile.city || "Ubicacion por completar"}</span><span>|</span><span>{formatExperienceDuration(totalMonths)} de experiencia</span></div>
                  {profile.generatedSummary ? <p className="mt-4 max-w-3xl text-sm leading-6 text-white/70">{profile.generatedSummary}</p> : null}
                  <div className="mt-6 flex flex-wrap gap-3"><Button asChild className="bg-primary text-white hover:bg-primary/90"><Link href={`/portal/profesionales/${profile.id}`}>Ver perfil <ChevronRight className="ml-2 h-4 w-4" /></Link></Button><Button asChild variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10"><Link href="/portal/documentos">Completar perfil</Link></Button></div>
                </div>
              </div>
              <div className="justify-self-center text-center">
                <div className="grid h-28 w-28 place-items-center rounded-full" style={{ background: `conic-gradient(#25c0d5 ${percent * 3.6}deg, rgba(255,255,255,0.13) 0deg)` }}><div className="grid h-[86px] w-[86px] place-items-center rounded-full bg-[#0e1a26] font-display text-2xl font-bold">{percent}%</div></div>
                <p className="mt-3 text-sm text-white/75">Perfil completo</p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-white p-5 shadow-[0_14px_36px_rgba(1,45,56,0.05)] lg:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">Ahora en tu red</p><h2 className="mt-1 font-display text-2xl font-bold">Últimas actualizaciones de la comunidad</h2><p className="mt-1 text-sm text-muted-foreground">Trabajo documentado, conversaciones y oportunidades de aprendizaje de perfiles visibles.</p></div><Button asChild variant="outline"><Link href="/portal/red">Explorar la red</Link></Button></div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {updates.map((update) => <article key={`${update.kind}-${update.id}`} className="rounded-lg border bg-muted/20 p-4"><div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-primary"><span>{update.kind}</span><span className="text-muted-foreground">· {update.context}</span></div><h3 className="mt-2 font-display text-lg font-bold">{update.title}</h3><p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{update.body}</p><p className="mt-3 text-xs font-semibold text-[#2f4154]">{update.author} · {new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(update.date)}</p></article>)}
              {!updates.length ? <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground lg:col-span-2">Cuando la comunidad publique avances o conversaciones visibles, aparecerán aquí. Puedes iniciar desde tu bitácora.</div> : null}
            </div>
          </section>

          {workspaceId ? <FieldVerificationPanel endpoint={`/api/terraqo/field-verification?workspaceId=${workspaceId}`} compact /> : (
            <section className="flex flex-col gap-3 rounded-lg border bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-semibold">Control de campo pendiente de vinculación</p><p className="mt-1 text-sm text-muted-foreground">La entrada, salida y geolocalización se activan cuando una empresa confirma tu vínculo y te asigna un proyecto.</p></div>
              <Button asChild variant="outline"><Link href="/portal/perfil">Vincular empresa</Link></Button>
            </section>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ProfileMetric icon={BriefcaseBusiness} value={profile.experiences.length} label="Experiencias" detail="registradas" />
            <ProfileMetric icon={FileText} value={profile.applications.length} label="Postulaciones" detail="enviadas" />
            <ProfileMetric icon={ShieldCheck} value={verifiedExperiences} label="Validaciones" detail="aprobadas" />
            <ProfileMetric icon={NotebookPen} value={profile.worklogs.length} label="Evidencias" detail="en tu CV vivo" />
          </div>

          <section className="grid gap-5 rounded-lg border border-primary/20 bg-[#eefbf9] p-5 lg:grid-cols-[220px_1fr_auto] lg:items-center">
            <div><p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">Impulso del CV</p><p className="mt-1 font-display text-4xl font-bold text-[#0e1a26]">{cvMomentum}%</p><p className="text-xs text-muted-foreground">progreso con respaldo real</p></div>
            <div><div className="h-2 overflow-hidden rounded-full bg-primary/10"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${cvMomentum}%` }} /></div><p className="mt-3 text-sm leading-6 text-muted-foreground">El avance aumenta con experiencias completas, bitácoras con evidencia, validaciones y verificación de identidad. Publicar contenido repetido no suma.</p></div>
            <Button asChild><Link href="/portal/bitacora"><NotebookPen className="mr-2 h-4 w-4" /> Registrar avance útil</Link></Button>
          </section>

          <section className="flex flex-col gap-4 rounded-lg border border-primary/20 bg-[linear-gradient(135deg,rgba(67,116,186,0.10),rgba(37,192,213,0.08))] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary text-white"><NotebookPen className="h-5 w-5" /></span><div><h2 className="font-display text-lg font-bold">Convierte tu trabajo en evidencia</h2><p className="mt-1 text-sm text-muted-foreground">Registra avances, fotos, resultados y referencias desde la bitácora para alimentar tu CV vivo.</p></div></div>
            <Button asChild className="shrink-0"><Link href="/portal/bitacora"><PlusCircle className="mr-2 h-4 w-4" /> Registrar evidencia</Link></Button>
          </section>

          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <section id="experiencias" className="rounded-lg border bg-white p-6 shadow-[0_14px_36px_rgba(1,45,56,0.05)]">
                  <div className="flex items-center justify-between"><h2 className="font-display text-xl font-bold">Experiencia destacada</h2><Link href="/portal/experiencias" className="text-xs font-semibold text-primary">Ver todas</Link></div>
                  <div className="mt-4 divide-y">
                    {profile.experiences.slice(0, 3).map((experience) => (
                      <article key={experience.id} className="py-4 first:pt-0">
                        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-[#0e1a26]">{experience.title}</p><p className="mt-1 text-xs text-muted-foreground">{experience.companyName || "Empresa por confirmar"} | {experience.role || "Rol profesional"}</p>{experience.project ? <p className="mt-2 text-xs font-semibold text-primary">Proyecto: {experience.project.title}</p> : null}</div>{experience.verifiedByTerraqo ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">Validado</span> : null}</div>
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
              <section className="rounded-lg border bg-white p-6 shadow-[0_14px_36px_rgba(1,45,56,0.05)]"><div className="flex gap-4"><span className="grid h-12 w-12 place-items-center rounded-lg bg-primary/10 text-primary"><CalendarDays className="h-5 w-5" /></span><div><h2 className="font-display text-lg font-bold">Disponibilidad</h2><span className="mt-2 inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{statusCopy[profile.status]}</span></div></div><form action={updateProfessionalAvailabilityAction} className="mt-5 grid gap-2 border-t pt-4"><label className="grid gap-1.5 text-sm font-semibold">Estado<select name="status" defaultValue={profile.status} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="AVAILABLE">Disponible ahora</option><option value="OPEN_TO_PROJECTS">Abierto a proyectos</option><option value="WORKING">Trabajando actualmente</option><option value="NOT_AVAILABLE">No disponible</option></select></label><button type="submit" className="h-10 rounded-md border border-primary/30 text-sm font-bold text-primary transition hover:bg-primary hover:text-white">Actualizar disponibilidad</button></form><div className="mt-5 border-t pt-4 text-sm"><p className="font-semibold">Ubicacion</p><p className="mt-1 text-muted-foreground">{profile.city || "Por completar"}</p><p className="mt-4 font-semibold">Miembro desde</p><p className="mt-1 text-muted-foreground">{new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric" }).format(profile.createdAt)}</p></div></section>

              <section className="rounded-lg border bg-white p-6 shadow-[0_14px_36px_rgba(1,45,56,0.05)]"><div className="flex items-center justify-between"><h2 className="font-display text-lg font-bold">Documentos pendientes</h2><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">{Number(!hasCv) + Number(!identityComplete)} pendientes</span></div><div className="mt-4 divide-y">{!hasCv ? <Link href="/portal/documentos" className="flex items-center justify-between gap-3 py-3 text-sm"><span><b>CV profesional</b><small className="mt-1 block text-muted-foreground">Completa tus postulaciones</small></span><span className="font-semibold text-primary">Subir</span></Link> : null}{!identityComplete ? <Link href="/portal/documentos" className="flex items-center justify-between gap-3 py-3 text-sm"><span><b>Verificacion de identidad</b><small className="mt-1 block text-muted-foreground">DNI por delante y detras</small></span><span className="font-semibold text-primary">Revisar</span></Link> : null}{hasCv && identityComplete ? <p className="py-4 text-sm text-emerald-700">Tus documentos principales estan completos.</p> : null}</div></section>

              <section className="rounded-lg border bg-white p-6"><h2 className="font-display text-lg font-bold">Atajos rapidos</h2><div className="mt-4 divide-y">{[["/portal/oportunidades", "Explorar oportunidades"], ["/portal/postulaciones", "Mis postulaciones"], ["/portal/bitacora", "Actualizar CV vivo"], ["/portal/validaciones", "Ver validaciones"]].map(([href, label]) => <Link key={label} href={href} className="flex items-center justify-between py-3 text-sm font-semibold text-[#2f4154] hover:text-primary">{label}<ChevronRight className="h-4 w-4" /></Link>)}</div></section>

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
