import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, BriefcaseBusiness, ExternalLink, MapPin, NotebookPen, ShieldCheck, Wrench } from "lucide-react";
import { TerraqoPublicFooter } from "@/components/terraqo/terraqo-public-footer";
import { TerraqoPublicHeader } from "@/components/terraqo/terraqo-public-header";
import { UserAvatar } from "@/components/terraqo/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { createMetadata } from "@/lib/seo";

type PublicCvPageProps = {
  params: Promise<{ username: string }>;
};

export async function generateMetadata({ params }: PublicCvPageProps) {
  const { username } = await params;
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { username },
    include: { user: { select: { name: true } } }
  });
  if (!profile) return createMetadata({ title: "CV vivo Terraqo", description: "Perfil profesional verificable en Terraqo.", path: `/cv/${username}` });
  return createMetadata({
    title: `${profile.user.name || username} | CV vivo Terraqo`,
    description: profile.headline || "Perfil profesional verificable en Terraqo.",
    path: `/cv/${username}`
  });
}

export default async function PublicCvPage({ params }: PublicCvPageProps) {
  const { username } = await params;
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { username },
    include: {
      user: { select: { name: true, email: true, image: true } },
      experiences: {
        where: { visibility: "PUBLIC" },
        include: { project: { select: { title: true, location: true } } },
        orderBy: [{ verifiedByTerraqo: "desc" }, { startedAt: "desc" }],
        take: 8
      },
      worklogs: {
        where: { visibility: "PUBLIC", deletedAt: null },
        include: { project: { select: { title: true } }, workspace: { select: { brandName: true, name: true } } },
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        take: 8
      }
    }
  });
  if (!profile) notFound();

  const name = profile.user.name || username;
  const isPublicCv = profile.liveCvEnabled && profile.liveCvVisibility === "PUBLIC";
  const skills = [...profile.specialties, ...profile.equipment, ...profile.software].slice(0, 14);

  return (
    <>
      <TerraqoPublicHeader />
      <main className="min-h-screen bg-[#f7faf7] text-[#11252c]">
        <section className="relative isolate overflow-hidden border-b bg-[#12100d] text-white">
          <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(circle_at_20%_25%,rgba(30,184,171,0.35),transparent_30%),radial-gradient(circle_at_75%_10%,rgba(179,91,52,0.34),transparent_28%)]" />
          <div className="container relative grid gap-8 py-16 lg:grid-cols-[1fr_360px] lg:py-24">
            <div className="flex flex-col gap-7 sm:flex-row sm:items-center">
              <UserAvatar name={name} image={profile.user.image} size="xl" />
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="font-display text-4xl font-bold md:text-6xl">{name}</h1>
                  {profile.identityVerificationStatus === "VERIFIED" ? <Badge className="bg-primary/20 text-[#8bf2e9]"><BadgeCheck className="mr-1 h-4 w-4" /> Identidad verificada</Badge> : null}
                </div>
                <p className="mt-3 text-xl font-semibold text-[#72e7dd]">{profile.headline || "Profesional Terraqo"}</p>
                <p className="mt-4 flex flex-wrap gap-3 text-white/68"><span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{profile.city || "Ubicacion por completar"}</span><span>{profile.yearsExperience ?? 0} anos de experiencia</span></p>
              </div>
            </div>
            <Card className="border-white/15 bg-white/8 text-white backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#72e7dd]" /> CV vivo Terraqo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm leading-7 text-white/72">
                <p>{isPublicCv ? "Perfil publico construido con experiencias y bitacoras profesionales autorizadas." : "Este profesional activo aun no habilito la visibilidad publica completa del CV vivo."}</p>
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#72e7dd]">@{profile.username}</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="container grid gap-7 py-12 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="space-y-7">
            <Card>
              <CardHeader><CardTitle>Resumen profesional</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <p className="leading-8 text-muted-foreground">{profile.bio || "Perfil profesional con informacion en proceso de actualizacion."}</p>
                <div className="flex flex-wrap gap-2">
                  {profile.professionalCategories.map((category) => <Badge key={category} variant="secondary">{category}</Badge>)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Herramientas y especialidades</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {skills.map((skill) => <span key={skill} className="inline-flex items-center gap-1 rounded-md border bg-white px-3 py-1.5 text-sm font-semibold"><Wrench className="h-3.5 w-3.5 text-primary" />{skill}</span>)}
                {!skills.length ? <p className="text-sm text-muted-foreground">Herramientas pendientes de completar.</p> : null}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-7">
            <Card>
              <CardHeader><CardTitle>Experiencia validable</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {profile.experiences.map((experience) => (
                  <article key={experience.id} className="rounded-lg border p-5">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div>
                        <p className="font-display text-xl font-bold">{experience.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{experience.companyName || "Empresa no publica"} | {experience.role || "Rol profesional"}</p>
                        {experience.project ? <p className="mt-2 text-sm font-semibold text-primary">Proyecto: {experience.project.title}</p> : null}
                      </div>
                      {experience.verifiedByTerraqo ? <Badge><BadgeCheck className="mr-1 h-4 w-4" /> Validada</Badge> : null}
                    </div>
                    {experience.verificationNote ? <p className="mt-4 text-sm leading-7 text-muted-foreground">{experience.verificationNote}</p> : null}
                  </article>
                ))}
                {!profile.experiences.length ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Este CV aun no tiene experiencias publicas.</p> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Trabajo documentado</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {profile.worklogs.map((worklog) => (
                  <article key={worklog.id} className="rounded-lg border p-5">
                    <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">{new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(worklog.occurredAt)}</p>
                    <h2 className="mt-2 font-display text-xl font-bold">{worklog.title}</h2>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{worklog.summary}</p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      {worklog.project ? <span className="rounded-md bg-primary/10 px-2.5 py-1 font-semibold text-primary"><BriefcaseBusiness className="mr-1 inline h-3.5 w-3.5" />{worklog.project.title}</span> : null}
                      <span className="rounded-md bg-muted px-2.5 py-1 font-semibold"><NotebookPen className="mr-1 inline h-3.5 w-3.5" />{worklog.evidenceStatus}</span>
                    </div>
                  </article>
                ))}
                {!profile.worklogs.length ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Este CV aun no tiene bitacoras publicas.</p> : null}
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="container pb-14">
          <Link href="/" className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-3 text-sm font-bold text-primary hover:bg-primary/10">Conocer Terraqo <ExternalLink className="h-4 w-4" /></Link>
        </section>
      </main>
      <TerraqoPublicFooter />
    </>
  );
}
