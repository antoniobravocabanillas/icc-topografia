import { BadgeCheck, CircleCheck, History, ShieldCheck } from "lucide-react";
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
              <Input name="supervisor" placeholder="Correo o nombre del responsable que podria validar" />
              <Textarea name="evidence" placeholder="Evidencias, enlaces o referencias, una por linea" />
              <SubmitButton pendingText="Registrando...">Guardar y solicitar verificacion</SubmitButton>
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
              const checks = experience.verifiedByTerraqo ? 1 : 0;
              return (
                <article key={experience.id} className="rounded-lg border bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="font-display text-lg font-bold">{experience.title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{experience.companyName || "Empresa por confirmar"} | {experience.role || "Rol por completar"}</p>
                      {experience.project ? <p className="mt-2 text-sm font-semibold text-primary">Proyecto vinculado: {experience.project.title}</p> : null}
                    </div>
                    {checks ? <Badge><BadgeCheck className="mr-1 h-4 w-4" /> {checks} check</Badge> : <Badge variant="outline">Pendiente</Badge>}
                  </div>
                  {experience.verificationNote ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{experience.verificationNote}</p> : null}
                </article>
              );
            })}
            {!experiences.length ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Todavia no tienes experiencias registradas.</p> : null}
          </CardContent>
        </Card>
      </section>

      <Card className="border-primary/20 bg-[#eefbf9]">
        <CardContent className="grid gap-4 p-5 md:grid-cols-2">
          <div className="flex gap-3"><CircleCheck className="mt-1 h-5 w-5 text-primary" /><p className="text-sm leading-6"><b>1 check:</b> validacion por responsable, empresa o workspace autorizado.</p></div>
          <div className="flex gap-3"><ShieldCheck className="mt-1 h-5 w-5 text-primary" /><p className="text-sm leading-6"><b>2 checks:</b> evidencia de campo diaria mas validacion del responsable.</p></div>
        </CardContent>
      </Card>
    </div>
  );
}
