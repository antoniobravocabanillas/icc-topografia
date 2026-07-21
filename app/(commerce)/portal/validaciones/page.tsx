import { BadgeCheck, Clock3, ShieldCheck } from "lucide-react";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ValidationsPage() {
  const { profile } = await requireProfessionalPortal();
  const worklogs = profile.worklogs;
  const verifiedExperiences = profile.experiences.filter((experience) => experience.verifiedByTerraqo);

  return (
    <div className="min-w-0 space-y-8 py-6 lg:py-8">
      <PortalPageHeading eyebrow="Validaciones" title="Checks que respaldan tu experiencia." description="Terraqo diferencia entre evidencia diaria de campo y validaciones emitidas por responsables autorizados." />

      <section className="grid gap-5 md:grid-cols-3">
        <Metric title="Identidad" value={profile.identityVerificationStatus === "VERIFIED" ? "Verificada" : "Pendiente"} icon={ShieldCheck} />
        <Metric title="Experiencias con check" value={String(verifiedExperiences.length)} icon={BadgeCheck} />
        <Metric title="Bitacoras recientes" value={String(worklogs.length)} icon={Clock3} />
      </section>

      <Card>
        <CardHeader><CardTitle>Experiencias validadas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {profile.experiences.map((experience) => (
            <article key={experience.id} className="flex flex-col justify-between gap-3 rounded-lg border p-4 md:flex-row md:items-center">
              <div>
                <p className="font-display text-lg font-bold">{experience.title}</p>
                <p className="text-sm text-muted-foreground">{experience.companyName || "Empresa por confirmar"}</p>
              </div>
              {experience.verifiedByTerraqo ? <Badge><BadgeCheck className="mr-1 h-4 w-4" /> 1 check</Badge> : <Badge variant="outline">Solicitar validacion</Badge>}
            </article>
          ))}
          {!profile.experiences.length ? <p className="text-sm text-muted-foreground">Carga una experiencia para solicitar validacion.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Bitacoras y doble check</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {worklogs.map((worklog) => {
            const fieldCheck = worklog.evidenceStatus !== "DECLARED";
            const supervisorCheck = worklog.validations.some((validation) => validation.status === "APPROVED");
            const checks = Number(fieldCheck) + Number(supervisorCheck);
            return (
              <article key={worklog.id} className="rounded-lg border p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <p className="font-display text-lg font-bold">{worklog.title}</p>
                    <p className="text-sm text-muted-foreground">{new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(worklog.occurredAt)}</p>
                  </div>
                  <Badge variant={checks ? "default" : "outline"}>{checks ? `${checks} check${checks > 1 ? "s" : ""}` : "Sin check"}</Badge>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{fieldCheck ? "Tiene evidencia asociada." : "Evidencia declarada."} {supervisorCheck ? "Responsable autorizado valido la bitacora." : "Pendiente de validacion por responsable."}</p>
              </article>
            );
          })}
          {!worklogs.length ? <p className="text-sm text-muted-foreground">Tus bitacoras recientes apareceran aqui.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ title, value, icon: Icon }: { title: string; value: string; icon: typeof ShieldCheck }) {
  return <Card><CardContent className="flex items-center gap-4 p-5"><span className="grid h-12 w-12 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><div><p className="font-display text-2xl font-bold">{value}</p><p className="text-sm text-muted-foreground">{title}</p></div></CardContent></Card>;
}
