import { BadgeCheck, BookOpenCheck, CircleCheck, Eye, History, ShieldCheck, Sparkles } from "lucide-react";
import { ExperienceForm, EducationForm } from "@/components/portal/profile-entry-forms";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createEducationAction, createHistoricalExperienceAction } from "@/lib/server/professional-actions";
import { prisma } from "@/lib/prisma";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";
import { formatExperienceDuration, monthsBetween } from "@/lib/terraqo/profile-summary";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ExperiencesPageProps = {
  searchParams: Promise<{ success?: string; status?: string }>;
};

export default async function ExperiencesPage({ searchParams }: ExperiencesPageProps) {
  const params = await searchParams;
  const { profile, memberships } = await requireProfessionalPortal();
  const experiences = profile.experiences;
  const education = profile.education;
  const workspaceIds = memberships.map((membership) => membership.workspaceId);
  const validators = workspaceIds.length
    ? await prisma.user.findMany({
        where: {
          terraqoMemberships: {
            some: {
              workspaceId: { in: workspaceIds },
              active: true,
              role: { in: ["OWNER", "ADMIN", "MANAGER"] }
            }
          }
        },
        select: { id: true, name: true, email: true },
        orderBy: [{ name: "asc" }, { email: "asc" }],
        take: 60
      })
    : [];
  const totalMonths = experiences.reduce((sum, experience) => sum + monthsBetween(experience.startedAt, experience.currentlyWorking ? null : experience.endedAt), 0);

  return (
    <div className="min-w-0 space-y-8 py-6 lg:py-8">
      <PortalPageHeading
        eyebrow="Experiencias"
        title="Carga trabajos reales y conviertelos en experiencia verificable."
        description="Puedes registrar proyectos actuales o historicos. Si un responsable valida el trabajo, la experiencia gana un check. Si tambien existe evidencia de campo diaria, puede mostrar doble validacion."
      />

      {params.success === "experience" ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">Experiencia cargada. Quedo privada y pendiente de verificacion.</div> : null}
      {params.success === "education" ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">Educacion registrada. El extracto del perfil fue actualizado.</div> : null}
      {params.status === "missing" ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">Completa al menos titulo y empresa para registrar la experiencia.</div> : null}
      {params.status === "education-missing" ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">Completa institucion y grado para registrar educacion.</div> : null}

      <Card className="border-primary/20 bg-[#eefbf9]">
        <CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex gap-3">
            <Sparkles className="mt-1 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-display text-xl font-bold">Extracto del perfil</p>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">{profile.generatedSummary || "Cuando cargues experiencia y educacion, Terraqo generara un extracto profesional para el inicio de tu perfil."}</p>
              {profile.generatedSummaryUpdatedAt ? <p className="mt-2 text-xs font-semibold text-primary">Actualizado automaticamente: {new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(profile.generatedSummaryUpdatedAt)}</p> : null}
            </div>
          </div>
          <div className="rounded-lg border bg-white px-4 py-3 text-center">
            <p className="font-display text-2xl font-bold text-primary">{formatExperienceDuration(totalMonths)}</p>
            <p className="text-xs font-semibold text-muted-foreground">experiencia acumulada</p>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary" /> Cargar experiencia historica</CardTitle>
            <CardDescription>Para trabajos anteriores donde quieres solicitar validacion de un encargado o cliente.</CardDescription>
          </CardHeader>
          <CardContent>
            <ExperienceForm validators={validators.map((validator) => ({ id: validator.id, label: validator.name || "Responsable Terraqo", email: validator.email }))} createExperienceAction={createHistoricalExperienceAction} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Historial profesional</CardTitle>
            <CardDescription>Experiencias asociadas a tu CV vivo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {experiences.map((experience) => {
              const checks = (experience.verifiedByTerraqo ? 1 : 0) + (experience.projectId || experience.evidence.length ? 1 : 0);
              const statusLabel = checks >= 2 ? "2 checks" : experience.verifiedByTerraqo ? "Verificado por Terraqo referencialmente" : "Sin verificar";
              return (
                <article key={experience.id} className="rounded-lg border bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="font-display text-lg font-bold">{experience.title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{experience.companyName || "Empresa por confirmar"} | {experience.role || "Rol por completar"}</p>
                      <p className="mt-1 text-xs font-semibold text-muted-foreground">{formatExperienceDuration(monthsBetween(experience.startedAt, experience.currentlyWorking ? null : experience.endedAt))} · {experience.currentlyWorking ? "Actualmente" : "Finalizado"}{experience.locationCity || experience.location ? ` · ${experience.locationCity || experience.location}` : ""}</p>
                      {experience.project ? <p className="mt-2 text-sm font-semibold text-primary">Proyecto vinculado: {experience.project.title}</p> : null}
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Eye className="h-3.5 w-3.5" /> {experience.visibility === "PUBLIC" ? "Visible en CV publico" : experience.visibility === "WORKSPACE" ? "Visible para workspaces" : experience.visibility === "COMMUNITY" ? "Visible en comunidad" : "Privada"}</p>
                    </div>
                    {checks ? <Badge><BadgeCheck className="mr-1 h-4 w-4" /> {statusLabel}</Badge> : <Badge variant="outline">{statusLabel}</Badge>}
                  </div>
                  {experience.verificationNote ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{experience.verificationNote}</p> : null}
                  {experience.validatorUserId || experience.validatorEmail || experience.validatorName ? <p className="mt-2 text-xs font-semibold text-primary">Responsable solicitado: {experience.validatorName || experience.validatorEmail || experience.validatorUserId}</p> : null}
                  {experience.evidence.length ? <p className="mt-2 text-xs font-semibold text-primary">{experience.evidence.length} referencia(s) o evidencia(s) declarada(s)</p> : null}
                </article>
              );
            })}
            {!experiences.length ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Todavia no tienes experiencias registradas.</p> : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BookOpenCheck className="h-5 w-5 text-primary" /> Educacion y certificaciones</CardTitle>
            <CardDescription>Registra estudios, certificaciones y formacion que deben aparecer en tu perfil y CV vivo.</CardDescription>
          </CardHeader>
          <CardContent>
            <EducationForm validators={validators.map((validator) => ({ id: validator.id, label: validator.name || "Responsable Terraqo", email: validator.email }))} createEducationAction={createEducationAction} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Historial academico</CardTitle>
            <CardDescription>Educacion asociada al perfil profesional.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {education.map((item) => (
              <article key={item.id} className="rounded-lg border bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-display text-lg font-bold">{item.degree}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{item.institution}{item.field ? ` | ${item.field}` : ""}</p>
                    <p className="mt-1 text-xs font-semibold text-muted-foreground">{item.currentlyStudying ? "Actualmente" : "Finalizado"}{item.locationCity ? ` · ${item.locationCity}` : ""}</p>
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Eye className="h-3.5 w-3.5" /> {item.visibility === "PUBLIC" ? "Visible en CV publico" : item.visibility === "WORKSPACE" ? "Visible para workspaces" : item.visibility === "COMMUNITY" ? "Visible en comunidad" : "Privada"}</p>
                  </div>
                  {item.verificationStatus === "APPROVED" ? <Badge><BadgeCheck className="mr-1 h-4 w-4" /> Verificada</Badge> : item.verificationStatus === "REQUESTED" ? <Badge variant="outline">Verificacion solicitada</Badge> : <Badge variant="outline">Sin verificar</Badge>}
                </div>
                {item.validatorUserId || item.validatorEmail || item.validatorName ? <p className="mt-2 text-xs font-semibold text-primary">Responsable solicitado: {item.validatorName || item.validatorEmail || item.validatorUserId}</p> : null}
                {item.evidence.length ? <p className="mt-2 text-xs font-semibold text-primary">{item.evidence.length} referencia(s) o evidencia(s) declarada(s)</p> : null}
              </article>
            ))}
            {!education.length ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Todavia no registraste educacion.</p> : null}
          </CardContent>
        </Card>
      </section>

      <Card className="border-primary/20 bg-[#eefbf9]">
        <CardContent className="grid gap-4 p-5 md:grid-cols-2">
          <div className="flex gap-3"><CircleCheck className="mt-1 h-5 w-5 text-primary" /><p className="text-sm leading-6"><b>Sin verificar:</b> experiencia declarada por el profesional, puede aparecer en su CV si decide hacerla publica.</p></div>
          <div className="flex gap-3"><BadgeCheck className="mt-1 h-5 w-5 text-primary" /><p className="text-sm leading-6"><b>1 check:</b> Terraqo valido referencialmente con responsable, empresa o evidencia revisada.</p></div>
          <div className="flex gap-3"><ShieldCheck className="mt-1 h-5 w-5 text-primary" /><p className="text-sm leading-6"><b>2 checks:</b> validacion Terraqo mas respaldo operativo como proyecto, evidencia o bitacora.</p></div>
        </CardContent>
      </Card>
    </div>
  );
}
