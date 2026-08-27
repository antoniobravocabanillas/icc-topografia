import Link from "next/link";
import { BadgeCheck, Building2, ExternalLink, Link2, MapPin, ShieldCheck, Wrench } from "lucide-react";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { UserAvatar } from "@/components/terraqo/user-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";
import { requestProfessionalAffiliationAction } from "@/lib/server/professional-affiliation-actions";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";
import { terraqoDomains } from "@/lib/terraqo-domains";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const identityCopy: Record<string, string> = {
  PENDING_DOCUMENTS: "Documentos pendientes",
  SUBMITTED: "En revision",
  VERIFIED: "Identidad verificada",
  REJECTED: "Requiere correccion"
};

type PageProps = { searchParams?: Promise<{ affiliation?: string }> };

const affiliationMessages: Record<string, string> = {
  requested: "Solicitud enviada. La empresa la verá en su workspace y deberá confirmar tu cargo.",
  missing: "Selecciona una empresa e indica el cargo o profesión que deseas validar.",
  "invalid-company": "La empresa seleccionada ya no está disponible para nuevas vinculaciones.",
  "no-profile": "Primero debes completar tu perfil profesional."
};

export default async function ProfilePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { profile } = await requireProfessionalPortal();
  const companies = await prisma.terraqoWorkspace.findMany({
    where: { active: true, deletedAt: null, companyId: { not: null } },
    select: { id: true, name: true, brandName: true, industry: true },
    orderBy: [{ brandName: "asc" }, { name: "asc" }]
  });
  const name = profile.user.name || "Profesional Terraqo";
  const publicCvHref = profile.username ? `${terraqoDomains.public}/cv/${profile.username}` : null;
  const skills = [...profile.specialties, ...profile.equipment, ...profile.software];
  const currentExperience = profile.experiences.find((experience) => experience.currentlyWorking);
  const visibleHeadline = profile.headline || (currentExperience ? `${currentExperience.role || currentExperience.title}${currentExperience.companyName ? ` - ${currentExperience.companyName}` : ""} (actualmente)` : "Define tu título profesional visible");

  return (
    <div className="min-w-0 space-y-8 py-6 lg:py-8">
      <PortalPageHeading
        eyebrow="Mi perfil"
        title="Tu identidad profesional dentro de Terraqo."
        description="Controla como te presentas ante empresas, equipos de proyecto y otros profesionales de la red."
        action={publicCvHref ? <Button asChild variant="outline"><Link href={publicCvHref} target="_blank">Ver CV público <ExternalLink className="ml-2 h-4 w-4" /></Link></Button> : null}
      />

      {params?.affiliation && affiliationMessages[params.affiliation] ? (
        <div className={`rounded-md border px-4 py-3 text-sm font-semibold ${params.affiliation === "requested" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          {affiliationMessages[params.affiliation]}
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden border-primary/20">
          <CardContent className="relative grid gap-6 bg-[#073b3b] p-7 text-white sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_80%_20%,rgba(98,221,210,0.45),transparent_28%)]" />
            <UserAvatar name={name} image={profile.user.image} size="xl" />
            <div className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-3xl font-bold lg:text-4xl">{name}</h1>
                {profile.identityVerificationStatus === "VERIFIED" ? <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-3 py-1 text-xs font-bold text-[#8bf2e9]"><BadgeCheck className="h-4 w-4" /> Verificado</span> : null}
              </div>
              <p className="mt-2 text-lg font-semibold text-[#7df0e6]">{visibleHeadline}</p>
              <p className="mt-3 flex flex-wrap gap-3 text-sm text-white/72"><span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{profile.city || "Ubicación pendiente"}</span><span>{profile.yearsExperience ?? 0} años de experiencia</span></p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button asChild className="bg-primary text-white hover:bg-primary/90"><Link href="/portal/configuracion">Editar perfil</Link></Button>
                <Button asChild variant="outline" className="border-white/35 bg-transparent text-white hover:bg-white/10"><Link href="/portal/documentos">Completar documentos</Link></Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Estado del perfil</CardTitle>
            <CardDescription>Visibilidad, identidad y CV vivo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <InfoRow label="Identidad" value={identityCopy[profile.identityVerificationStatus] || profile.identityVerificationStatus} />
            <InfoRow label="CV vivo" value={profile.liveCvEnabled ? "Activo" : "Pendiente de activar"} />
            <InfoRow label="Usuario público" value={profile.username ? `@${profile.username}` : "Por configurar"} />
            <InfoRow label="Estado laboral" value={profile.status.replaceAll("_", " ").toLowerCase()} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Resumen profesional</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="leading-7 text-muted-foreground">{profile.bio || "Agrega un resumen profesional manual desde Configuración. Este texto será la base visible de tu perfil dentro del workspace y de tu CV público."}</p>
            <div className="flex flex-wrap gap-2">{profile.professionalCategories.slice(0, 6).map((category) => <span key={category} className="rounded-md bg-primary/10 px-3 py-1 text-xs font-bold uppercase text-primary">{category}</span>)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Herramientas y capacidades</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {skills.map((skill) => <span key={skill} className="inline-flex items-center gap-1 rounded-md border bg-white px-3 py-1.5 text-sm font-semibold"><Wrench className="h-3.5 w-3.5 text-primary" />{skill}</span>)}
            {!skills.length ? <p className="text-sm text-muted-foreground">Completa equipos, software y especialidades para mejorar tu perfil.</p> : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> Vínculos con empresas</CardTitle>
            <CardDescription>Tu perfil funciona de manera independiente. Vincularte es opcional y nunca impide que completes o publiques tu trayectoria profesional.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile.affiliations.map((affiliation) => (
              <div key={affiliation.id} className="flex flex-col justify-between gap-3 rounded-md border bg-muted/20 p-4 sm:flex-row sm:items-center">
                <div>
                  <p className="font-semibold">{affiliation.companyName}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{affiliation.roleTitle || "Cargo por confirmar"}</p>
                </div>
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${affiliation.verificationStatus === "VERIFIED" ? "bg-emerald-100 text-emerald-800" : affiliation.verificationStatus === "REQUESTED" ? "bg-amber-100 text-amber-900" : "bg-muted text-muted-foreground"}`}>
                  {affiliation.verificationStatus === "VERIFIED" ? "Validado por la empresa" : affiliation.verificationStatus === "REQUESTED" ? "Esperando validación" : affiliation.verificationStatus === "REJECTED" ? "No aprobado" : "Declarado"}
                </span>
              </div>
            ))}
            {!profile.affiliations.length ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No estás vinculado a ninguna empresa. Puedes usar Terraqo y completar tu perfil con normalidad.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5 text-primary" /> Solicitar vinculación</CardTitle>
            <CardDescription>Elige una empresa registrada y declara el cargo o profesión. La empresa confirmará la relación desde su workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={requestProfessionalAffiliationAction} className="grid gap-4">
              <label className="grid gap-2 text-sm font-semibold">
                Empresa registrada
                <select name="workspaceId" required defaultValue="" className="h-11 rounded-md border bg-background px-3 text-sm">
                  <option value="" disabled>Selecciona una empresa</option>
                  {companies.map((company) => <option key={company.id} value={company.id}>{company.brandName || company.name}{company.industry ? ` · ${company.industry}` : ""}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Profesión o cargo a validar
                <Input name="roleTitle" required minLength={2} defaultValue={profile.headline || ""} placeholder="Ej. Topógrafo, gerente financiero, ingeniera ambiental" />
              </label>
              <Button type="submit" className="w-full">Enviar solicitud a la empresa</Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/30 px-3 py-2"><span className="text-muted-foreground">{label}</span><b className="text-right capitalize">{value}</b></div>;
}
