import Link from "next/link";
import { BadgeCheck, ExternalLink, MapPin, ShieldCheck, Wrench } from "lucide-react";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { UserAvatar } from "@/components/terraqo/user-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export default async function ProfilePage() {
  const { profile } = await requireProfessionalPortal();
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
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/30 px-3 py-2"><span className="text-muted-foreground">{label}</span><b className="text-right capitalize">{value}</b></div>;
}
