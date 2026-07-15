import Link from "next/link";
import { BriefcaseBusiness, Building2, MapPin } from "lucide-react";
import { OpportunityApplyButton } from "@/components/terraqo/opportunity-apply-button";
import { ProfessionalPortalNav } from "@/components/terraqo/professional-portal-nav";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { prisma } from "@/lib/prisma";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OpportunitiesPage() {
  const { profile, memberships } = await requireProfessionalPortal();
  const workspaceIds = memberships.map((membership) => membership.workspaceId);
  const jobs = await prisma.terraqoJobPost.findMany({
    where: {
      status: "OPEN",
      deletedAt: null,
      workspace: { active: true, modules: { some: { code: "JOB_MARKETPLACE", active: true } } },
      OR: [
        { visibility: { in: ["PUBLIC", "COMMUNITY"] } },
        ...(workspaceIds.length ? [{ visibility: "WORKSPACE" as const, workspaceId: { in: workspaceIds } }] : [])
      ]
    },
    include: {
      workspace: { select: { slug: true, name: true, brandName: true } },
      project: { select: { title: true } },
      applications: { where: { professionalProfileId: profile.id }, select: { id: true, status: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 60
  });

  return (
    <section className="bg-[#f6fbff] py-10 md:py-14">
      <div className="container space-y-8">
        <ProfessionalPortalNav current="/portal/oportunidades" />
        <PortalPageHeading eyebrow="Terraqo Market" title="Oportunidades con contexto real." description="Explora empleos, proyectos y retos publicados por empresas Terraqo. Postula con un perfil respaldado por tu Bitacora y tu CV vivo." />

        <div className="grid gap-5 lg:grid-cols-2">
          {jobs.map((job) => (
            <article key={job.id} className="flex flex-col rounded-lg border bg-white p-6 shadow-technical">
              <div className="flex items-start justify-between gap-4">
                <span className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary"><BriefcaseBusiness className="h-5 w-5" /></span>
                <span className="rounded-md border px-2 py-1 text-xs font-semibold">{job.modality || "Modalidad por coordinar"}</span>
              </div>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-primary">{job.project ? `Proyecto: ${job.project.title}` : "Oportunidad profesional"}</p>
              <h2 className="mt-2 font-display text-2xl font-bold">{job.title}</h2>
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Building2 className="h-4 w-4" /><Link href={`/portal/empresas/${job.workspace.slug}`} className="hover:text-primary">{job.workspace.brandName || job.workspace.name}</Link></p>
              {job.location ? <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{job.location}</p> : null}
              <p className="mt-5 flex-1 text-sm leading-6 text-muted-foreground">{job.summary}</p>
              <div className="my-5 flex flex-wrap gap-2">{[...job.requiredSkills, ...job.requiredTools].slice(0, 8).map((item) => <span key={item} className="rounded-md bg-muted px-2.5 py-1 text-xs font-semibold">{item}</span>)}</div>
              <OpportunityApplyButton jobId={job.id} applied={Boolean(job.applications.length)} />
            </article>
          ))}
        </div>
        {!jobs.length ? <p className="rounded-lg border bg-white p-8 text-center text-muted-foreground">No hay oportunidades abiertas en este momento.</p> : null}
      </div>
    </section>
  );
}
