import { BadgeCheck, CircleCheck, Eye, History, ShieldCheck } from "lucide-react";
import { SubmitButton } from "@/components/forms/submit-button";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createHistoricalExperienceAction } from "@/lib/server/professional-actions";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ExperiencesPageProps = {
  searchParams: Promise<{ success?: string; status?: string }>;
};

export default async function ExperiencesPage({ searchParams }: ExperiencesPageProps) {
  const params = await searchParams;
  const { profile } = await requireProfessionalPortal();
  const experiences = profile.experiences;

  return (
    <div className="min-w-0 space-y-8 py-6 lg:py-8">
      <PortalPageHeading
        eyebrow="Experiencias"
        title="Carga trabajos reales y conviertelos en experiencia verificable."
        description="Puedes registrar proyectos actuales o historicos. Si un responsable valida el trabajo, la experiencia gana un check. Si tambien existe evidencia de campo diaria, puede mostrar doble validacion."
      />

      {params.success === "experience" ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">Experiencia cargada. Quedo privada y pendiente de verificacion.</div> : null}
      {params.status === "missing" ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">Completa al menos titulo y empresa para registrar la experiencia.</div> : null}

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary" /> Cargar experiencia historica</CardTitle>
            <CardDescription>Para trabajos anteriores donde quieres solicitar validacion de un encargado o cliente.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createHistoricalExperienceAction} className="grid gap-3">
              <Input name="title" placeholder="Ej. Control altimetrico en edificio multifamiliar" required />
              <Input name="companyName" placeholder="Empresa o cliente" required />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input name="role" placeholder="Rol desempenado" />
                <Input name="location" placeholder="Ciudad o ubicacion" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-semibold">Inicio<Input name="startedAt" type="date" /></label>
                <label className="grid gap-1 text-sm font-semibold">Fin<Input name="endedAt" type="date" /></label>
              </div>
              <label className="grid gap-1 text-sm font-semibold">
                Visibilidad en CV vivo
                <select name="visibility" defaultValue="PRIVATE" className="h-11 rounded-md border bg-background px-3 text-sm">
                  <option value="PRIVATE">Privada: solo yo y Terraqo</option>
                  <option value="WORKSPACE">Visible para mis workspaces</option>
                  <option value="COMMUNITY">Visible en comunidad Terraqo</option>
                  <option value="PUBLIC">Publica en mi CV compartible</option>
                </select>
              </label>
              <Input name="supervisor" placeholder="Correo o nombre del responsable que podria validar" />
              <Textarea name="evidence" placeholder="Evidencias, enlaces o referencias, una por linea" />
              <SubmitButton pendingText="Registrando...">Guardar experiencia</SubmitButton>
            </form>
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
                      {experience.project ? <p className="mt-2 text-sm font-semibold text-primary">Proyecto vinculado: {experience.project.title}</p> : null}
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Eye className="h-3.5 w-3.5" /> {experience.visibility === "PUBLIC" ? "Visible en CV publico" : experience.visibility === "WORKSPACE" ? "Visible para workspaces" : experience.visibility === "COMMUNITY" ? "Visible en comunidad" : "Privada"}</p>
                    </div>
                    {checks ? <Badge><BadgeCheck className="mr-1 h-4 w-4" /> {statusLabel}</Badge> : <Badge variant="outline">{statusLabel}</Badge>}
                  </div>
                  {experience.verificationNote ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{experience.verificationNote}</p> : null}
                  {experience.evidence.length ? <p className="mt-2 text-xs font-semibold text-primary">{experience.evidence.length} referencia(s) o evidencia(s) declarada(s)</p> : null}
                </article>
              );
            })}
            {!experiences.length ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Todavia no tienes experiencias registradas.</p> : null}
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
