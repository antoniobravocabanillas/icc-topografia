import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, Building2, FolderKanban, UsersRound } from "lucide-react";
import { WorklogCard } from "@/components/terraqo/worklog-card";
import { prisma } from "@/lib/prisma";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";
import { visibleWorklogWhere, worklogInclude } from "@/lib/terraqo/worklog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ slug: string }> };

export default async function CompanyProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const { session, memberships } = await requireProfessionalPortal();
  const viewerWorkspaceIds = memberships.map((membership) => membership.workspaceId);
  const workspace = await prisma.terraqoWorkspace.findFirst({
    where: { slug, active: true, deletedAt: null, modules: { some: { code: "PROFESSIONAL_NETWORK", active: true } } },
    select: { id: true, slug: true, name: true, brandName: true, logoUrl: true, description: true, industry: true, domain: true }
  });
  if (!workspace) notFound();
  const member = viewerWorkspaceIds.includes(workspace.id);

  const [projects, jobs, affiliations, worklogs] = await Promise.all([
    prisma.project.findMany({ where: { terraqoWorkspaceId: workspace.id, isPublic: true, deletedAt: null }, select: { id: true, title: true, slug: true, summary: true, category: true }, orderBy: { updatedAt: "desc" }, take: 12 }),
    prisma.terraqoJobPost.findMany({ where: { workspaceId: workspace.id, status: "OPEN", deletedAt: null, visibility: { in: member ? ["PUBLIC", "COMMUNITY", "WORKSPACE"] : ["PUBLIC", "COMMUNITY"] } }, select: { id: true, title: true, summary: true, location: true, modality: true }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.terraqoProfessionalAffiliation.findMany({
      where: { workspaceId: workspace.id, current: true, visibility: { in: member ? ["PUBLIC", "COMMUNITY", "WORKSPACE"] : ["PUBLIC", "COMMUNITY"] } },
      include: { professionalProfile: { include: { user: { select: { name: true } } } } },
      orderBy: { updatedAt: "desc" }, take: 16
    }),
    prisma.terraqoWorklogEntry.findMany({ where: { workspaceId: workspace.id, ...visibleWorklogWhere(session.user.id, viewerWorkspaceIds) }, include: worklogInclude, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], take: 10 })
  ]);

  return (
    <div className="min-w-0 space-y-8 py-6 lg:py-8">
        <header className="rounded-lg border bg-[#03111D] p-8 text-white shadow-xl md:p-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7DE4FF]">Empresa Terraqo</p><h1 className="mt-4 font-display text-4xl font-bold md:text-5xl">{workspace.brandName || workspace.name}</h1><p className="mt-3 text-lg text-white/65">{workspace.industry || "Organizacion profesional"}</p><p className="mt-5 max-w-3xl leading-7 text-white/72">{workspace.description || "Perfil empresarial conectado a proyectos, oportunidades y profesionales en Terraqo."}</p></div>
            {workspace.domain ? <a href={`https://${workspace.domain}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/20 px-4 text-sm font-semibold hover:bg-white/10">Visitar sitio <ArrowRight className="h-4 w-4" /></a> : null}
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-3"><Metric icon={FolderKanban} value={projects.length} label="Proyectos publicos" /><Metric icon={BriefcaseBusiness} value={jobs.length} label="Oportunidades abiertas" /><Metric icon={UsersRound} value={affiliations.length} label="Profesionales visibles" /></div>

        {jobs.length ? <section><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Terraqo Market</p><h2 className="mt-2 font-display text-3xl font-bold">Oportunidades abiertas</h2><div className="mt-5 grid gap-4 lg:grid-cols-2">{jobs.map((job) => <article key={job.id} className="rounded-lg border bg-white p-5 shadow-technical"><h3 className="font-display text-xl font-bold">{job.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{job.summary}</p><Link href="/portal/oportunidades" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">Ver oportunidad <ArrowRight className="h-4 w-4" /></Link></article>)}</div></section> : null}

        {affiliations.length ? <section><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Equipo visible</p><h2 className="mt-2 font-display text-3xl font-bold">Profesionales vinculados</h2><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{affiliations.map((affiliation) => <Link key={affiliation.id} href={`/portal/profesionales/${affiliation.professionalProfileId}`} className="rounded-lg border bg-white p-4 shadow-technical hover:border-primary"><Building2 className="h-5 w-5 text-primary" /><strong className="mt-4 block">{affiliation.professionalProfile.user.name || "Profesional Terraqo"}</strong><span className="text-sm text-muted-foreground">{affiliation.roleTitle || "Rol profesional"}</span></Link>)}</div></section> : null}

        {projects.length ? <section><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Proyectos</p><h2 className="mt-2 font-display text-3xl font-bold">Trabajo de la empresa</h2><div className="mt-5 grid gap-4 lg:grid-cols-3">{projects.map((project) => <article key={project.id} className="rounded-lg border bg-white p-5 shadow-technical"><span className="text-xs font-bold uppercase text-primary">{project.category || "Proyecto"}</span><h3 className="mt-2 font-display text-xl font-bold">{project.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{project.summary}</p></article>)}</div></section> : null}

        {worklogs.length ? <section><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Evidencia reciente</p><h2 className="mt-2 font-display text-3xl font-bold">Trabajo vinculado</h2><div className="mt-5 grid gap-5 xl:grid-cols-2">{worklogs.map((worklog) => <WorklogCard key={worklog.id} worklog={worklog} viewerId={session.user.id} />)}</div></section> : null}
    </div>
  );
}

function Metric({ icon: Icon, value, label }: { icon: typeof FolderKanban; value: number; label: string }) {
  return <div className="rounded-lg border bg-white p-5 shadow-technical"><Icon className="h-5 w-5 text-primary" /><strong className="mt-4 block font-display text-3xl">{value}</strong><span className="text-sm text-muted-foreground">{label}</span></div>;
}
