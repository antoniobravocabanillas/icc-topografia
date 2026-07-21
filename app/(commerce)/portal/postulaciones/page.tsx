import { BriefcaseBusiness, CalendarDays } from "lucide-react";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const applicationStatusCopy: Record<string, string> = {
  SUBMITTED: "Enviada",
  REVIEWING: "En revision",
  SHORTLISTED: "Preseleccionada",
  ACCEPTED: "Aceptada",
  REJECTED: "No seleccionada",
  WITHDRAWN: "Retirada"
};

export default async function ApplicationsPage() {
  const { profile } = await requireProfessionalPortal();
  return (
    <div className="min-w-0 space-y-8 py-6 lg:py-8">
      <PortalPageHeading eyebrow="Postulaciones" title="Tus oportunidades en seguimiento." description="Revisa a que convocatorias aplicaste, quien las gestiona y en que estado se encuentran." />
      <div className="grid gap-4">
        {profile.applications.map((application) => (
          <Card key={application.id}>
            <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
              <div className="flex gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary"><BriefcaseBusiness className="h-5 w-5" /></span>
                <div>
                  <h2 className="font-display text-lg font-bold">{application.jobPost?.title || "Bolsa de talento general"}</h2>
                  <p className="text-sm text-muted-foreground">{application.workspace.name}</p>
                  <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(application.createdAt)}</p>
                </div>
              </div>
              <Badge>{applicationStatusCopy[application.status] || "Por revisar"}</Badge>
            </CardContent>
          </Card>
        ))}
        {!profile.applications.length ? <p className="rounded-lg border border-dashed bg-white p-6 text-sm text-muted-foreground">Aun no tienes postulaciones registradas.</p> : null}
      </div>
    </div>
  );
}
