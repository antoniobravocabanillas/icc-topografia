import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Building2, MapPin } from "lucide-react";
import { ProfessionalPortalNav } from "@/components/terraqo/professional-portal-nav";
import { WorklogCard } from "@/components/terraqo/worklog-card";
import { prisma } from "@/lib/prisma";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";
import { visibleWorklogWhere, worklogInclude } from "@/lib/terraqo/worklog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ id: string }> };

export default async function ProfessionalProfilePage({ params }: PageProps) {
  const { id } = await params;
  const { session, memberships } = await requireProfessionalPortal();
  const viewerWorkspaceIds = memberships.map((membership) => membership.workspaceId);
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, image: true } },
      affiliations: { include: { workspace: { select: { slug: true } } }, orderBy: [{ current: "desc" }, { updatedAt: "desc" }] },
      experiences: { include: { project: { select: { title: true, slug: true } } }, orderBy: { startedAt: "desc" } }
    }
  });
  if (!profile) notFound();

  const owner = profile.userId === session.user.id;
  const sharedWorkspace = profile.affiliations.some((affiliation) => viewerWorkspaceIds.includes(affiliation.workspaceId));
  if (!owner && profile.visibility === "PRIVATE") notFound();
  if (!owner && profile.visibility === "WORKSPACE" && !sharedWorkspace) notFound();

  const worklogs = await prisma.terraqoWorklogEntry.findMany({
    where: { professionalProfileId: profile.id, ...visibleWorklogWhere(session.user.id, viewerWorkspaceIds) },
    include: worklogInclude,
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 30
  });
  const visibleExperiences = profile.experiences.filter((experience) => owner || experience.visibility === "PUBLIC" || experience.visibility === "COMMUNITY" || (experience.visibility === "WORKSPACE" && sharedWorkspace));
  const visibleAffiliations = profile.affiliations.filter((affiliation) => owner || affiliation.visibility === "PUBLIC" || affiliation.visibility === "COMMUNITY" || (affiliation.visibility === "WORKSPACE" && viewerWorkspaceIds.includes(affiliation.workspaceId)));

  return (
    <section className="bg-[#f6fbff] py-10 md:py-14">
      <div className="container space-y-8">
        <ProfessionalPortalNav current="" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-lg border bg-[#03111D] p-7 text-white shadow-xl md:p-9">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7DE4FF]">Perfil Terraqo</p>
            <h1 className="mt-4 font-display text-4xl font-bold md:text-5xl">{profile.user.name || "Profesional Terraqo"}</h1>
            <p className="mt-3 text-lg text-white/72">{profile.headline || "Perfil profesional"}</p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm text-white/68"><span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-[#24C8EE]" />{profile.city || "Ubicacion privada"}</span><span>{profile.yearsExperience ?? 0} anos de experiencia</span>{profile.identityVerificationStatus === "VERIFIED" ? <span className="flex items-center gap-2 text-[#7DE4FF]"><BadgeCheck className="h-4 w-4" />Identidad validada</span> : null}</div>
            {profile.bio ? <p className="mt-6 max-w-3xl leading-7 text-white/70">{profile.bio}</p> : null}
          </div>
          <aside className="rounded-lg border bg-white p-6 shadow-technical">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Disponibilidad</p>
            <p className="mt-2 font-display text-2xl font-bold">{profile.status.replaceAll("_", " ")}</p>
            <div className="mt-5 flex flex-wrap gap-2">{[...profile.professionalCategories, ...profile.specialties].map((item) => <span key={item} className="rounded-md bg-muted px-2.5 py-1 text-xs font-semibold">{item}</span>)}</div>
            {owner ? <Link href="/portal" className="mt-6 inline-flex text-sm font-semibold text-primary hover:underline">Editar desde mi resumen</Link> : null}
          </aside>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border bg-white p-6 shadow-technical"><h2 className="font-display text-2xl font-bold">Experiencia visible</h2><div className="mt-5 space-y-3">{visibleExperiences.map((experience) => <div key={experience.id} className="border-t pt-3"><strong>{experience.title}</strong><p className="text-sm text-muted-foreground">{experience.companyName || experience.project?.title || "Proyecto profesional"} {experience.verifiedByTerraqo ? " | Validada" : ""}</p></div>)}{!visibleExperiences.length ? <p className="text-sm text-muted-foreground">No hay experiencias visibles para tu perfil.</p> : null}</div></div>
          <div className="rounded-lg border bg-white p-6 shadow-technical"><h2 className="font-display text-2xl font-bold">Vinculos empresariales</h2><div className="mt-5 space-y-3">{visibleAffiliations.map((affiliation) => <Link key={affiliation.id} href={`/portal/empresas/${affiliation.workspace.slug}`} className="flex items-center gap-3 border-t pt-3"><Building2 className="h-4 w-4 text-primary" /><span><strong className="block">{affiliation.companyName}</strong><span className="text-sm text-muted-foreground">{affiliation.roleTitle || "Rol profesional"}</span></span></Link>)}{!visibleAffiliations.length ? <p className="text-sm text-muted-foreground">No hay vinculos visibles para tu perfil.</p> : null}</div></div>
        </div>

        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Bitacora verificable</p><h2 className="mt-2 font-display text-3xl font-bold">Trabajo documentado</h2></div>
        <div className="grid gap-5 xl:grid-cols-2">{worklogs.map((worklog) => <WorklogCard key={worklog.id} worklog={worklog} viewerId={session.user.id} />)}</div>
        {!worklogs.length ? <p className="rounded-lg border bg-white p-8 text-center text-muted-foreground">Este perfil aun no comparte evidencia contigo.</p> : null}
      </div>
    </section>
  );
}
